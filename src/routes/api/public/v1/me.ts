import { createFileRoute } from "@tanstack/react-router";

/**
 * Identity REST endpoint for external platforms.
 *
 * Accepts either an OAuth 2.1 access token (user context) or a scoped API key
 * (`Authorization: Bearer egr_live_...` / `X-API-Key`, owner context).
 *
 * GET   requires identity:read (or the OAuth `profile` scope)
 * PATCH requires identity:write
 */
export const Route = createFileRoute("/api/public/v1/me")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/oauth.server");
        return corsPreflight();
      },
      GET: async ({ request }) => {
        const { handleMeGet } = await import("@/lib/oauth-handlers.server");
        return handleMeGet(request);
      },
      PATCH: async ({ request }) => {
        const { handleMePatch } = await import("@/lib/oauth-handlers.server");
        return handleMePatch(request);
      },
    },
  },
});
