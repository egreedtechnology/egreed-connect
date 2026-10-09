/**
 * Identity service layer — every account surface talks to the backend through
 * these typed server functions. Handlers run as the signed-in user so row level
 * security is always enforced.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { API_SCOPES, OAUTH_SCOPES } from "./egreed";
import {
  generateApiKey,
  generateClientCredentials,
  readRequestContext,
  coarseLocation,
  writeAuditLog,
} from "./identity.server";
import type {
  ApiKey,
  AuditEntry,
  Device,
  IdentityOverview,
  OAuthClient,
  Preferences,
  Profile,
  SecurityAlert,
} from "./identity.types";

export const getIdentityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IdentityOverview> => {
    const { supabase, userId, claims } = context;

    const [profileRes, prefsRes, rolesRes, devicesRes, alertsRes, activityRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("trusted_devices").select("id, is_trusted").eq("user_id", userId),
      supabase.from("security_alerts").select("id").eq("user_id", userId).eq("is_read", false),
      supabase
        .from("audit_logs")
        .select("id, event_type, event_category, status, description, ip_address, device_label, location, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    const devices = devicesRes.data ?? [];
    const trustedDeviceCount = devices.filter((d) => d.is_trusted).length;
    const profile = (profileRes.data as Profile | null) ?? null;
    const emailVerified = Boolean((claims as Record<string, unknown>)["email"]);

    const checklist = [
      {
        id: "profile",
        label: "Complete your profile",
        done: Boolean(profile?.display_name && profile?.full_name),
        hint: "Add your name so teammates recognise you across EGREED apps.",
      },
      {
        id: "phone",
        label: "Add a recovery phone",
        done: Boolean(profile?.phone),
        hint: "A recovery phone lets you regain access if you lose your device.",
      },
      {
        id: "device",
        label: "Trust this device",
        done: trustedDeviceCount > 0,
        hint: "Trusted devices skip extra verification on future sign-ins.",
      },
      {
        id: "alerts",
        label: "Sign-in alerts enabled",
        done: Boolean(prefsRes.data?.email_sign_in_alerts),
        hint: "Get notified whenever a new device signs in to your account.",
      },
      {
        id: "email",
        label: "Verified email address",
        done: emailVerified,
        hint: "A verified address is required for password recovery.",
      },
    ];

    const securityScore = Math.round(
      (checklist.filter((c) => c.done).length / checklist.length) * 100,
    );

    return {
      profile,
      preferences: (prefsRes.data as Preferences | null) ?? null,
      roles: (rolesRes.data ?? []).map((r) => r.role as string),
      deviceCount: devices.length,
      trustedDeviceCount,
      unreadAlerts: (alertsRes.data ?? []).length,
      recentActivity: (activityRes.data ?? []) as AuditEntry[],
      securityScore,
      checklist,
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        display_name: z.string().trim().min(1).max(80),
        full_name: z.string().trim().max(120).optional().or(z.literal("")),
        username: z
          .string()
          .trim()
          .regex(/^[a-z0-9_.-]{3,32}$/, "Use 3-32 lowercase letters, numbers, dot, dash or underscore")
          .optional()
          .or(z.literal("")),
        phone: z.string().trim().max(32).optional().or(z.literal("")),
        job_title: z.string().trim().max(80).optional().or(z.literal("")),
        timezone: z.string().trim().max(64),
        locale: z.string().trim().max(16),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Profile> => {
    const { supabase, userId } = context;
    const patch = {
      display_name: data.display_name,
      full_name: data.full_name || null,
      username: data.username ? data.username.toLowerCase() : null,
      phone: data.phone || null,
      job_title: data.job_title || null,
      timezone: data.timezone,
      locale: data.locale,
    };

    const { data: row, error } = await supabase
      .from("profiles")
      .upsert({ id: userId, ...patch })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505" || error.message.includes("duplicate")) {
        throw new Error("That username is already taken.");
      }
      throw new Error("Could not save your profile. Please try again.");
    }

    await writeAuditLog({
      userId,
      eventType: "profile.updated",
      category: "account",
      description: "Profile details updated",
    });

    return row as Profile;
  });

export const updatePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email_security_alerts: z.boolean(),
        email_product_updates: z.boolean(),
        email_sign_in_alerts: z.boolean(),
        allow_analytics: z.boolean(),
        profile_visibility: z.enum(["private", "organization", "public"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Preferences> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("user_preferences")
      .upsert({ user_id: userId, ...data })
      .select("*")
      .single();
    if (error) throw new Error("Could not save your preferences.");

    await writeAuditLog({
      userId,
      eventType: "preferences.updated",
      category: "privacy",
      description: "Notification and privacy preferences updated",
    });
    return row as Preferences;
  });

export const listDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Device[]> => {
    const { data, error } = await context.supabase
      .from("trusted_devices")
      .select("*")
      .eq("user_id", context.userId)
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error("Could not load your devices.");
    return (data ?? []) as Device[];
  });

/**
 * Records the current browser as a device and appends a sign-in audit entry.
 * Called once after a successful authentication.
 */
export const registerSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ method: z.enum(["password", "oauth", "recovery", "signup"]) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ deviceId: string | null }> => {
    const { supabase, userId } = context;
    const ctx = readRequestContext(userId);

    const { data: device } = await supabase
      .from("trusted_devices")
      .upsert(
        {
          user_id: userId,
          device_fingerprint: ctx.fingerprint,
          device_label: ctx.deviceLabel,
          browser: ctx.browser,
          os: ctx.os,
          device_type: ctx.deviceType,
          ip_address: ctx.ip,
          location: coarseLocation(),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_fingerprint" },
      )
      .select("id")
      .maybeSingle();

    await writeAuditLog({
      userId,
      eventType: data.method === "signup" ? "account.created" : "auth.sign_in",
      category: "authentication",
      description:
        data.method === "signup"
          ? "Account created"
          : `Signed in with ${data.method === "oauth" ? "Google" : data.method}`,
      metadata: { method: data.method },
    });

    return { deviceId: device?.id ?? null };
  });

export const setDeviceTrust = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ deviceId: z.string().uuid(), trusted: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("trusted_devices")
      .update({ is_trusted: data.trusted })
      .eq("id", data.deviceId)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not update this device.");
    await writeAuditLog({
      userId: context.userId,
      eventType: data.trusted ? "device.trusted" : "device.untrusted",
      category: "security",
      description: `Device trust ${data.trusted ? "granted" : "revoked"}`,
    });
    return { ok: true };
  });

export const revokeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ deviceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("trusted_devices")
      .delete()
      .eq("id", data.deviceId)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not remove this device.");
    await writeAuditLog({
      userId: context.userId,
      eventType: "device.revoked",
      category: "security",
      status: "warning",
      description: "Device access revoked",
    });
    return { ok: true };
  });

export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        category: z.enum(["all", "authentication", "security", "account", "privacy"]).default("all"),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AuditEntry[]> => {
    let query = context.supabase
      .from("audit_logs")
      .select("id, event_type, event_category, status, description, ip_address, device_label, location, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.category !== "all") query = query.eq("event_category", data.category);
    const { data: rows, error } = await query;
    if (error) throw new Error("Could not load your activity history.");
    return (rows ?? []) as AuditEntry[];
  });

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SecurityAlert[]> => {
    const { data, error } = await context.supabase
      .from("security_alerts")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Could not load your security alerts.");
    return (data ?? []) as SecurityAlert[];
  });

export const dismissAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ alertId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("security_alerts")
      .update({ is_read: true })
      .eq("id", data.alertId)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not dismiss this alert.");
    return { ok: true };
  });

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApiKey[]> => {
    const { data, error } = await context.supabase
      .from("api_keys")
      .select("id, name, key_prefix, scopes, environment, last_used_at, expires_at, revoked_at, created_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load your API keys.");
    return (data ?? []) as ApiKey[];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(60),
        environment: z.enum(["live", "test"]),
        scopes: z.array(z.enum(API_SCOPES)).min(1).max(12),
        expiresInDays: z.number().int().min(0).max(730),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ key: ApiKey; plaintext: string }> => {
    const { plaintext, prefix, hash } = generateApiKey(data.environment);
    const expiresAt =
      data.expiresInDays > 0
        ? new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString()
        : null;

    const { data: row, error } = await context.supabase
      .from("api_keys")
      .insert({
        owner_id: context.userId,
        name: data.name,
        key_prefix: prefix,
        key_hash: hash,
        scopes: data.scopes,
        environment: data.environment,
        expires_at: expiresAt,
      })
      .select("id, name, key_prefix, scopes, environment, last_used_at, expires_at, revoked_at, created_at")
      .single();
    if (error) throw new Error("Could not create the API key.");

    await writeAuditLog({
      userId: context.userId,
      eventType: "api_key.created",
      category: "security",
      description: `API key "${data.name}" created`,
    });

    return { key: row as ApiKey, plaintext };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ keyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.keyId)
      .eq("owner_id", context.userId);
    if (error) throw new Error("Could not revoke the API key.");
    await writeAuditLog({
      userId: context.userId,
      eventType: "api_key.revoked",
      category: "security",
      status: "warning",
      description: "API key revoked",
    });
    return { ok: true };
  });

export const listOAuthClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OAuthClient[]> => {
    const { data, error } = await context.supabase
      .from("oauth_clients")
      .select("id, name, description, client_id, secret_last_four, client_type, redirect_uris, scopes, homepage_url, is_active, created_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load your applications.");
    return (data ?? []) as OAuthClient[];
  });

export const createOAuthClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(280).optional().or(z.literal("")),
        client_type: z.enum(["confidential", "public"]),
        homepage_url: z.string().trim().url().max(200).optional().or(z.literal("")),
        redirect_uris: z.array(z.string().trim().url().max(300)).min(1).max(10),
        scopes: z.array(z.enum(OAUTH_SCOPES)).min(1).max(12),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ client: OAuthClient; secret: string | null }> => {
    const creds = generateClientCredentials();
    const confidential = data.client_type === "confidential";

    const { data: row, error } = await context.supabase
      .from("oauth_clients")
      .insert({
        owner_id: context.userId,
        name: data.name,
        description: data.description || null,
        client_id: creds.clientId,
        client_secret_hash: confidential ? creds.hash : null,
        secret_last_four: confidential ? creds.lastFour : null,
        client_type: data.client_type,
        homepage_url: data.homepage_url || null,
        redirect_uris: data.redirect_uris,
        scopes: data.scopes,
      })
      .select("id, name, description, client_id, secret_last_four, client_type, redirect_uris, scopes, homepage_url, is_active, created_at")
      .single();
    if (error) throw new Error("Could not register the application.");

    await writeAuditLog({
      userId: context.userId,
      eventType: "oauth_client.created",
      category: "security",
      description: `OAuth application "${data.name}" registered`,
    });

    return { client: row as OAuthClient, secret: confidential ? creds.secret : null };
  });

export const setOAuthClientActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clientId: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("oauth_clients")
      .update({ is_active: data.active })
      .eq("id", data.clientId)
      .eq("owner_id", context.userId);
    if (error) throw new Error("Could not update the application.");
    return { ok: true };
  });

export const deleteOAuthClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("oauth_clients")
      .delete()
      .eq("id", data.clientId)
      .eq("owner_id", context.userId);
    if (error) throw new Error("Could not delete the application.");
    await writeAuditLog({
      userId: context.userId,
      eventType: "oauth_client.deleted",
      category: "security",
      status: "warning",
      description: "OAuth application deleted",
    });
    return { ok: true };
  });

export const rotateOAuthClientSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ secret: string }> => {
    const creds = generateClientCredentials();
    const { data: row, error } = await context.supabase
      .from("oauth_clients")
      .update({ client_secret_hash: creds.hash, secret_last_four: creds.lastFour })
      .eq("id", data.clientId)
      .eq("owner_id", context.userId)
      .eq("client_type", "confidential")
      .select("name")
      .single();
    if (error || !row) throw new Error("Could not rotate the client secret.");
    await writeAuditLog({
      userId: context.userId,
      eventType: "oauth_client.secret_rotated",
      category: "security",
      status: "warning",
      description: `Client secret rotated for "${row.name}"`,
    });
    return { secret: creds.secret };
  });
