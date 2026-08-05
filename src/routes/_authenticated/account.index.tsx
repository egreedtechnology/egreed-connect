import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, MonitorSmartphone, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getIdentityOverview } from "@/lib/identity.functions";
import { initials, useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/account/")({
  head: () => ({
    meta: [
      { title: "Account overview — EGREED Identity" },
      {
        name: "description",
        content: "Your EGREED ID at a glance: security score, devices, alerts and recent activity.",
      },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { user } = useCurrentUser();
  const fetchOverview = useServerFn(getIdentityOverview);
  const { data, isPending } = useQuery({
    queryKey: ["identity", "overview"],
    queryFn: () => fetchOverview(),
  });

  const name = data?.profile?.display_name ?? user?.email ?? "there";

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {(data?.roles ?? []).map((role) => (
            <Badge key={role} variant="secondary" className="capitalize">
              {role}
            </Badge>
          ))}
        </div>
      </header>

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <article className="surface-panel p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" aria-hidden />
                Security score
              </div>
              <p className="mt-3 font-display text-3xl font-semibold">{data?.securityScore ?? 0}%</p>
              <Progress value={data?.securityScore ?? 0} className="mt-3" />
            </article>
            <article className="surface-panel p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MonitorSmartphone className="size-4 text-primary" aria-hidden />
                Devices
              </div>
              <p className="mt-3 font-display text-3xl font-semibold">{data?.deviceCount ?? 0}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {data?.trustedDeviceCount ?? 0} marked as trusted
              </p>
            </article>
            <article className="surface-panel p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TriangleAlert className="size-4 text-primary" aria-hidden />
                Open alerts
              </div>
              <p className="mt-3 font-display text-3xl font-semibold">{data?.unreadAlerts ?? 0}</p>
              <Button asChild variant="link" className="mt-1 h-auto p-0 text-xs">
                <Link to="/account/security">Review security</Link>
              </Button>
            </article>
          </section>

          <section className="surface-panel p-6">
            <h2 className="font-display text-lg font-semibold">Harden your account</h2>
            <ul className="mt-4 space-y-3">
              {(data?.checklist ?? []).map((item) => (
                <li key={item.id} className="flex gap-3">
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="surface-panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Recent activity</h2>
              <Button asChild variant="link" className="h-auto p-0 text-xs">
                <Link to="/account/activity">View all</Link>
              </Button>
            </div>
            <ul className="mt-4 divide-y divide-border">
              {(data?.recentActivity ?? []).map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{entry.description ?? entry.event_type}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {entry.event_type} · {entry.device_label ?? "unknown device"}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
              {(data?.recentActivity ?? []).length === 0 && (
                <li className="py-3 text-sm text-muted-foreground">No activity recorded yet.</li>
              )}
            </ul>
          </section>
        </>
      )}

      <p className="text-xs text-muted-foreground">Signed in as {initials(user?.email)} · {user?.email}</p>
    </div>
  );
}
