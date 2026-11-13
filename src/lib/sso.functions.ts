import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/auth-middleware";
import { writeAuditLog } from "@/lib/identity.server";

export type LauncherApp = {
  clientId: string;
  name: string;
  description: string | null;
  homepageUrl: string | null;
  logoUrl: string | null;
  lastUsed: string;
};

/** EGREED apps the user has approved, for the app launcher. */
export const listLauncherApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LauncherApp[]> => {
    const { data: consents } = await context.supabase
      .from("oauth_consents")
      .select("client_id, updated_at")
      .order("updated_at", { ascending: false });
    const ids = (consents ?? []).map((c) => c.client_id);
    if (!ids.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: clients } = await supabaseAdmin
      .from("oauth_clients")
      .select("client_id, name, description, homepage_url, logo_url, is_active")
      .in("client_id", ids);
    return (consents ?? []).flatMap((c) => {
      const app = clients?.find((x) => x.client_id === c.client_id && x.is_active);
      if (!app) return [];
      const safe = (u: string | null) => (u && /^https:\/\//.test(u) ? u : null);
      return [{
        clientId: app.client_id,
        name: app.name,
        description: app.description,
        homepageUrl: safe(app.homepage_url),
        logoUrl: safe(app.logo_url),
        lastUsed: c.updated_at,
      }];
    });
  });

/** Global sign-out: revokes every app token and signs out every device. */
export const signOutEverywhere = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("oauth_tokens")
      .update({ revoked_at: now })
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    await supabaseAdmin
      .from("trusted_devices")
      .update({ signout_requested_at: now })
      .eq("user_id", context.userId);
    await writeAuditLog({
      userId: context.userId,
      eventType: "session.global_signout",
      category: "security",
      status: "warning",
      description: "Signed out of all EGREED apps and devices",
    });
    return { ok: true };
  });

/** Validates an OIDC logout redirect against the app's registered addresses. */
export const checkLogoutRedirect = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ clientId: z.string().max(200).optional(), redirect: z.string().max(500) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ allowed: boolean }> => {
    if (!data.clientId) return { allowed: false };
    let target: URL;
    try { target = new URL(data.redirect); } catch { return { allowed: false }; }
    const local = target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname);
    if (target.protocol !== "https:" && !local) return { allowed: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app } = await supabaseAdmin
      .from("oauth_clients")
      .select("redirect_uris, homepage_url, allow_any_redirect, is_active")
      .eq("client_id", data.clientId)
      .maybeSingle();
    if (!app?.is_active) return { allowed: false };
    if (app.allow_any_redirect) return { allowed: true };
    const origins = [...app.redirect_uris, app.homepage_url ?? ""].flatMap((u) => {
      try { return [new URL(u).origin]; } catch { return []; }
    });
    return { allowed: origins.includes(target.origin) };
  });
