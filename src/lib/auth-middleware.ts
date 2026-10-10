/**
 * Signed-in user check for server functions.
 *
 * Same contract as the generated `requireSupabaseAuth`, but falls back to the
 * build-time VITE_* values when the runtime environment lacks SUPABASE_URL /
 * SUPABASE_PUBLISHABLE_KEY, so consent and sign-in from external apps never
 * fail on a missing variable.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function backendConfig() {
  const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Sign-in service is temporarily unavailable.");
  return { url: url as string, key: key as string };
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { url, key } = backendConfig();
    const header = getRequest()?.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) throw new Error("Unauthorized: please sign in again.");
    const token = header.slice(7);
    if (token.split(".").length !== 3) throw new Error("Unauthorized: Invalid token");

    const supabase = createClient<Database>(url, key, {
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) throw new Error("Unauthorized: Invalid token");

    return next({ context: { supabase, userId: data.claims.sub, claims: data.claims } });
  },
);
