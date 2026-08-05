import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Fingerprint,
  KeyRound,
  Lock,
  ScrollText,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ECOSYSTEM_APPS, EGREED } from "@/lib/egreed";

const TITLE = "EGREED Identity — Single sign-on for the EGREED ecosystem";
const DESCRIPTION =
  "One secure EGREED account for every product. Enterprise SSO, OAuth 2.1 / OIDC, organizations, RBAC and a developer console for API keys and applications.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Landing,
});

const CAPABILITIES = [
  {
    icon: Fingerprint,
    title: "Single sign-on",
    body: "One EGREED account unlocks every product in the ecosystem, with session continuity across subdomains.",
  },
  {
    icon: ShieldCheck,
    title: "Adaptive security",
    body: "Device trust, sign-in alerts, security scoring and an immutable audit trail on every identity event.",
  },
  {
    icon: Terminal,
    title: "Developer console",
    body: "Register OAuth 2.1 clients, mint scoped API keys and ship integrations without leaving the portal.",
  },
  {
    icon: Building2,
    title: "Organizations & RBAC",
    body: "Model tenants, invite teams and enforce least-privilege with owner-to-guest role hierarchies.",
  },
  {
    icon: Lock,
    title: "Standards-based",
    body: "OAuth 2.1, OpenID Connect discovery, PKCE and rotating refresh tokens by default.",
  },
  {
    icon: ScrollText,
    title: "Compliance ready",
    body: "Exportable audit logs, privacy controls and per-user data residency preferences.",
  },
] as const;

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <main>
        <section className="bg-hero relative overflow-hidden">
          <div className="bg-grid absolute inset-0 opacity-[0.35]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-5 py-24 md:py-32">
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
              Identity infrastructure · {EGREED.domain}
            </Badge>
            <h1 className="mt-6 max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
              One account for the entire <span className="text-gradient">EGREED</span> ecosystem
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">{DESCRIPTION}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  Create your EGREED ID
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/docs">Developer documentation</Link>
              </Button>
            </div>

            <dl className="mt-16 grid max-w-3xl grid-cols-2 gap-8 border-t border-border pt-8 sm:grid-cols-4">
              {[
                ["OAuth 2.1", "+ OIDC"],
                ["RBAC", "org-aware"],
                ["Audit", "immutable"],
                ["MFA", "device trust"],
              ].map(([term, detail]) => (
                <div key={term}>
                  <dt className="font-display text-xl font-semibold text-foreground">{term}</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            Built like the platforms you already trust
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            EGREED Identity is the authentication control plane for every EGREED product — designed
            for the same rigour as Google, Auth0 and Keycloak.
          </p>

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <article key={item.title} className="surface-panel p-6">
                <item.icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-4 font-display text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              Connected products
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Every EGREED application delegates authentication to Identity. Sign in once, move
              freely.
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ECOSYSTEM_APPS.map((app) => (
                <li key={app.slug} className="surface-panel p-5">
                  <p className="font-display text-base font-semibold">{app.name}</p>
                  <p className="mt-1 font-mono text-xs text-primary">
                    {app.slug}.egreedtech.org · {app.status}
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">{app.summary}</p>
                </li>
              ))}

            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-24 text-center">
          <KeyRound className="mx-auto size-6 text-primary" aria-hidden />
          <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Ready to secure your EGREED ID?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Create an account in seconds, then manage devices, sessions, API keys and OAuth
            applications from a single console.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/auth">
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
