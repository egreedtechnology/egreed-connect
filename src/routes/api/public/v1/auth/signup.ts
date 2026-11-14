import { createFileRoute } from "@tanstack/react-router";

/** Custom-form sign-up for businesses. Needs an API key with users:write. */
export const Route = createFileRoute("/api/public/v1/auth/signup")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/oauth.server")).corsPreflight(),
      POST: async ({ request }) =>
        (await import("@/lib/headless-auth.server")).handleHeadlessSignup(request),
    },
  },
});
