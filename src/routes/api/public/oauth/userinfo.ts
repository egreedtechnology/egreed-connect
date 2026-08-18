import { createFileRoute } from "@tanstack/react-router";

/** OIDC UserInfo endpoint — requires a Bearer access token with `openid`. */
export const Route = createFileRoute("/api/public/oauth/userinfo")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/oauth.server");
        return corsPreflight();
      },
      GET: async ({ request }) => handleUserinfo(request),
      POST: async ({ request }) => handleUserinfo(request),
    },
  },
});

async function handleUserinfo(request: Request): Promise<Response> {
  const oauth = await import("@/lib/oauth.server");
  const identity = await oauth.authenticateBearer(request);
  if (!identity) {
    return oauth.oauthError("invalid_token", "A valid access token is required.", 401, {
      "www-authenticate": 'Bearer error="invalid_token"',
    });
  }
  if (!identity.userId) {
    return oauth.oauthError(
      "invalid_token",
      "This token is not bound to a user.",
      403,
    );
  }
  const claims = await oauth.userinfoClaims(identity.userId, identity.scopes);
  return oauth.jsonResponse(claims);
}
