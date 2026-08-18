import { createFileRoute } from "@tanstack/react-router";

/**
 * OAuth 2.1 token endpoint.
 *
 * Grants: authorization_code (with PKCE), refresh_token (rotating),
 * client_credentials (machine-to-machine, no user context).
 */
export const Route = createFileRoute("/api/public/oauth/token")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/oauth.server");
        return corsPreflight();
      },
      POST: async ({ request }) => {
        const oauth = await import("@/lib/oauth.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const issuer = oauth.issuerFromRequest(request);
        const params = await oauth.readRequestParams(request);

        const { clientId, clientSecret } = oauth.readClientCredentials(request, params);
        if (!clientId) return oauth.oauthError("invalid_client", "client_id is required", 401);

        const client = await oauth.findClient(clientId);
        if (!client || !client.is_active) {
          return oauth.oauthError("invalid_client", "Unknown or disabled client.", 401);
        }
        if (!oauth.clientSecretValid(client, clientSecret)) {
          return oauth.oauthError("invalid_client", "Client authentication failed.", 401);
        }

        const grantType = params["grant_type"];

        /* ------------------------------------------- authorization_code ---- */
        if (grantType === "authorization_code") {
          const code = params["code"];
          const redirectUri = params["redirect_uri"];
          if (!code || !redirectUri) {
            return oauth.oauthError("invalid_request", "code and redirect_uri are required.");
          }

          const { data: row } = await supabaseAdmin
            .from("oauth_authorization_codes")
            .select("id, client_id, user_id, redirect_uri, scopes, nonce, code_challenge, code_challenge_method, expires_at, used_at")
            .eq("code_hash", oauth.sha256hex(code))
            .maybeSingle();

          if (!row || row.client_id !== client.client_id) {
            return oauth.oauthError("invalid_grant", "Authorization code is not valid.");
          }
          if (row.used_at) {
            // Replay: revoke everything previously issued from this code path.
            await supabaseAdmin
              .from("oauth_tokens")
              .update({ revoked_at: new Date().toISOString() })
              .eq("client_id", client.client_id)
              .eq("user_id", row.user_id)
              .is("revoked_at", null);
            return oauth.oauthError("invalid_grant", "Authorization code was already used.");
          }
          if (new Date(row.expires_at).getTime() < Date.now()) {
            return oauth.oauthError("invalid_grant", "Authorization code has expired.");
          }
          if (row.redirect_uri !== redirectUri) {
            return oauth.oauthError("invalid_grant", "redirect_uri does not match the code.");
          }
          if (
            !oauth.verifyPkce(
              params["code_verifier"],
              row.code_challenge,
              row.code_challenge_method,
            )
          ) {
            return oauth.oauthError("invalid_grant", "PKCE verification failed.");
          }
          if (client.client_type === "public" && !row.code_challenge) {
            return oauth.oauthError("invalid_grant", "PKCE is required for public clients.");
          }

          await supabaseAdmin
            .from("oauth_authorization_codes")
            .update({ used_at: new Date().toISOString() })
            .eq("id", row.id);

          const tokens = await oauth.issueTokens({
            clientId: client.client_id,
            userId: row.user_id,
            scopes: row.scopes ?? [],
            grantType: "authorization_code",
            issuer,
            nonce: row.nonce,
          });
          return oauth.jsonResponse(tokens);
        }

        /* -------------------------------------------------- refresh_token -- */
        if (grantType === "refresh_token") {
          const refreshToken = params["refresh_token"];
          if (!refreshToken) {
            return oauth.oauthError("invalid_request", "refresh_token is required.");
          }
          const { data: row } = await supabaseAdmin
            .from("oauth_tokens")
            .select("id, client_id, user_id, scopes, refresh_expires_at, revoked_at")
            .eq("refresh_token_hash", oauth.sha256hex(refreshToken))
            .maybeSingle();

          if (!row || row.client_id !== client.client_id || row.revoked_at) {
            return oauth.oauthError("invalid_grant", "Refresh token is not valid.");
          }
          if (row.refresh_expires_at && new Date(row.refresh_expires_at).getTime() < Date.now()) {
            return oauth.oauthError("invalid_grant", "Refresh token has expired.");
          }

          // Rotate: the presented refresh token is retired immediately.
          await supabaseAdmin
            .from("oauth_tokens")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", row.id);

          const requested = (params["scope"] ?? "").split(" ").filter(Boolean);
          const scopes =
            requested.length > 0
              ? requested.filter((scope) => (row.scopes ?? []).includes(scope))
              : (row.scopes ?? []);

          const tokens = await oauth.issueTokens({
            clientId: client.client_id,
            userId: row.user_id,
            scopes,
            grantType: "refresh_token",
            issuer,
          });
          return oauth.jsonResponse(tokens);
        }

        /* --------------------------------------------- client_credentials -- */
        if (grantType === "client_credentials") {
          if (client.client_type !== "confidential") {
            return oauth.oauthError(
              "unauthorized_client",
              "Only confidential clients may use client_credentials.",
            );
          }
          const requested = (params["scope"] ?? "").split(" ").filter(Boolean);
          const scopes = oauth.filterScopes(
            client,
            requested.length > 0 ? requested : [...client.scopes],
          ).filter((scope) => scope !== "openid" && scope !== "offline_access");

          const tokens = await oauth.issueTokens({
            clientId: client.client_id,
            userId: null,
            scopes,
            grantType: "client_credentials",
            issuer,
          });
          return oauth.jsonResponse(tokens);
        }

        return oauth.oauthError("unsupported_grant_type", `Unsupported grant_type: ${grantType}`);
      },
    },
  },
});
