import { createFileRoute } from "@tanstack/react-router";

/**
 * Identity REST endpoint for external platforms.
 *
 * Accepts either an OAuth 2.1 access token (user context) or a scoped API key
 * (`Authorization: Bearer egr_live_...` / `X-API-Key`, owner context).
 */
export const Route = createFileRoute("/api/public/v1/me")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/oauth.server");
        return corsPreflight();
      },
      GET: async ({ request }) => {
        const oauth = await import("@/lib/oauth.server");

        const token = await oauth.authenticateBearer(request);
        if (token) {
          if (!token.userId) {
            return oauth.oauthError(
              "invalid_token",
              "This token has no user context. Use an authorization_code token.",
              403,
            );
          }
          if (!oauth.requireScope(token.scopes, "identity:read") && !oauth.requireScope(token.scopes, "profile")) {
            return oauth.oauthError("insufficient_scope", "identity:read scope required.", 403);
          }
          const claims = await oauth.userinfoClaims(token.userId, [
            ...new Set([...token.scopes, "profile"]),
          ]);
          return oauth.jsonResponse({
            authenticated_via: "oauth_token",
            client_id: token.clientId,
            scopes: token.scopes,
            identity: claims,
          });
        }

        const apiKey = await oauth.authenticateApiKey(request);
        if (apiKey) {
          if (!oauth.requireScope(apiKey.scopes, "identity:read")) {
            return oauth.oauthError("insufficient_scope", "identity:read scope required.", 403);
          }
          const claims = await oauth.userinfoClaims(apiKey.ownerId, [
            "profile",
            "email",
            ...apiKey.scopes,
          ]);
          return oauth.jsonResponse({
            authenticated_via: "api_key",
            environment: apiKey.environment,
            scopes: apiKey.scopes,
            identity: claims,
          });
        }

        return oauth.oauthError(
          "invalid_token",
          "Provide an OAuth access token or an EGREED API key.",
          401,
          { "www-authenticate": 'Bearer realm="EGREED Identity"' },
        );
      },
    },
  },
});
