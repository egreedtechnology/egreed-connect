/**
 * Server-only OAuth 2.1 / OpenID Connect provider core.
 *
 * Design notes:
 * - Access/refresh tokens and authorization codes are opaque random strings.
 *   Only their SHA-256 hashes are persisted, so a database leak cannot be
 *   replayed against the API.
 * - ID tokens are RS256 JWTs signed with a key pair generated on first use and
 *   published through the JWKS endpoint, so any standards-compliant client
 *   library can verify them offline.
 * - Every runtime table here is service-role only; all access goes through
 *   these helpers.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ACCESS_TOKEN_TTL_SECONDS = 3600;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
export const AUTH_CODE_TTL_SECONDS = 300;

export type TokenIdentity = {
  clientId: string;
  userId: string | null;
  scopes: string[];
  tokenId: string;
};

export type ApiKeyIdentity = {
  keyId: string;
  ownerId: string;
  scopes: string[];
  environment: string;
};

/* ------------------------------------------------------------------ crypto */

export function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function base64url(input: ArrayBuffer | Uint8Array | string): string {
  const buf =
    typeof input === "string"
      ? Buffer.from(input, "utf8")
      : Buffer.from(input instanceof Uint8Array ? input : new Uint8Array(input));
  return buf.toString("base64url");
}

export function opaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** RFC 7636 PKCE verification. `plain` is accepted only when the client used it. */
export function verifyPkce(
  verifier: string | undefined,
  challenge: string | null,
  method: string | null,
): boolean {
  if (!challenge) return true; // no challenge was registered with the code
  if (!verifier) return false;
  if ((method ?? "plain") === "plain") return safeEqual(verifier, challenge);
  const digest = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(digest, challenge);
}

/* ------------------------------------------------------------- http helpers */

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept",
  "access-control-max-age": "86400",
};

export function jsonResponse(body: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function oauthError(
  error: string,
  description: string,
  status = 400,
  extra?: Record<string, string>,
): Response {
  return jsonResponse({ error, error_description: description }, status, extra);
}

/** Public origin of the identity issuer, derived from the incoming request. */
export function issuerFromRequest(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? url.host;
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Reads form-encoded or JSON request bodies into a flat record. */
export async function readRequestParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  const params: Record<string, string> = {};
  if (contentType.includes("application/json")) {
    const parsed = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") params[key] = value;
    }
  } else {
    const form = await request.formData().catch(() => null);
    if (form) {
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") params[key] = value;
      }
    }
  }
  const query = new URL(request.url).searchParams;
  for (const [key, value] of query.entries()) params[key] ??= value;
  return params;
}

/* ------------------------------------------------------- signing keys / JWT */

type Jwk = JsonWebKey & { kid?: string; use?: string };
type SigningKey = { kid: string; privateJwk: Jwk; publicJwk: Jwk };

let cachedKey: SigningKey | null = null;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function getSigningKey(): Promise<SigningKey> {
  if (cachedKey) return cachedKey;
  const db = await admin();

  const { data: existing } = await db
    .from("oauth_signing_keys")
    .select("kid, public_jwk, private_jwk")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const restored: SigningKey = {
      kid: existing.kid,
      publicJwk: existing.public_jwk as Jwk,
      privateJwk: existing.private_jwk as Jwk,
    };
    cachedKey = restored;
    return restored;
  }

  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const exportedPublic = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Jwk;
  const exportedPrivate = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as Jwk;
  const kid = opaqueToken(8);

  const created: SigningKey = {
    kid,
    publicJwk: { ...exportedPublic, kid, alg: "RS256", use: "sig" },
    privateJwk: { ...exportedPrivate, kid, alg: "RS256" },
  };

  await db.from("oauth_signing_keys").insert({
    kid,
    alg: "RS256",
    public_jwk: created.publicJwk as never,
    private_jwk: created.privateJwk as never,
  });

  cachedKey = created;
  return created;
}

export async function publicJwks(): Promise<{ keys: Jwk[] }> {
  const db = await admin();
  const { data } = await db
    .from("oauth_signing_keys")
    .select("public_jwk")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  const keys = (data ?? []).map((row) => row.public_jwk as Jwk);
  if (keys.length > 0) return { keys };
  const key = await getSigningKey();
  return { keys: [key.publicJwk] };
}


export async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const key = await getSigningKey();
  const header = { alg: "RS256", typ: "JWT", kid: key.kid };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key.privateJwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(signature)}`;
}

/* ------------------------------------------------------------------ clients */

export type OAuthClientRecord = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  client_id: string;
  client_secret_hash: string | null;
  client_type: string;
  redirect_uris: string[];
  scopes: string[];
  homepage_url: string | null;
  logo_url: string | null;
  is_active: boolean;
};

export async function findClient(clientId: string): Promise<OAuthClientRecord | null> {
  const db = await admin();
  const { data } = await db
    .from("oauth_clients")
    .select(
      "id, owner_id, name, description, client_id, client_secret_hash, client_type, redirect_uris, scopes, homepage_url, logo_url, is_active",
    )
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as OAuthClientRecord | null) ?? null;
}

/** Extracts client credentials from HTTP Basic auth or the request body. */
export function readClientCredentials(
  request: Request,
  params: Record<string, string>,
): { clientId: string | null; clientSecret: string | null } {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const index = decoded.indexOf(":");
    if (index > 0) {
      return {
        clientId: decodeURIComponent(decoded.slice(0, index)),
        clientSecret: decodeURIComponent(decoded.slice(index + 1)),
      };
    }
  }
  return {
    clientId: params["client_id"] ?? null,
    clientSecret: params["client_secret"] ?? null,
  };
}

export function clientSecretValid(client: OAuthClientRecord, secret: string | null): boolean {
  if (client.client_type === "public") return true;
  if (!client.client_secret_hash || !secret) return false;
  return safeEqual(sha256hex(secret), client.client_secret_hash);
}

/** Exact-match redirect URI validation (OAuth 2.1 forbids fuzzy matching). */
export function redirectUriAllowed(client: OAuthClientRecord, redirectUri: string): boolean {
  return client.redirect_uris.includes(redirectUri);
}

export function filterScopes(client: OAuthClientRecord, requested: string[]): string[] {
  const allowed = new Set(client.scopes);
  const granted = requested.filter((scope) => allowed.has(scope));
  return granted.length > 0 ? [...new Set(granted)] : [];
}

/* ------------------------------------------------- codes, tokens, userinfo */

export async function createAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  nonce?: string | null;
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
}): Promise<string> {
  const db = await admin();
  const code = opaqueToken(32);
  const { error } = await db.from("oauth_authorization_codes").insert({
    code_hash: sha256hex(code),
    client_id: input.clientId,
    user_id: input.userId,
    redirect_uri: input.redirectUri,
    scopes: input.scopes,
    nonce: input.nonce ?? null,
    code_challenge: input.codeChallenge ?? null,
    code_challenge_method: input.codeChallengeMethod ?? null,
    expires_at: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

export type IssuedTokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
};

export async function issueTokens(input: {
  clientId: string;
  userId: string | null;
  scopes: string[];
  grantType: string;
  issuer: string;
  nonce?: string | null;
  includeIdToken?: boolean;
}): Promise<IssuedTokens> {
  const db = await admin();
  const accessToken = opaqueToken(32);
  const wantsRefresh = input.scopes.includes("offline_access") && input.userId !== null;
  const refreshToken = wantsRefresh ? opaqueToken(32) : null;
  const now = Date.now();

  const { error } = await db.from("oauth_tokens").insert({
    client_id: input.clientId,
    user_id: input.userId,
    access_token_hash: sha256hex(accessToken),
    refresh_token_hash: refreshToken ? sha256hex(refreshToken) : null,
    scopes: input.scopes,
    grant_type: input.grantType,
    expires_at: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
    refresh_expires_at: refreshToken
      ? new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()
      : null,
  });
  if (error) throw new Error(error.message);

  const result: IssuedTokens = {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: input.scopes.join(" "),
  };
  if (refreshToken) result.refresh_token = refreshToken;

  if (input.userId && input.includeIdToken !== false && input.scopes.includes("openid")) {
    const claims = await userinfoClaims(input.userId, input.scopes);
    result.id_token = await signJwt({
      iss: input.issuer,
      sub: input.userId,
      aud: input.clientId,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + ACCESS_TOKEN_TTL_SECONDS,
      auth_time: Math.floor(now / 1000),
      ...(input.nonce ? { nonce: input.nonce } : {}),
      ...claims,
    });
  }

  return result;
}

/** Builds OIDC standard claims for a user, filtered by granted scopes. */
export async function userinfoClaims(
  userId: string,
  scopes: string[],
): Promise<Record<string, unknown>> {
  const db = await admin();
  const [{ data: profile }, { data: authUser }] = await Promise.all([
    db
      .from("profiles")
      .select("username, display_name, full_name, avatar_url, phone, job_title, locale, timezone, updated_at")
      .eq("id", userId)
      .maybeSingle(),
    db.auth.admin.getUserById(userId),
  ]);

  const claims: Record<string, unknown> = { sub: userId };

  if (scopes.includes("profile")) {
    Object.assign(claims, {
      name: profile?.full_name ?? profile?.display_name ?? null,
      preferred_username: profile?.username ?? profile?.display_name ?? null,
      nickname: profile?.display_name ?? null,
      picture: profile?.avatar_url ?? null,
      locale: profile?.locale ?? "en",
      zoneinfo: profile?.timezone ?? "UTC",
      updated_at: profile?.updated_at ? Math.floor(new Date(profile.updated_at).getTime() / 1000) : null,
      job_title: profile?.job_title ?? null,
    });
  }
  if (scopes.includes("email")) {
    claims["email"] = authUser?.user?.email ?? null;
    claims["email_verified"] = Boolean(authUser?.user?.email_confirmed_at);
  }
  if (scopes.includes("phone")) {
    claims["phone_number"] = profile?.phone ?? authUser?.user?.phone ?? null;
    claims["phone_number_verified"] = Boolean(authUser?.user?.phone_confirmed_at);
  }
  if (scopes.includes("organizations:read")) {
    const { data: memberships } = await db
      .from("organization_members")
      .select("role, organizations(id, name, slug)")
      .eq("user_id", userId);
    claims["organizations"] = (memberships ?? []).map((row) => {
      const org = row.organizations as { id: string; name: string; slug: string } | null;
      return { id: org?.id, name: org?.name, slug: org?.slug, role: row.role };
    });
  }

  return claims;
}

/** Bearer access-token authentication for OIDC/REST endpoints. */
export async function authenticateBearer(request: Request): Promise<TokenIdentity | null> {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const db = await admin();
  const { data } = await db
    .from("oauth_tokens")
    .select("id, client_id, user_id, scopes, expires_at, revoked_at")
    .eq("access_token_hash", sha256hex(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  await db
    .from("oauth_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    tokenId: data.id,
    clientId: data.client_id,
    userId: data.user_id,
    scopes: data.scopes ?? [],
  };
}

/* ----------------------------------------------------------------- API keys */

/**
 * Authenticates `Authorization: Bearer egr_live_...` (or `X-API-Key`) requests
 * and records usage. Returns null for unknown, revoked or expired keys.
 */
export async function authenticateApiKey(request: Request): Promise<ApiKeyIdentity | null> {
  const header = request.headers.get("authorization");
  const raw = header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : (request.headers.get("x-api-key") ?? "").trim();
  if (!raw.startsWith("egr_")) return null;

  const db = await admin();
  const { data } = await db
    .from("api_keys")
    .select("id, owner_id, scopes, environment, expires_at, revoked_at")
    .eq("key_hash", sha256hex(raw))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;

  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return {
    keyId: data.id,
    ownerId: data.owner_id,
    scopes: data.scopes ?? [],
    environment: data.environment,
  };
}

export function requireScope(scopes: string[], scope: string): boolean {
  return scopes.includes(scope);
}

/* ---------------------------------------------- integration audit trail */

/**
 * Records an external-integration event (REST call, token grant, refresh,
 * rejection) in `audit_logs` so owners can verify access and failures.
 * Never throws: logging must not break an API response.
 */
export async function logIntegrationEvent(input: {
  request?: Request;
  userId: string | null;
  eventType: string;
  status?: "success" | "warning" | "error";
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const headers = input.request?.headers;
    const db = await admin();
    await db
      .from("audit_logs")

      .insert({
        user_id: input.userId,
        event_type: input.eventType,
        event_category: "integration",
        status: input.status ?? "success",
        description: input.description,
        ip_address:
          headers?.get("cf-connecting-ip") ??
          headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          null,
        user_agent: headers?.get("user-agent") ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          ...(input.request ? { path: new URL(input.request.url).pathname, method: input.request.method } : {}),
        },
      });
  } catch {
    /* audit logging is best-effort */
  }
}

/* ------------------------------------------------ unified REST principal */


/**
 * The caller of a `/api/public/v1/*` endpoint: either an OAuth access token
 * (user context, or none for client_credentials) or an owner-bound API key.
 */
export type Principal =
  | { kind: "oauth_token"; subjectId: string | null; clientId: string; scopes: string[] }
  | {
      kind: "api_key";
      subjectId: string;
      keyId: string;
      environment: string;
      scopes: string[];
    };

export async function authenticateRequest(request: Request): Promise<Principal | null> {
  const token = await authenticateBearer(request);
  if (token) {
    return { kind: "oauth_token", subjectId: token.userId, clientId: token.clientId, scopes: token.scopes };
  }
  const apiKey = await authenticateApiKey(request);
  if (apiKey) {
    return {
      kind: "api_key",
      subjectId: apiKey.ownerId,
      keyId: apiKey.keyId,
      environment: apiKey.environment,
      scopes: apiKey.scopes,
    };
  }
  return null;
}

/**
 * Authenticates the request and enforces that at least one of `anyOf` scopes
 * is present. Returns either the principal or a ready-to-send error Response
 * with RFC 6750 `WWW-Authenticate` challenges, so every REST handler rejects
 * missing/insufficient scopes identically.
 */
export async function requireApiAccess(
  request: Request,
  anyOf: string[],
  options: { requireUser?: boolean } = {},
): Promise<{ principal: Principal; error?: undefined } | { principal?: undefined; error: Response }> {
  const principal = await authenticateRequest(request);
  if (!principal) {
    await logIntegrationEvent({
      request,
      userId: null,
      eventType: "api.request_unauthenticated",
      status: "warning",
      description: "Rejected an API call with missing or invalid credentials",
      metadata: { required_scopes: anyOf },
    });
    return {
      error: oauthError(
        "invalid_token",
        "Provide an OAuth access token or an EGREED API key.",
        401,
        { "www-authenticate": 'Bearer realm="EGREED Identity", error="invalid_token"' },
      ),
    };
  }
  if ((options.requireUser ?? true) && !principal.subjectId) {
    await logIntegrationEvent({
      request,
      userId: null,
      eventType: "api.request_no_user_context",
      status: "warning",
      description: "Rejected an API call from a token with no user context",
      metadata: { required_scopes: anyOf, principal: principal.kind },
    });
    return {
      error: oauthError(
        "invalid_token",
        "This token has no user context. Use an authorization_code token or an API key.",
        403,
      ),
    };
  }
  if (!anyOf.some((scope) => principal.scopes.includes(scope))) {
    await logIntegrationEvent({
      request,
      userId: principal.subjectId,
      eventType: "api.scope_denied",
      status: "warning",
      description: `Denied an API call missing scope: ${anyOf.join(" or ")}`,
      metadata: {
        required_scopes: anyOf,
        granted_scopes: principal.scopes,
        principal: principal.kind,
        ...(principal.kind === "oauth_token"
          ? { client_id: principal.clientId }
          : { key_id: principal.keyId, environment: principal.environment }),
      },
    });
    return {
      error: oauthError(
        "insufficient_scope",
        `This endpoint requires one of: ${anyOf.join(", ")}.`,
        403,
        {
          "www-authenticate": `Bearer realm="EGREED Identity", error="insufficient_scope", scope="${anyOf.join(" ")}"`,
        },
      ),
    };
  }
  await logIntegrationEvent({
    request,
    userId: principal.subjectId,
    eventType: principal.kind === "api_key" ? "api.key_request" : "api.token_request",
    description:
      principal.kind === "api_key"
        ? `API key call accepted (${principal.environment})`
        : `OAuth token call accepted for ${principal.clientId}`,
    metadata: {
      required_scopes: anyOf,
      granted_scopes: principal.scopes,
      ...(principal.kind === "oauth_token"
        ? { client_id: principal.clientId }
        : { key_id: principal.keyId, environment: principal.environment }),
    },
  });

  return { principal };
}
