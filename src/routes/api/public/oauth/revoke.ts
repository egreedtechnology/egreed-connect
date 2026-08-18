import { createFileRoute } from "@tanstack/react-router";

/** RFC 7009 token revocation. Always returns 200 for valid client auth. */
export const Route = createFileRoute("/api/public/oauth/revoke")({
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
        if (!client || !oauth.clientSecretValid(client, clientSecret)) {
          return oauth.oauthError("invalid_client", "Client authentication failed.", 401);
        }

        const token = params["token"];
        if (!token) return oauth.oauthError("invalid_request", "token is required.");
        const hash = oauth.sha256hex(token);
        const revokedAt = new Date().toISOString();

        await supabaseAdmin
          .from("oauth_tokens")
          .update({ revoked_at: revokedAt })
          .eq("client_id", client.client_id)
          .eq("access_token_hash", hash)
          .is("revoked_at", null);

        await supabaseAdmin
          .from("oauth_tokens")
          .update({ revoked_at: revokedAt })
          .eq("client_id", client.client_id)
          .eq("refresh_token_hash", hash)
          .is("revoked_at", null);

        return oauth.jsonResponse({ revoked: true });
      },
    },
  },
});
