/**
 * Request handlers for the OAuth 2.1 / OIDC endpoints and the `/api/public/v1`
 * REST surface. The TanStack server routes delegate here, and the developer
 * console's integration test invokes these same functions in-process with
 * synthetic `Request` objects — so what the test verifies is exactly what an
 * external EGREED system hits over HTTP.
 */
import * as oauth from "./oauth.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------------ token */

export async function handleToken(request: Request): Promise<Response> {
  const supabaseAdmin = await admin();
  const issuer = oauth.issuerFromRequest(request);
  const params = await oauth.readRequestParams(request);

  const { clientId, clientSecret } = oauth.readClientCredentials(request, params);
  if (!clientId) return oauth.oauthError("invalid_client", "client_id is required", 401);

  const client = await oauth.findClient(clientId);
  if (!client || !client.is_active) {
    return oauth.oauthError("invalid_client", "Unknown or disabled client.", 401);
  }
  if (!oauth.clientSecretValid(client, clientSecret)) {
    return oauth.oauthError("invalid_client", "Client authentication failed.", 401);
  }

  const grantType = params["grant_type"];

  if (grantType === "authorization_code") {
    const code = params["code"];
    const redirectUri = params["redirect_uri"];
    if (!code || !redirectUri) {
      return oauth.oauthError("invalid_request", "code and redirect_uri are required.");
    }

    const { data: row } = await supabaseAdmin
      .from("oauth_authorization_codes")
      .select(
        "id, client_id, user_id, redirect_uri, scopes, nonce, code_challenge, code_challenge_method, expires_at, used_at",
      )
      .eq("code_hash", oauth.sha256hex(code))
      .maybeSingle();

    if (!row || row.client_id !== client.client_id) {
      return oauth.oauthError("invalid_grant", "Authorization code is not valid.");
    }
    if (row.used_at) {
      // Replay: revoke everything previously issued from this code path.
      await supabaseAdmin
        .from("oauth_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("client_id", client.client_id)
        .eq("user_id", row.user_id)
        .is("revoked_at", null);
      return oauth.oauthError("invalid_grant", "Authorization code was already used.");
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return oauth.oauthError("invalid_grant", "Authorization code has expired.");
    }
    if (row.redirect_uri !== redirectUri) {
      return oauth.oauthError("invalid_grant", "redirect_uri does not match the code.");
    }
    if (client.client_type === "public" && !row.code_challenge) {
      return oauth.oauthError("invalid_grant", "PKCE is required for public clients.");
    }
    if (!oauth.verifyPkce(params["code_verifier"], row.code_challenge, row.code_challenge_method)) {
      return oauth.oauthError("invalid_grant", "PKCE verification failed.");
    }

    await supabaseAdmin
      .from("oauth_authorization_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);

    const tokens = await oauth.issueTokens({
      clientId: client.client_id,
      userId: row.user_id,
      scopes: row.scopes ?? [],
      grantType: "authorization_code",
      issuer,
      nonce: row.nonce,
    });
    return oauth.jsonResponse(tokens);
  }

  if (grantType === "refresh_token") {
    const refreshToken = params["refresh_token"];
    if (!refreshToken) {
      return oauth.oauthError("invalid_request", "refresh_token is required.");
    }
    const { data: row } = await supabaseAdmin
      .from("oauth_tokens")
      .select("id, client_id, user_id, scopes, refresh_expires_at, revoked_at")
      .eq("refresh_token_hash", oauth.sha256hex(refreshToken))
      .maybeSingle();

    if (!row || row.client_id !== client.client_id || row.revoked_at) {
      return oauth.oauthError("invalid_grant", "Refresh token is not valid.");
    }
    if (row.refresh_expires_at && new Date(row.refresh_expires_at).getTime() < Date.now()) {
      return oauth.oauthError("invalid_grant", "Refresh token has expired.");
    }

    // Rotate: the presented refresh token is retired immediately.
    await supabaseAdmin
      .from("oauth_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", row.id);

    const requested = (params["scope"] ?? "").split(" ").filter(Boolean);
    const scopes =
      requested.length > 0
        ? requested.filter((scope) => (row.scopes ?? []).includes(scope))
        : (row.scopes ?? []);

    const tokens = await oauth.issueTokens({
      clientId: client.client_id,
      userId: row.user_id,
      scopes,
      grantType: "refresh_token",
      issuer,
    });
    return oauth.jsonResponse(tokens);
  }

  if (grantType === "client_credentials") {
    if (client.client_type !== "confidential") {
      return oauth.oauthError(
        "unauthorized_client",
        "Only confidential clients may use client_credentials.",
      );
    }
    const requested = (params["scope"] ?? "").split(" ").filter(Boolean);
    const scopes = oauth
      .filterScopes(client, requested.length > 0 ? requested : [...client.scopes])
      .filter((scope) => scope !== "openid" && scope !== "offline_access");

    const tokens = await oauth.issueTokens({
      clientId: client.client_id,
      userId: null,
      scopes,
      grantType: "client_credentials",
      issuer,
    });
    return oauth.jsonResponse(tokens);
  }

  return oauth.oauthError("unsupported_grant_type", `Unsupported grant_type: ${grantType}`);
}

/* --------------------------------------------------------------- userinfo */

export async function handleUserinfo(request: Request): Promise<Response> {
  const identity = await oauth.authenticateBearer(request);
  if (!identity) {
    return oauth.oauthError("invalid_token", "A valid access token is required.", 401, {
      "www-authenticate": 'Bearer error="invalid_token"',
    });
  }
  if (!identity.userId) {
    return oauth.oauthError("invalid_token", "This token is not bound to a user.", 403);
  }
  if (!identity.scopes.includes("openid")) {
    return oauth.oauthError("insufficient_scope", "openid scope required.", 403, {
      "www-authenticate": 'Bearer error="insufficient_scope", scope="openid"',
    });
  }
  const claims = await oauth.userinfoClaims(identity.userId, identity.scopes);
  return oauth.jsonResponse(claims);
}

/* -------------------------------------------------------------- introspect */

export async function handleIntrospect(request: Request): Promise<Response> {
  const supabaseAdmin = await admin();
  const params = await oauth.readRequestParams(request);
  const { clientId, clientSecret } = oauth.readClientCredentials(request, params);

  if (!clientId) return oauth.oauthError("invalid_client", "client_id is required", 401);
  const client = await oauth.findClient(clientId);
  if (!client || !client.is_active || !oauth.clientSecretValid(client, clientSecret)) {
    return oauth.oauthError("invalid_client", "Client authentication failed.", 401);
  }

  const token = params["token"];
  if (!token) return oauth.oauthError("invalid_request", "token is required.");

  const hash = oauth.sha256hex(token);
  const { data: row } = await supabaseAdmin
    .from("oauth_tokens")
    .select("client_id, user_id, scopes, expires_at, revoked_at, grant_type, created_at")
    .or(`access_token_hash.eq.${hash},refresh_token_hash.eq.${hash}`)
    .maybeSingle();

  const active =
    Boolean(row) &&
    row!.client_id === client.client_id &&
    !row!.revoked_at &&
    new Date(row!.expires_at).getTime() > Date.now();

  if (!active) return oauth.jsonResponse({ active: false });

  return oauth.jsonResponse({
    active: true,
    client_id: row!.client_id,
    sub: row!.user_id,
    scope: (row!.scopes ?? []).join(" "),
    token_type: "Bearer",
    exp: Math.floor(new Date(row!.expires_at).getTime() / 1000),
    iat: Math.floor(new Date(row!.created_at).getTime() / 1000),
    grant_type: row!.grant_type,
  });
}

/* ------------------------------------------------------------------ revoke */

export async function handleRevoke(request: Request): Promise<Response> {
  const supabaseAdmin = await admin();
  const params = await oauth.readRequestParams(request);
  const { clientId, clientSecret } = oauth.readClientCredentials(request, params);

  if (!clientId) return oauth.oauthError("invalid_client", "client_id is required", 401);
  const client = await oauth.findClient(clientId);
  if (!client || !oauth.clientSecretValid(client, clientSecret)) {
    return oauth.oauthError("invalid_client", "Client authentication failed.", 401);
  }

  const token = params["token"];
  if (!token) return oauth.oauthError("invalid_request", "token is required.");
  const hash = oauth.sha256hex(token);
  const revokedAt = new Date().toISOString();

  await supabaseAdmin
    .from("oauth_tokens")
    .update({ revoked_at: revokedAt })
    .eq("client_id", client.client_id)
    .eq("access_token_hash", hash)
    .is("revoked_at", null);

  await supabaseAdmin
    .from("oauth_tokens")
    .update({ revoked_at: revokedAt })
    .eq("client_id", client.client_id)
    .eq("refresh_token_hash", hash)
    .is("revoked_at", null);

  return oauth.jsonResponse({ revoked: true });
}

/* ------------------------------------------------------------------- v1/me */

function principalMeta(principal: oauth.Principal) {
  return principal.kind === "api_key"
    ? { authenticated_via: "api_key", environment: principal.environment, scopes: principal.scopes }
    : { authenticated_via: "oauth_token", client_id: principal.clientId, scopes: principal.scopes };
}

export async function handleMeGet(request: Request): Promise<Response> {
  const auth = await oauth.requireApiAccess(request, ["identity:read", "profile"]);
  if (auth.error) return auth.error;
  const { principal } = auth;

  // OAuth tokens only reveal what the user consented to; API keys act as owner.
  const claimScopes =
    principal.kind === "api_key"
      ? ["profile", "email", ...principal.scopes]
      : [...new Set([...principal.scopes, "profile"])];

  const claims = await oauth.userinfoClaims(principal.subjectId!, claimScopes);
  return oauth.jsonResponse({ ...principalMeta(principal), identity: claims });
}

export async function handleMePatch(request: Request): Promise<Response> {
  const auth = await oauth.requireApiAccess(request, ["identity:write"]);
  if (auth.error) return auth.error;
  const { principal } = auth;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return oauth.oauthError("invalid_request", "A JSON body is required.");

  const allowed = ["display_name", "full_name", "job_title", "locale", "timezone"] as const;
  const patch: Record<string, string> = {};
  for (const key of allowed) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > 120) {
      return oauth.oauthError("invalid_request", `${key} must be a string of at most 120 characters.`);
    }
    patch[key] = value.trim();
  }
  if (Object.keys(patch).length === 0) {
    return oauth.oauthError("invalid_request", `Provide at least one of: ${allowed.join(", ")}.`);
  }

  const supabaseAdmin = await admin();
  const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", principal.subjectId!);
  if (error) return oauth.oauthError("server_error", "Could not update the profile.", 500);

  const claims = await oauth.userinfoClaims(principal.subjectId!, ["profile"]);
  return oauth.jsonResponse({ ...principalMeta(principal), updated: Object.keys(patch), identity: claims });
}

/* -------------------------------------------------------- v1/organizations */

export async function handleOrganizations(request: Request): Promise<Response> {
  const auth = await oauth.requireApiAccess(request, ["organizations:read"]);
  if (auth.error) return auth.error;
  const subjectId = auth.principal.subjectId!;

  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("role, department, created_at, organizations(id, name, slug, plan)")
    .eq("user_id", subjectId);
  if (error) return oauth.oauthError("server_error", "Could not load organizations.", 500);

  return oauth.jsonResponse({
    subject: subjectId,
    organizations: (data ?? []).map((row) => {
      const org = row.organizations as { id: string; name: string; slug: string; plan: string } | null;
      return {
        id: org?.id ?? null,
        name: org?.name ?? null,
        slug: org?.slug ?? null,
        plan: org?.plan ?? null,
        role: row.role,
        department: row.department,
        member_since: row.created_at,
      };
    }),
  });
}

/* ------------------------------------------------------------- v1/sessions */

export async function handleSessionsGet(request: Request): Promise<Response> {
  const auth = await oauth.requireApiAccess(request, ["sessions:read"]);
  if (auth.error) return auth.error;

  const supabaseAdmin = await admin();
  const { data, error } = await supabaseAdmin
    .from("trusted_devices")
    .select("id, device_label, device_type, browser, os, location, is_trusted, last_seen_at, created_at")
    .eq("user_id", auth.principal.subjectId!)
    .order("last_seen_at", { ascending: false });
  if (error) return oauth.oauthError("server_error", "Could not load devices.", 500);

  return oauth.jsonResponse({ subject: auth.principal.subjectId, devices: data ?? [] });
}

export async function handleSessionsDelete(request: Request): Promise<Response> {
  const auth = await oauth.requireApiAccess(request, ["sessions:revoke"]);
  if (auth.error) return auth.error;

  const deviceId = new URL(request.url).searchParams.get("device_id");
  if (!deviceId || !/^[0-9a-f-]{36}$/i.test(deviceId)) {
    return oauth.oauthError("invalid_request", "device_id query parameter is required.");
  }

  const supabaseAdmin = await admin();
  const { error } = await supabaseAdmin
    .from("trusted_devices")
    .update({ is_trusted: false })
    .eq("id", deviceId)
    .eq("user_id", auth.principal.subjectId!);
  if (error) return oauth.oauthError("server_error", "Could not revoke the device.", 500);

  return oauth.jsonResponse({ revoked: true, device_id: deviceId });
}

/* ---------------------------------------------------------------- v1/audit */

export async function handleAudit(request: Request): Promise<Response> {
  const auth = await oauth.requireApiAccess(request, ["audit:read"]);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
  const since = url.searchParams.get("since");

  const supabaseAdmin = await admin();
  let query = supabaseAdmin
    .from("audit_logs")
    .select("id, event_type, event_category, status, description, ip_address, device_label, location, created_at")
    .eq("user_id", auth.principal.subjectId!)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (since && !Number.isNaN(Date.parse(since))) query = query.gte("created_at", since);

  const { data, error } = await query;
  if (error) return oauth.oauthError("server_error", "Could not load audit events.", 500);

  return oauth.jsonResponse({ subject: auth.principal.subjectId, events: data ?? [] });
}
