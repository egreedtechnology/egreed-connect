import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** One executed step of a request preview or an integration test run. */
export type IntegrationStep = {
  id: string;
  title: string;
  detail: string;
  method: string;
  path: string;
  status: number | null;
  ok: boolean;
  expectation: string;
  request?: string;
  response: string;
};

export type IntegrationRun = {
  ok: boolean;
  clientId: string;
  issuer: string;
  passed: number;
  failed: number;
  steps: IntegrationStep[];
};

/** Sample copy-paste requests for the selected client's configuration. */
export type SampleRequests = {
  issuer: string;
  clientId: string;
  clientType: string;
  redirectUri: string;
  scopes: string[];
  authorizeUrl: string;
  codeVerifier: string;
  codeChallenge: string;
  tokenCurl: string;
  refreshCurl: string;
  userinfoCurl: string;
  introspectCurl: string;
  meCurl: string;
  organizationsCurl: string;
};

const clientInput = z.object({ clientId: z.string().min(4).max(200) });

/**
 * Builds a ready-to-run authorize URL plus curl snippets for the token,
 * refresh, userinfo, introspection and REST calls, using the real registered
 * redirect URI and scopes so nothing has to be hand-edited.
 */
export const buildSampleRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => clientInput.parse(input))
  .handler(async ({ data, context }): Promise<SampleRequests> => {
    const oauth = await import("./oauth.server");
    const { createHash, randomBytes } = await import("node:crypto");

    const client = await oauth.findClient(data.clientId);
    if (!client || client.owner_id !== context.userId) {
      throw new Error("You do not own an application with that client ID.");
    }

    const issuer = process.env["EGREED_ISSUER"] ?? "https://id.egreedtech.org";
    const redirectUri = client.redirect_uris[0] ?? `${issuer}/oauth/callback`;
    const scopes = client.scopes.length > 0 ? client.scopes : ["openid", "profile", "email"];

    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    const authorizeUrl = `${issuer}/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state: "state_" + randomBytes(6).toString("hex"),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString()}`;

    const secretLine =
      client.client_type === "confidential" ? `  -d client_secret=YOUR_CLIENT_SECRET \\\n` : "";

    return {
      issuer,
      clientId: client.client_id,
      clientType: client.client_type,
      redirectUri,
      scopes,
      authorizeUrl,
      codeVerifier,
      codeChallenge,
      tokenCurl: `curl -X POST ${issuer}/api/public/oauth/token \\
  -d grant_type=authorization_code \\
  -d code=CODE_FROM_REDIRECT \\
  -d redirect_uri=${redirectUri} \\
  -d client_id=${client.client_id} \\
${secretLine}  -d code_verifier=${codeVerifier}`,
      refreshCurl: `curl -X POST ${issuer}/api/public/oauth/token \\
  -d grant_type=refresh_token \\
  -d refresh_token=YOUR_REFRESH_TOKEN \\
  -d client_id=${client.client_id}${client.client_type === "confidential" ? ` \\\n  -d client_secret=YOUR_CLIENT_SECRET` : ""}`,
      userinfoCurl: `curl ${issuer}/api/public/oauth/userinfo \\
  -H "Authorization: Bearer ACCESS_TOKEN"`,
      introspectCurl: `curl -X POST ${issuer}/api/public/oauth/introspect \\
  -d token=ACCESS_TOKEN \\
  -d client_id=${client.client_id}${client.client_type === "confidential" ? ` \\\n  -d client_secret=YOUR_CLIENT_SECRET` : ""}`,
      meCurl: `curl ${issuer}/api/public/v1/me \\
  -H "Authorization: Bearer ACCESS_TOKEN"`,
      organizationsCurl: `curl ${issuer}/api/public/v1/organizations \\
  -H "Authorization: Bearer ACCESS_TOKEN"`,
    };
  });

/**
 * End-to-end integration test.
 *
 * Simulates an external EGREED system completing the full handshake against the
 * caller's own OAuth client and (optionally) an API key: PKCE authorization code
 * exchange, ID token verification against JWKS, userinfo, permission
 * (organizations) read, scope rejection, refresh rotation, replay protection,
 * introspection and revocation. Every request goes through the same handlers the
 * public HTTP endpoints use, so a pass means real integrations work.
 */
export const runIntegrationTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clientId: z.string().min(4).max(200),
        clientSecret: z.string().max(200).optional(),
        apiKey: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<IntegrationRun> => {
    const oauth = await import("./oauth.server");
    const handlers = await import("./oauth-handlers.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createHash, randomBytes } = await import("node:crypto");

    const client = await oauth.findClient(data.clientId);
    if (!client || client.owner_id !== context.userId) {
      throw new Error("You do not own an application with that client ID.");
    }
    if (!client.is_active) throw new Error("Enable the application before testing it.");

    const issuer = "https://id.egreedtech.org";
    const redirectUri = client.redirect_uris[0] ?? `${issuer}/oauth/callback`;
    const steps: IntegrationStep[] = [];

    const post = (path: string, body: Record<string, string>) =>
      new Request(`${issuer}${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body).toString(),
      });
    const get = (path: string, token: string) =>
      new Request(`${issuer}${path}`, { headers: { authorization: `Bearer ${token}` } });

    function record(
      step: Omit<IntegrationStep, "id" | "ok"> & { ok: boolean },
    ): void {
      steps.push({ id: `step-${steps.length + 1}`, ...step });
    }

    async function readJson(response: Response): Promise<Record<string, unknown>> {
      return (await response.clone().json().catch(() => ({}))) as Record<string, unknown>;
    }

    function preview(value: unknown): string {
      const text = JSON.stringify(value, null, 2) ?? "";
      return text.length > 1400 ? `${text.slice(0, 1400)}…` : text;
    }

    /* --- 1. mint an authorization code as if consent had just been given --- */
    const scopes = [
      ...new Set([
        ...client.scopes.filter((s) => s !== "offline_access"),
        ...(client.scopes.includes("offline_access") ? ["offline_access"] : []),
      ]),
    ];
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const nonce = randomBytes(8).toString("hex");

    const code = await oauth.createAuthorizationCode({
      clientId: client.client_id,
      userId: context.userId,
      redirectUri,
      scopes,
      nonce,
      codeChallenge,
      codeChallengeMethod: "S256",
    });
    record({
      title: "Consent produces an authorization code",
      detail: `Simulated consent for ${scopes.join(" ")} with PKCE (S256).`,
      method: "POST",
      path: "/oauth/authorize",
      status: 200,
      ok: true,
      expectation: "Single-use code bound to the redirect URI and PKCE challenge",
      response: preview({ code: `${code.slice(0, 8)}…`, scopes, code_challenge_method: "S256" }),
    });

    /* --- 2. PKCE must actually be enforced (wrong verifier) --- */
    const badVerifierBody: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: client.client_id,
      code_verifier: randomBytes(32).toString("base64url"),
    };
    if (data.clientSecret) badVerifierBody["client_secret"] = data.clientSecret;
    const badPkce = await handlers.handleToken(post("/api/public/oauth/token", badVerifierBody));
    record({
      title: "Wrong PKCE verifier is rejected",
      detail: "A stolen code cannot be exchanged without the original verifier.",
      method: "POST",
      path: "/api/public/oauth/token",
      status: badPkce.status,
      ok: badPkce.status === 400,
      expectation: "400 invalid_grant",
      request: preview({ ...badVerifierBody, code: "…", client_secret: undefined }),
      response: preview(await readJson(badPkce)),
    });

    /* --- 3. real code exchange --- */
    const tokenBody: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: client.client_id,
      code_verifier: codeVerifier,
    };
    if (data.clientSecret) tokenBody["client_secret"] = data.clientSecret;

    const tokenResponse = await handlers.handleToken(post("/api/public/oauth/token", tokenBody));
    const tokenJson = await readJson(tokenResponse);
    const accessToken = typeof tokenJson["access_token"] === "string" ? tokenJson["access_token"] : null;
    const refreshToken =
      typeof tokenJson["refresh_token"] === "string" ? tokenJson["refresh_token"] : null;
    const idToken = typeof tokenJson["id_token"] === "string" ? tokenJson["id_token"] : null;

    record({
      title: "Authorization code exchanged for tokens",
      detail: client.client_type === "confidential"
        ? "Confidential client authenticated with its secret."
        : "Public client authenticated with PKCE alone.",
      method: "POST",
      path: "/api/public/oauth/token",
      status: tokenResponse.status,
      ok: tokenResponse.ok && Boolean(accessToken),
      expectation: "200 with access_token (+ id_token when openid was granted)",
      response: preview({
        ...tokenJson,
        access_token: accessToken ? `${accessToken.slice(0, 8)}…` : undefined,
        refresh_token: refreshToken ? `${refreshToken.slice(0, 8)}…` : undefined,
        id_token: idToken ? `${idToken.slice(0, 24)}…` : undefined,
      }),
    });

    if (!accessToken) {
      return {
        ok: false,
        clientId: client.client_id,
        issuer,
        passed: steps.filter((s) => s.ok).length,
        failed: steps.filter((s) => !s.ok).length,
        steps,
      };
    }

    /* --- 4. ID token verifies against the published JWKS --- */
    if (scopes.includes("openid")) {
      let verified = false;
      let payload: Record<string, unknown> = {};
      try {
        const [headerPart, payloadPart, signaturePart] = (idToken ?? "").split(".");
        payload = JSON.parse(Buffer.from(payloadPart ?? "", "base64url").toString("utf8"));
        const jwks = await oauth.publicJwks();
        const header = JSON.parse(Buffer.from(headerPart ?? "", "base64url").toString("utf8"));
        const jwk = jwks.keys.find((key) => (key as { kid?: string }).kid === header.kid);
        if (jwk) {
          const key = await crypto.subtle.importKey(
            "jwk",
            jwk,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["verify"],
          );
          verified = await crypto.subtle.verify(
            "RSASSA-PKCS1-v1_5",
            key,
            Buffer.from(signaturePart ?? "", "base64url"),
            new TextEncoder().encode(`${headerPart}.${payloadPart}`),
          );
        }
      } catch {
        verified = false;
      }
      const claimsOk =
        verified &&
        payload["aud"] === client.client_id &&
        payload["sub"] === context.userId &&
        payload["nonce"] === nonce;
      record({
        title: "ID token signature and claims verify",
        detail: "RS256 signature checked against the JWKS document, plus aud/sub/nonce.",
        method: "GET",
        path: "/api/public/oauth/jwks",
        status: 200,
        ok: claimsOk,
        expectation: "Valid RS256 signature, matching aud, sub and nonce",
        response: preview({
          signature_verified: verified,
          aud: payload["aud"],
          sub: payload["sub"],
          nonce_matches: payload["nonce"] === nonce,
          iss: payload["iss"],
        }),
      });
    }

    /* --- 5. userinfo --- */
    const userinfo = await handlers.handleUserinfo(get("/api/public/oauth/userinfo", accessToken));
    const userinfoJson = await readJson(userinfo);
    record({
      title: "UserInfo returns the signed-in identity",
      detail: "Claims are filtered to the scopes the user actually granted.",
      method: "GET",
      path: "/api/public/oauth/userinfo",
      status: userinfo.status,
      ok: userinfo.ok && userinfoJson["sub"] === context.userId,
      expectation: "200 with sub equal to the authenticated user",
      response: preview(userinfoJson),
    });

    /* --- 6. identity REST --- */
    const me = await handlers.handleMeGet(get("/api/public/v1/me", accessToken));
    record({
      title: "Identity REST endpoint accepts the token",
      detail: "External systems read the profile through /api/public/v1/me.",
      method: "GET",
      path: "/api/public/v1/me",
      status: me.status,
      ok: me.ok,
      expectation: "200 with identity payload",
      response: preview(await readJson(me)),
    });

    /* --- 7. permissions (organizations) honour the granted scope --- */
    const orgs = await handlers.handleOrganizations(get("/api/public/v1/organizations", accessToken));
    const orgsJson = await readJson(orgs);
    const orgScopeGranted = scopes.includes("organizations:read");
    record({
      title: orgScopeGranted
        ? "Permissions read returns organization roles"
        : "Permissions read is refused without organizations:read",
      detail: orgScopeGranted
        ? "Role assignments the external system mirrors for RBAC."
        : "The client never requested organizations:read, so access is denied.",
      method: "GET",
      path: "/api/public/v1/organizations",
      status: orgs.status,
      ok: orgScopeGranted ? orgs.ok : orgs.status === 403,
      expectation: orgScopeGranted ? "200 with memberships" : "403 insufficient_scope",
      response: preview(orgsJson),
    });

    /* --- 8. scope enforcement on an endpoint never granted --- */
    const audit = await handlers.handleAudit(get("/api/public/v1/audit", accessToken));
    record({
      title: "Out-of-scope endpoint is refused",
      detail: "audit:read is an API-key scope, so an OAuth token must not pass.",
      method: "GET",
      path: "/api/public/v1/audit",
      status: audit.status,
      ok: audit.status === 403,
      expectation: "403 insufficient_scope",
      response: preview(await readJson(audit)),
    });

    /* --- 9. unauthenticated calls are refused --- */
    const anonymous = await handlers.handleMeGet(new Request(`${issuer}/api/public/v1/me`));
    record({
      title: "Anonymous calls are refused",
      detail: "No credentials means no data, with a WWW-Authenticate challenge.",
      method: "GET",
      path: "/api/public/v1/me",
      status: anonymous.status,
      ok: anonymous.status === 401,
      expectation: "401 invalid_token",
      response: preview(await readJson(anonymous)),
    });

    /* --- 10. code replay protection --- */
    const replay = await handlers.handleToken(post("/api/public/oauth/token", tokenBody));
    record({
      title: "Replayed authorization code is rejected",
      detail: "Reusing a code also revokes the tokens it produced.",
      method: "POST",
      path: "/api/public/oauth/token",
      status: replay.status,
      ok: replay.status === 400,
      expectation: "400 invalid_grant",
      response: preview(await readJson(replay)),
    });

    /* --- 11. refresh rotation (only when offline_access was granted) --- */
    if (refreshToken) {
      const refreshBody: Record<string, string> = {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: client.client_id,
      };
      if (data.clientSecret) refreshBody["client_secret"] = data.clientSecret;

      const refreshed = await handlers.handleToken(post("/api/public/oauth/token", refreshBody));
      const refreshedJson = await readJson(refreshed);
      const rotated = typeof refreshedJson["refresh_token"] === "string" ? refreshedJson["refresh_token"] : null;
      record({
        title: "Refresh token issues new tokens without re-consent",
        detail: "The integration stays signed in; the refresh token is rotated.",
        method: "POST",
        path: "/api/public/oauth/token",
        status: refreshed.status,
        ok: refreshed.ok && typeof refreshedJson["access_token"] === "string",
        expectation: "200 with a new access token",
        response: preview({
          ...refreshedJson,
          access_token: "…",
          refresh_token: rotated ? `${rotated.slice(0, 8)}…` : undefined,
          id_token: refreshedJson["id_token"] ? "…" : undefined,
        }),
      });

      const reuse = await handlers.handleToken(post("/api/public/oauth/token", refreshBody));
      record({
        title: "Reusing a rotated refresh token fails",
        detail: "Rotation retires the old token immediately.",
        method: "POST",
        path: "/api/public/oauth/token",
        status: reuse.status,
        ok: reuse.status === 400,
        expectation: "400 invalid_grant",
        response: preview(await readJson(reuse)),
      });
    } else {
      record({
        title: "Refresh tokens not requested",
        detail: "Add the offline_access scope to this application to stay signed in without re-consent.",
        method: "POST",
        path: "/api/public/oauth/token",
        status: null,
        ok: true,
        expectation: "Skipped — offline_access was not granted",
        response: preview({ skipped: true, granted_scopes: scopes }),
      });
    }

    /* --- 12. introspection + revocation (confidential clients only) --- */
    if (client.client_type === "confidential" && data.clientSecret) {
      const introspect = await handlers.handleIntrospect(
        post("/api/public/oauth/introspect", {
          token: accessToken,
          client_id: client.client_id,
          client_secret: data.clientSecret,
        }),
      );
      const introspectJson = await readJson(introspect);
      record({
        title: "Introspection reports the token as active",
        detail: "Resource servers can validate opaque tokens server-side.",
        method: "POST",
        path: "/api/public/oauth/introspect",
        status: introspect.status,
        ok: introspect.ok && introspectJson["active"] === true,
        expectation: "200 with active: true",
        response: preview(introspectJson),
      });

      const revoked = await handlers.handleRevoke(
        post("/api/public/oauth/revoke", {
          token: accessToken,
          client_id: client.client_id,
          client_secret: data.clientSecret,
        }),
      );
      const afterRevoke = await handlers.handleMeGet(get("/api/public/v1/me", accessToken));
      record({
        title: "Revocation immediately blocks the token",
        detail: "Sign-out or a security incident kills access at once.",
        method: "POST",
        path: "/api/public/oauth/revoke",
        status: revoked.status,
        ok: revoked.ok && afterRevoke.status === 401,
        expectation: "Revoke 200, then 401 on the next API call",
        response: preview({ revoke_status: revoked.status, next_call_status: afterRevoke.status }),
      });
    }

    /* --- 13. API key path, when one was supplied --- */
    if (data.apiKey) {
      const keyRequest = (path: string) =>
        new Request(`${issuer}${path}`, { headers: { "x-api-key": data.apiKey! } });

      const keyMe = await handlers.handleMeGet(keyRequest("/api/public/v1/me"));
      const keyMeJson = await readJson(keyMe);
      record({
        title: "API key authenticates server-to-server calls",
        detail: "Machine integrations use a scoped key instead of a user token.",
        method: "GET",
        path: "/api/public/v1/me",
        status: keyMe.status,
        ok: keyMe.ok,
        expectation: "200 when the key carries identity:read",
        response: preview(keyMeJson),
      });

      const { data: keyRow } = await supabaseAdmin
        .from("api_keys")
        .select("scopes, revoked_at, expires_at, environment")
        .eq("key_hash", oauth.sha256hex(data.apiKey))
        .maybeSingle();
      const keyScopes = keyRow?.scopes ?? [];

      const keyOrgs = await handlers.handleOrganizations(keyRequest("/api/public/v1/organizations"));
      const orgAllowed = keyScopes.includes("organizations:read");
      record({
        title: orgAllowed
          ? "API key reads organization permissions"
          : "API key without organizations:read is refused",
        detail: "Scope checks apply identically to keys and tokens.",
        method: "GET",
        path: "/api/public/v1/organizations",
        status: keyOrgs.status,
        ok: orgAllowed ? keyOrgs.ok : keyOrgs.status === 403,
        expectation: orgAllowed ? "200 with memberships" : "403 insufficient_scope",
        response: preview(await readJson(keyOrgs)),
      });

      const keyAudit = await handlers.handleAudit(keyRequest("/api/public/v1/audit"));
      const auditAllowed = keyScopes.includes("audit:read");
      record({
        title: auditAllowed ? "API key reads the audit log" : "API key without audit:read is refused",
        detail: "Every REST endpoint enforces its own scope.",
        method: "GET",
        path: "/api/public/v1/audit",
        status: keyAudit.status,
        ok: auditAllowed ? keyAudit.ok : keyAudit.status === 403,
        expectation: auditAllowed ? "200 with events" : "403 insufficient_scope",
        response: preview(await readJson(keyAudit)),
      });

      const tampered = await handlers.handleMeGet(
        new Request(`${issuer}/api/public/v1/me`, {
          headers: { "x-api-key": `${data.apiKey.slice(0, -3)}xyz` },
        }),
      );
      record({
        title: "Tampered API key is rejected",
        detail: "Only the exact key hash is accepted.",
        method: "GET",
        path: "/api/public/v1/me",
        status: tampered.status,
        ok: tampered.status === 401,
        expectation: "401 invalid_token",
        response: preview(await readJson(tampered)),
      });
    }

    const passed = steps.filter((step) => step.ok).length;
    const failed = steps.length - passed;

    const { writeAuditLog } = await import("./identity.server");
    await writeAuditLog({
      userId: context.userId,
      eventType: "integration.test_run",
      category: "security",
      status: failed === 0 ? "success" : "warning",
      description: `Integration test for ${client.name}: ${passed} passed, ${failed} failed`,
      metadata: { client_id: client.client_id, passed, failed },
    });

    return { ok: failed === 0, clientId: client.client_id, issuer, passed, failed, steps };
  });
