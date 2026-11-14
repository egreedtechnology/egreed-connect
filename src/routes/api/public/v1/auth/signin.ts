import { createFileRoute } from "@tanstack/react-router";

/** Custom-form sign-in for businesses. Needs an API key with users:write. */
export const Route = createFileRoute("/api/public/v1/auth/signin")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/oauth.server")).corsPreflight(),
      POST: async ({ request }) =>
        (await import("@/lib/headless-auth.server")).handleHeadlessSignin(request),
    },
  },
});
