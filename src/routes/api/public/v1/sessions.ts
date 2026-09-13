import { createFileRoute } from "@tanstack/react-router";

/**
 * Known devices for the authenticated subject.
 * GET requires `sessions:read`; DELETE ?device_id= requires `sessions:revoke`.
 */
export const Route = createFileRoute("/api/public/v1/sessions")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/oauth.server");
        return corsPreflight();
      },
      GET: async ({ request }) => {
        const { handleSessionsGet } = await import("@/lib/oauth-handlers.server");
        return handleSessionsGet(request);
      },
      DELETE: async ({ request }) => {
        const { handleSessionsDelete } = await import("@/lib/oauth-handlers.server");
        return handleSessionsDelete(request);
      },
    },
  },
});
