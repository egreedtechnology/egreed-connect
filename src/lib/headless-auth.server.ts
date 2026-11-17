/**
 * Headless sign-up / sign-in for businesses that use their own forms, plus
 * per-business user data storage. Server-to-server only: every call needs an
 * EGREED API key with the right scope. Brute force is throttled per IP and
 * per email through the persistent allow_account_recovery_attempt buckets.
 */
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import * as oauth from "./oauth.server";

const TOKEN_SCOPES = ["openid", "profile", "email", "offline_access", "identity:read"];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function ipOf(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("true-client-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function publicClient() {
  const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function allowAttempt(kind: string, request: Request, email: string): Promise<boolean> {
  const db = await admin();
  for (const bucket of [`${kind}:ip:${ipOf(request)}`, `${kind}:email:${email}`]) {
    const { data, error } = await db.rpc("allow_account_recovery_attempt", {
      p_bucket: oauth.sha256hex(bucket),
    });
    if (error || data !== true) return false;
  }
  return true;
}

async function readJson(request: Request, max = 16_384): Promise<unknown> {
  const text = await request.text();
  if (text.length > max) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const metadataSchema = z
  .record(z.string().max(64), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]))
  .refine((v) => Object.keys(v).length <= 50, "At most 50 fields.");

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(10).max(128),
  full_name: z.string().trim().max(120).optional(),
  metadata: metadataSchema.optional(),
});

const signinSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(128),
});

async function requireKey(request: Request, scope: string) {
  const auth = await oauth.requireApiAccess(request, [scope]);
  if (auth.error) return { error: auth.error };
  if (auth.principal.kind !== "api_key") {
    return {
      error: oauth.oauthError("invalid_client", "This endpoint needs your business API key.", 401),
    };
  }
  return { principal: auth.principal };
}

async function linkUser(businessId: string, userId: string, metadata?: Record<string, unknown>) {
  const db = await admin();
  const { data: existing } = await db
    .from("business_user_data")
    .select("data")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();
  const merged = { ...((existing?.data as Record<string, unknown>) ?? {}), ...(metadata ?? {}) };
  await db
    .from("business_user_data")
    .upsert({ business_id: businessId, user_id: userId, data: merged as never });
  return merged;
}

export async function handleHeadlessSignup(request: Request): Promise<Response> {
  const auth = await requireKey(request, "users:write");
  if (auth.error) return auth.error;
  const parsed = signupSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return oauth.oauthError("invalid_request", parsed.error.issues[0]?.message ?? "Invalid body.");
  }
  const { email, password, full_name, metadata } = parsed.data;
  if (!(await allowAttempt("signup", request, email))) {
    return oauth.oauthError("slow_down", "Too many attempts. Try again in 15 minutes.", 429);
  }

  const { data, error } = await publicClient().auth.signUp({
    email,
    password,
    options: full_name ? { data: { full_name } } : {},
  });
  // Generic reply so the endpoint can't be used to find out who has an account.
  if (error || !data.user) {
    await oauth.logIntegrationEvent({
      request,
      userId: auth.principal.subjectId,
      eventType: "headless.signup_failed",
      status: "warning",
      description: "Custom-form sign-up was refused",
      metadata: { key_id: auth.principal.keyId, reason: error?.message ?? "unknown" },
    });
    return oauth.oauthError("signup_failed", "Could not create this account.", 400);
  }

  const stored = await linkUser(auth.principal.subjectId, data.user.id, metadata);
  await oauth.logIntegrationEvent({
    request,
    userId: data.user.id,
    eventType: "headless.signup",
    description: "Account created from a business's own sign-up form",
    metadata: { key_id: auth.principal.keyId, business_id: auth.principal.subjectId },
  });
  return oauth.jsonResponse(
    {
      user: { id: data.user.id, email, full_name: full_name ?? null, metadata: stored },
      email_confirmation_required: !data.session,
    },
    201,
  );
}

export async function handleHeadlessSignin(request: Request): Promise<Response> {
  const auth = await requireKey(request, "users:write");
  if (auth.error) return auth.error;
  const parsed = signinSchema.safeParse(await readJson(request));
  if (!parsed.success) return oauth.oauthError("invalid_request", "email and password are required.");
  const { email, password } = parsed.data;
  if (!(await allowAttempt("signin", request, email))) {
    return oauth.oauthError("slow_down", "Too many attempts. Try again in 15 minutes.", 429);
  }

  const client = publicClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await oauth.logIntegrationEvent({
      request,
      userId: null,
      eventType: "headless.signin_failed",
      status: "warning",
      description: "Custom-form sign-in was refused",
      metadata: { key_id: auth.principal.keyId, business_id: auth.principal.subjectId },
    });
    return oauth.oauthError("invalid_grant", "Email or password is incorrect.", 401);
  }
  const userId = data.user.id;
  await client.auth.signOut().catch(() => undefined);

  // Accounts protected by an authenticator or passkey must use the hosted sign-in.
  const db = await admin();
  const [{ data: factors }, { count: passkeys }] = await Promise.all([
    db.auth.admin.mfa.listFactors({ userId }),
    db.from("passkeys").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const hasMfa = (factors?.factors ?? []).some((f) => f.status === "verified") || (passkeys ?? 0) > 0;
  if (hasMfa) {
    return oauth.jsonResponse(
      {
        error: "mfa_required",
        error_description:
          "This account uses extra protection. Send the person to the EGREED ID sign-in page (OAuth) instead.",
        authorize_endpoint: `${oauth.issuerFromRequest(request)}/oauth/authorize`,
      },
      403,
    );
  }

  const stored = await linkUser(auth.principal.subjectId, userId);
  const tokens = await oauth.issueTokens({
    clientId: `apikey:${auth.principal.keyId}`,
    userId,
    scopes: TOKEN_SCOPES,
    grantType: "password_headless",
    issuer: oauth.issuerFromRequest(request),
    includeIdToken: false,
  });
  await oauth.logIntegrationEvent({
    request,
    userId,
    eventType: "headless.signin",
    description: "Signed in from a business's own sign-in form",
    metadata: { key_id: auth.principal.keyId, business_id: auth.principal.subjectId },
  });
  return oauth.jsonResponse({
    ...tokens,
    user: {
      id: userId,
      email: data.user.email,
      full_name: (data.user.user_metadata?.["full_name"] as string | undefined) ?? null,
      metadata: stored,
    },
  });
}

const uuid = z.string().uuid();

export async function handleUserDataGet(request: Request, userId: string): Promise<Response> {
  const auth = await requireKey(request, "users:read");
  if (auth.error) return auth.error;
  if (!uuid.safeParse(userId).success) return oauth.oauthError("invalid_request", "Bad user id.");
  const db = await admin();
  const { data } = await db
    .from("business_user_data")
    .select("data, created_at, updated_at")
    .eq("business_id", auth.principal.subjectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return oauth.oauthError("not_found", "This person hasn't used your form.", 404);
  return oauth.jsonResponse({ user_id: userId, ...data });
}

export async function handleUserDataPut(request: Request, userId: string): Promise<Response> {
  const auth = await requireKey(request, "users:write");
  if (auth.error) return auth.error;
  if (!uuid.safeParse(userId).success) return oauth.oauthError("invalid_request", "Bad user id.");
  const body = metadataSchema.safeParse(await readJson(request));
  if (!body.success) return oauth.oauthError("invalid_request", "Body must be a flat JSON object.");
  const db = await admin();
  const { data: existing } = await db
    .from("business_user_data")
    .select("user_id")
    .eq("business_id", auth.principal.subjectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) return oauth.oauthError("not_found", "This person hasn't used your form.", 404);
  const merged = await linkUser(auth.principal.subjectId, userId, body.data);
  return oauth.jsonResponse({ user_id: userId, data: merged });
}
