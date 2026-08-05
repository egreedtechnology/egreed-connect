/**
 * Server-only identity helpers. Never imported by browser code.
 */
import { createHash, randomBytes } from "node:crypto";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

export type RequestContext = {
  ip: string | null;
  userAgent: string | null;
  deviceLabel: string;
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet";
  fingerprint: string;
};

/** SHA-256 hex digest. Used for API key / client secret verification material. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Cryptographically secure, URL-safe token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateApiKey(environment: string): {
  plaintext: string;
  prefix: string;
  hash: string;
} {
  const env = environment === "test" ? "test" : "live";
  const secret = randomToken(24);
  const plaintext = `egr_${env}_${secret}`;
  return { plaintext, prefix: plaintext.slice(0, 16), hash: sha256(plaintext) };
}

export function generateClientCredentials(): {
  clientId: string;
  secret: string;
  hash: string;
  lastFour: string;
} {
  const clientId = `egr_client_${randomToken(12)}`;
  const secret = `egr_secret_${randomToken(24)}`;
  return { clientId, secret, hash: sha256(secret), lastFour: secret.slice(-4) };
}

function parseUserAgent(ua: string): Pick<
  RequestContext,
  "browser" | "os" | "deviceType" | "deviceLabel"
> {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Unknown browser";

  const os = /Windows NT/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";

  const deviceType: RequestContext["deviceType"] = /iPad|Tablet/.test(ua)
    ? "tablet"
    : /Mobi|Android|iPhone/.test(ua)
      ? "mobile"
      : "desktop";

  return { browser, os, deviceType, deviceLabel: `${browser} on ${os}` };
}

/**
 * Derives request metadata (IP, device, coarse fingerprint) for audit trails.
 * The fingerprint is intentionally derived from stable client hints only — it is
 * used to group sessions per device, never as an authentication factor.
 */
export function readRequestContext(userId: string): RequestContext {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    ip = getRequestIP({ xForwardedFor: true }) ?? null;
    userAgent = getRequestHeader("user-agent") ?? null;
  } catch {
    // Outside a request scope (should not happen inside server fns).
  }
  const parsed = parseUserAgent(userAgent ?? "");
  const fingerprint = sha256(
    [userId, parsed.browser, parsed.os, parsed.deviceType, getLanguage()].join("|"),
  ).slice(0, 32);
  return { ip, userAgent, fingerprint, ...parsed };
}

function getLanguage(): string {
  try {
    return getRequestHeader("accept-language") ?? "";
  } catch {
    return "";
  }
}

export function coarseLocation(): string | null {
  try {
    const city = getRequestHeader("cf-ipcity");
    const country = getRequestHeader("cf-ipcountry");
    if (city && country) return `${city}, ${country}`;
    return country ?? null;
  } catch {
    return null;
  }
}

export type AuditInput = {
  userId: string;
  eventType: string;
  category?: string;
  status?: "success" | "failure" | "warning";
  description?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Appends an immutable audit entry. Uses the service client because audit rows
 * must not be writable by end users (they are read-only from the app).
 */
export async function writeAuditLog(input: AuditInput): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ctx = readRequestContext(input.userId);
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    user_id: input.userId,
    event_type: input.eventType,
    event_category: input.category ?? "account",
    status: input.status ?? "success",
    description: input.description ?? null,
    ip_address: ctx.ip,
    user_agent: ctx.userAgent,
    device_label: ctx.deviceLabel,
    location: coarseLocation(),
    metadata: (input.metadata ?? {}) as never,
  });
  if (error) console.error("[audit] failed to write entry", error.message);
}
