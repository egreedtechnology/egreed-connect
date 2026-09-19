import { createFileRoute } from "@tanstack/react-router";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { API_SCOPES, EGREED, OAUTH_SCOPES, SUBDOMAINS } from "@/lib/egreed";

const TITLE = "Documentation — EGREED Identity";
const DESCRIPTION =
  "Integrate with EGREED Identity: OAuth 2.1 / OIDC endpoints, scopes, API keys and platform architecture.";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: DocsPage,
});

const ENDPOINTS = [
  ["GET", "/.well-known/openid-configuration", "Discovery document"],
  ["GET", "/api/public/oauth/jwks", "Public signing keys (RS256) for ID token verification"],
  ["GET", "/oauth/authorize", "Authorization request (PKCE S256 required for public clients)"],
  ["POST", "/api/public/oauth/token", "Token exchange, refresh rotation and client credentials"],
  ["GET", "/api/public/oauth/userinfo", "OIDC claims for the current access token"],
  ["POST", "/api/public/oauth/introspect", "Validate a token (confidential clients)"],
  ["POST", "/api/public/oauth/revoke", "Revoke an access or refresh token"],
] as const;

const REST_ENDPOINTS = [
  ["GET", "/api/public/v1/me", "identity:read or profile", "Profile, email and verification status"],
  ["PATCH", "/api/public/v1/me", "identity:write", "Update name, job title, locale and timezone"],
  ["GET", "/api/public/v1/organizations", "organizations:read", "Memberships and roles for RBAC"],
  ["GET", "/api/public/v1/sessions", "sessions:read", "Known devices and trust state"],
  ["DELETE", "/api/public/v1/sessions?device_id=", "sessions:revoke", "Remove trust from a device"],
  ["GET", "/api/public/v1/audit", "audit:read", "Security and account events for SIEM forwarding"],
] as const;

function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-5 py-20">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Documentation</h1>
        <p className="mt-4 text-muted-foreground">{DESCRIPTION}</p>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-semibold">Platform surfaces</h2>
          <ul className="mt-5 divide-y divide-border">
            {SUBDOMAINS.map((entry) => (
              <li key={entry.host} className="flex flex-wrap justify-between gap-2 py-3">
                <code className="font-mono text-sm text-primary">{entry.host}</code>
                <span className="text-sm text-muted-foreground">{entry.purpose}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-semibold">OAuth 2.1 / OIDC endpoints</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Base URL: <code className="font-mono text-primary">https://{EGREED.domain}</code>
          </p>
          <ul className="mt-5 space-y-3">
            {ENDPOINTS.map(([method, path, note]) => (
              <li key={path} className="surface-panel p-4">
                <p className="font-mono text-xs">
                  <span className="text-primary">{method}</span> {path}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{note}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14 grid gap-8 sm:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-semibold">OAuth scopes</h2>
            <ul className="mt-4 space-y-1 font-mono text-sm text-muted-foreground">
              {OAUTH_SCOPES.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold">API key scopes</h2>
            <ul className="mt-4 space-y-1 font-mono text-sm text-muted-foreground">
              {API_SCOPES.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-semibold">Identity REST API</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Every call accepts either an OAuth access token or an API key in the
            <code className="mx-1 font-mono text-primary">Authorization</code> header. Requests
            outside the granted scopes are refused with <code className="font-mono">403</code> and an
            entry in your integration access log.
          </p>
          <ul className="mt-5 space-y-3">
            {REST_ENDPOINTS.map(([method, path, scope, note]) => (
              <li key={`${method}${path}`} className="surface-panel p-4">
                <p className="font-mono text-xs">
                  <span className="text-primary">{method}</span> {path}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{note}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">scope: {scope}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-semibold">Authenticating a request</h2>
          <pre className="surface-panel mt-4 overflow-x-auto p-4 font-mono text-xs">
            {`curl https://${EGREED.domain}/api/public/v1/me \\
  -H "Authorization: Bearer egr_live_..." \\
  -H "Accept: application/json"`}
          </pre>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-semibold">Staying signed in</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Request <code className="font-mono text-primary">offline_access</code> to receive a
            refresh token. Refresh tokens rotate on every use — the previous one is invalidated, and
            reusing it revokes the whole chain.
          </p>
          <pre className="surface-panel mt-4 overflow-x-auto p-4 font-mono text-xs">
            {`curl -X POST https://${EGREED.domain}/api/public/oauth/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=refresh_token" \\
  -d "refresh_token=..." \\
  -d "client_id=egr_client_..."`}
          </pre>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
