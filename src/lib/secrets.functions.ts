import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth-middleware";

const SECRETS = [
  { name: "SUPABASE_URL", purpose: "Address of the identity database and sign-in service.", sensitive: false },
  { name: "SUPABASE_PUBLISHABLE_KEY", purpose: "Public key used by browsers and servers to reach sign-in.", sensitive: false },
  { name: "SUPABASE_SERVICE_ROLE_KEY", purpose: "Privileged server key for token issuing and admin work.", sensitive: true },
  { name: "LOVABLE_API_KEY", purpose: "Powers the AI setup assistant.", sensitive: true },
  { name: "EGREED_ISSUER", purpose: "Optional override of the public OIDC issuer address.", sensitive: false },
] as const;

/** Lists secret names and whether they are configured. Values are never returned. */
export const listProjectSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () =>
    SECRETS.map((s) => ({ ...s, configured: Boolean(process.env[s.name]) })),
  );
