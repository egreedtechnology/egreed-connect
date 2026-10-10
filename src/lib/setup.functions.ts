import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/auth-middleware";

export type CheckItem = { id: string; label: string; ok: boolean; detail: string };

/** Validates a client ID, issuer and API key the developer is about to deploy. */
export const checkConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clientId: z.string().trim().max(200),
        issuer: z.string().trim().max(300),
        apiKey: z.string().trim().max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; items: CheckItem[] }> => {
    const { sha256hex, issuerFromRequest } = await import("@/lib/oauth.server");
    const items: CheckItem[] = [];
    const expectedIssuer = issuerFromRequest(getRequest());

    // Issuer
    const issuer = data.issuer.replace(/\/+$/, "");
    items.push({
      id: "issuer",
      label: "Issuer",
      ok: issuer === expectedIssuer,
      detail:
        issuer === expectedIssuer
          ? "Matches this EGREED Identity deployment."
          : `Expected ${expectedIssuer} (no trailing slash). Tokens will fail issuer validation otherwise.`,
    });

    // Client ID
    if (!data.clientId) {
      items.push({ id: "client", label: "Client ID", ok: false, detail: "No client ID provided." });
    } else {
      const { data: client } = await context.supabase
        .from("oauth_clients")
        .select("name, is_active, redirect_uris, scopes, client_type")
        .eq("client_id", data.clientId)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (!client) {
        items.push({
          id: "client",
          label: "Client ID",
          ok: false,
          detail: "No application with this client ID exists in your account.",
        });
      } else {
        items.push({
          id: "client",
          label: "Client ID",
          ok: client.is_active,
          detail: client.is_active
            ? `Belongs to "${client.name}" (${client.client_type}).`
            : `"${client.name}" is disabled — enable it before users can sign in.`,
        });
        const httpsOk = client.redirect_uris.every(
          (u: string) => u.startsWith("https://") || u.startsWith("http://localhost"),
        );
        items.push({
          id: "redirects",
          label: "Redirect URLs",
          ok: client.redirect_uris.length > 0 && httpsOk,
          detail: httpsOk
            ? `${client.redirect_uris.length} allowed: ${client.redirect_uris.join(", ")}`
            : "Use https:// redirect URLs (http is only allowed for localhost).",
        });
        items.push({
          id: "openid",
          label: "Sign-in scope",
          ok: client.scopes.includes("openid"),
          detail: client.scopes.includes("openid")
            ? "openid is enabled — ID tokens will be issued."
            : "Add the openid scope so the app receives an ID token.",
        });
      }
    }

    // API key
    if (!data.apiKey) {
      items.push({ id: "key", label: "API key", ok: false, detail: "No API key provided." });
    } else if (!data.apiKey.startsWith("egr_")) {
      items.push({
        id: "key",
        label: "API key",
        ok: false,
        detail: "API keys start with egr_live_ or egr_test_.",
      });
    } else {
      const { data: key } = await context.supabase
        .from("api_keys")
        .select("name, scopes, environment, expires_at, revoked_at")
        .eq("key_hash", sha256hex(data.apiKey))
        .eq("owner_id", context.userId)
        .maybeSingle();
      const expired = key?.expires_at && new Date(key.expires_at).getTime() < Date.now();
      items.push({
        id: "key",
        label: "API key",
        ok: Boolean(key && !key.revoked_at && !expired),
        detail: !key
          ? "Key not recognised — check for copy errors or create a new one."
          : key.revoked_at
            ? `"${key.name}" has been revoked.`
            : expired
              ? `"${key.name}" has expired.`
              : `"${key.name}" (${key.environment}) is valid. Scopes: ${key.scopes.join(", ")}.`,
      });
      if (key && !key.revoked_at && !expired && !key.scopes.includes("identity:read")) {
        items.push({
          id: "key-scope",
          label: "API key scopes",
          ok: false,
          detail: "identity:read is missing — calls to /api/public/v1/me will be refused.",
        });
      }
    }

    return { ok: items.every((i) => i.ok), items };
  });

/** Uses AI to write setup instructions tailored to the developer's stack. */
export const generateSetupGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        framework: z.string().trim().min(2).max(80),
        requirements: z.string().trim().max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ guide: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI setup guide is not configured.");
    const issuer = issuerFrom();

    const instructions = `You are the EGREED Identity integration assistant. Write concise, accurate Markdown setup instructions for adding "Sign in with EGREED ID" to the developer's app.
Facts (use exactly):
- Issuer: ${issuer}
- Discovery: ${issuer}/.well-known/openid-configuration
- Authorize: ${issuer}/oauth/authorize ; Token: ${issuer}/api/public/oauth/token ; UserInfo: ${issuer}/api/public/oauth/userinfo ; JWKS: ${issuer}/api/public/oauth/jwks ; Revoke: ${issuer}/api/public/oauth/revoke
- Authorization code flow with PKCE S256; refresh tokens with scope offline_access (rotating); ID tokens RS256.
- Scopes: openid profile email phone offline_access organizations:read.
- REST API: ${issuer}/api/public/v1/me (identity:read), /organizations (organizations:read), /sessions, /audit; send API key as "Authorization: Bearer egr_..." from servers only.
- Environment variables: EGREED_ID_ISSUER, EGREED_ID_CLIENT_ID, EGREED_ID_CLIENT_SECRET (confidential apps only), EGREED_ID_API_KEY.
- Signup and login are the same flow: new users create their EGREED ID on the EGREED sign-in page.
Include: env setup, the library to use for the framework, a callback route, login/logout, reading the user, calling the REST API, and common pitfalls. Never invent endpoints.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        Authorization: `Bearer ${apiKey}`,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions,
        input: `Framework: ${data.framework}\nRequirements: ${data.requirements || "Standard login and signup."}`,
        reasoning: { effort: "low" },
        store: false,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => null)) as { message?: string; error?: { message?: string } } | null;
      const message = body?.message ?? body?.error?.message;
      if (response.status === 429) throw new Error("Too many requests — try again in a minute.");
      if (response.status === 402) throw new Error(message ?? "AI credits are exhausted for this workspace.");
      throw new Error(message ?? `The AI service returned ${response.status}.`);
    }

    // Consume the SSE stream server-side and collect the output text.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let guide = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload) as { type?: string; delta?: string; message?: string };
          if (event.type === "response.output_text.delta" && event.delta) guide += event.delta;
          if (event.type === "error") throw new Error(event.message ?? "AI generation failed.");
        } catch (cause) {
          if (cause instanceof Error && cause.message !== "Unexpected end of JSON input" && !(cause instanceof SyntaxError)) throw cause;
        }
      }
    }
    if (!guide.trim()) throw new Error("The AI returned no instructions. Please try again.");
    return { guide };
  });

function issuerFrom(): string {
  const request = getRequest();
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
