import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth-middleware";

const SECRETS = [
  { name: "SUPABASE_URL", purpose: "Address of the identity database and sign-in service.", sensitive: false },
  { name: "SUPABASE_PUBLISHABLE_KEY", purpose: "Public key used by browsers and servers to reach sign-in.", sensitive: false },
  { name: "SUPABASE_SERVICE_ROLE_KEY", purpose: "Privileged server key for token issuing and admin work.", sensitive: true },
  { name: "LOVABLE_API_KEY", purpose: "Powers the AI setup assistant.", sensitive: true },
  { name: "EGREED_ISSUER", purpose: "Optional override of the public OIDC issuer address.", sensitive: false },
] as const;

/**
 * Lists secret names and whether they are configured.
 * Non-sensitive values are returned so developers can copy them into their own
 * apps; sensitive values are NEVER returned — only a masked placeholder.
 */
export const listProjectSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () =>
    SECRETS.map((s) => {
      const value = process.env[s.name];
      return {
        ...s,
        configured: Boolean(value),
        value: s.sensitive ? null : (value ?? null),
        maskedValue: value ? "•".repeat(16) : null,
      };
    }),
  );
