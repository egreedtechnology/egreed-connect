import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Boxes, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listApiKeys, listOAuthClients } from "@/lib/identity.functions";
import { API_SCOPES, OAUTH_SCOPES } from "@/lib/egreed";

export const Route = createFileRoute("/_authenticated/developer/")({
  head: () => ({
    meta: [
      { title: "Developer console — EGREED Identity" },
      {
        name: "description",
        content: "Register OAuth 2.1 applications and mint scoped API keys for EGREED Identity.",
      },
    ],
  }),
  component: DeveloperHome,
});

function DeveloperHome() {
  const fetchClients = useServerFn(listOAuthClients);
  const fetchKeys = useServerFn(listApiKeys);

  const clients = useQuery({ queryKey: ["developer", "clients"], queryFn: () => fetchClients() });
  const keys = useQuery({ queryKey: ["developer", "keys"], queryFn: () => fetchKeys() });

  const activeKeys = (keys.data ?? []).filter((key) => !key.revoked_at).length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Developer console</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Build on EGREED Identity with OAuth 2.1 / OIDC applications and scoped API keys.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="surface-panel p-6">
          <Boxes className="size-5 text-primary" aria-hidden />
          <h2 className="mt-4 font-display text-lg font-semibold">OAuth applications</h2>
          {clients.isPending ? (
            <Skeleton className="mt-3 h-8 w-16" />
          ) : (
            <p className="mt-3 font-display text-3xl font-semibold">{clients.data?.length ?? 0}</p>
          )}
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/developer/applications">Manage applications</Link>
          </Button>
        </article>

        <article className="surface-panel p-6">
          <KeyRound className="size-5 text-primary" aria-hidden />
          <h2 className="mt-4 font-display text-lg font-semibold">Active API keys</h2>
          {keys.isPending ? (
            <Skeleton className="mt-3 h-8 w-16" />
          ) : (
            <p className="mt-3 font-display text-3xl font-semibold">{activeKeys}</p>
          )}
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/developer/keys">Manage keys</Link>
          </Button>
        </article>
      </section>

      <section className="surface-panel p-6">
        <h2 className="font-display text-lg font-semibold">Available scopes</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs tracking-widest text-muted-foreground uppercase">OAuth scopes</p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-foreground">
              {OAUTH_SCOPES.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs tracking-widest text-muted-foreground uppercase">API key scopes</p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-foreground">
              {API_SCOPES.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
