import { createFileRoute } from "@tanstack/react-router";

/**
 * Security/account audit events for the authenticated subject, for SIEM
 * forwarding. Requires `audit:read`. Supports ?limit= (1-200) and ?since=ISO.
 */
export const Route = createFileRoute("/api/public/v1/audit")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/oauth.server");
        return corsPreflight();
      },
      GET: async ({ request }) => {
        const { handleAudit } = await import("@/lib/oauth-handlers.server");
        return handleAudit(request);
      },
    },
  },
});
