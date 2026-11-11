import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth-middleware";
import { createBackupCodes, normalizeBackupCode } from "./backup-codes";
import { sha256, writeAuditLog } from "./identity.server";

export const getBackupCodeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: user, error: authError } = await context.supabase.auth.getUser();
    if (authError || user.user?.id !== context.userId) throw new Error("Please sign in again.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { count, error } = await db.from("account_backup_codes").select("id", { count: "exact", head: true })
      .eq("user_id", context.userId).is("used_at", null);
    if (error) throw new Error("Could not load backup codes.");
    return { remaining: count ?? 0 };
  });

export const generateBackupCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: user, error: authError } = await context.supabase.auth.getUser();
    if (authError || user.user?.id !== context.userId) throw new Error("Please sign in again.");
    const { data: factors, error: factorError } = await context.supabase.auth.mfa.listFactors();
    if (factorError) throw new Error("Could not check your authenticator.");
    if (factors.all.some((f) => f.status === "verified") && context.claims.aal !== "aal2") {
      throw new Error("Verify your authenticator code before generating backup codes.");
    }
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const codes = createBackupCodes();
    const { error } = await db.rpc("replace_account_backup_codes", {
      p_user: context.userId, p_hashes: codes.map((code) => sha256(normalizeBackupCode(code))),
    });
    if (error) throw new Error("Could not generate backup codes.");
    await writeAuditLog({ userId: context.userId, eventType: "security.backup_codes_generated", category: "security", description: "Generated new backup codes; previous codes invalidated" });
    return { codes };
  });

export const recoverWithBackupCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: z.string().trim().email().max(254), code: z.string().max(100) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    for (const bucket of [`ip:${getRequestIP({ xForwardedFor: true }) ?? "unknown"}`, `email:${email}`]) {
      const { data: allowed, error } = await db.rpc("allow_account_recovery_attempt", { p_bucket: sha256(bucket) });
      if (error || !allowed) throw new Error("Too many recovery attempts. Try again in 15 minutes.");
    }
    const invalid = "The email or backup code is incorrect, or the code has already been used.";
    const normalized = normalizeBackupCode(data.code);
    if (!/^[A-F0-9]{32}$/.test(normalized)) throw new Error(invalid);
    const hash = sha256(normalized);
    const { data: row, error: lookupError } = await db.from("account_backup_codes").select("user_id")
      .eq("code_hash", hash).is("used_at", null).maybeSingle();
    if (lookupError || !row) throw new Error(invalid);
    const { data: user, error: userError } = await db.auth.admin.getUserById(row.user_id);
    if (userError || user.user?.email?.toLowerCase() !== email) throw new Error(invalid);
    const { data: owner, error: consumeError } = await db.rpc("consume_account_backup_code", { p_hash: hash });
    if (consumeError || owner !== row.user_id) throw new Error(invalid);
    // No privileged account change happens until the one-time code is claimed.
    const { data: factors, error: factorError } = await db.auth.admin.mfa.listFactors({ userId: owner });
    if (factorError) throw new Error("Recovery code was used, but recovery could not finish. Try another backup code.");
    for (const factor of factors.factors) {
      const { error } = await db.auth.admin.mfa.deleteFactor({ userId: owner, id: factor.id });
      if (error) throw new Error("Recovery code was used, but recovery could not finish. Try another backup code.");
    }
    const { error: passkeyError } = await db.from("passkeys").delete().eq("user_id", owner);
    if (passkeyError) throw new Error("Recovery code was used, but recovery could not finish. Try another backup code.");
    await writeAuditLog({ userId: owner, eventType: "auth.backup_code_recovery", category: "security", status: "warning", description: "Account recovered with a one-time backup code; passkeys and authenticators reset" });
    const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link.properties?.hashed_token) throw new Error("Recovery code was used. Sign in or use email recovery to finish.");
    return { tokenHash: link.properties.hashed_token };
  });