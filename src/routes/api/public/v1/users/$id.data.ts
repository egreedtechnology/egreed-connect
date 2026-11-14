import { createFileRoute } from "@tanstack/react-router";

/** Business-owned data for a person. GET needs users:read, PUT needs users:write. */
export const Route = createFileRoute("/api/public/v1/users/$id/data")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/oauth.server")).corsPreflight(),
      GET: async ({ request, params }) =>
        (await import("@/lib/headless-auth.server")).handleUserDataGet(request, params.id),
      PUT: async ({ request, params }) =>
        (await import("@/lib/headless-auth.server")).handleUserDataPut(request, params.id),
    },
  },
});
