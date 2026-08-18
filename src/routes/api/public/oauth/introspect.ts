import { createFileRoute } from "@tanstack/react-router";

/** RFC 7662 token introspection. Requires client authentication. */
export const Route = createFileRoute("/api/public/oauth/introspect")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/oauth.server");
        return corsPreflight();
      },
      POST: async ({ request }) => {
        const oauth = await import("@/lib/oauth.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const params = await oauth.readRequestParams(request);
        const { clientId, clientSecret } = oauth.readClientCredentials(request, params);

        if (!clientId) return oauth.oauthError("invalid_client", "client_id is required", 401);
        const client = await oauth.findClient(clientId);
        if (!client || !client.is_active || !oauth.clientSecretValid(client, clientSecret)) {
          return oauth.oauthError("invalid_client", "Client authentication failed.", 401);
        }

        const token = params["token"];
        if (!token) return oauth.oauthError("invalid_request", "token is required.");

        const { data: row } = await supabaseAdmin
          .from("oauth_tokens")
          .select("client_id, user_id, scopes, expires_at, revoked_at, grant_type, created_at")
          .or(
            `access_token_hash.eq.${oauth.sha256hex(token)},refresh_token_hash.eq.${oauth.sha256hex(token)}`,
          )
          .maybeSingle();

        const active =
          Boolean(row) &&
          row!.client_id === client.client_id &&
          !row!.revoked_at &&
          new Date(row!.expires_at).getTime() > Date.now();

        if (!active) return oauth.jsonResponse({ active: false });

        return oauth.jsonResponse({
          active: true,
          client_id: row!.client_id,
          sub: row!.user_id,
          scope: (row!.scopes ?? []).join(" "),
          token_type: "Bearer",
          exp: Math.floor(new Date(row!.expires_at).getTime() / 1000),
          iat: Math.floor(new Date(row!.created_at).getTime() / 1000),
          grant_type: row!.grant_type,
        });
      },
    },
  },
});
