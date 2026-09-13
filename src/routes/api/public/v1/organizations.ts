import { createFileRoute } from "@tanstack/react-router";

/**
 * Organization memberships for the authenticated subject, so external systems
 * can mirror EGREED role assignments. Requires `organizations:read`.
 */
export const Route = createFileRoute("/api/public/v1/organizations")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/oauth.server");
        return corsPreflight();
      },
      GET: async ({ request }) => {
        const { handleOrganizations } = await import("@/lib/oauth-handlers.server");
        return handleOrganizations(request);
      },
    },
  },
});
