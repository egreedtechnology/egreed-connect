import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listIntegrationAccessLog } from "@/lib/integration-log.functions";

export const Route = createFileRoute("/_authenticated/developer/logs")({
  head: () => ({
    meta: [
      { title: "Integration access log — EGREED Identity" },
      {
        name: "description",
        content:
          "Review every OAuth token exchange, refresh and API key REST call made against your EGREED Identity integrations, including failures.",
      },
      { property: "og:title", content: "Integration access log — EGREED Identity" },
      {
        property: "og:description",
        content: "Audit external integration access: token issuing, refresh usage and scope denials.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LogsPage,
});

type Outcome = "all" | "success" | "failure";

function statusVariant(status: string) {
  if (status === "success") return "secondary" as const;
  if (status === "warning") return "outline" as const;
  return "destructive" as const;
}

function LogsPage() {
  const fetchLog = useServerFn(listIntegrationAccessLog);
  const [outcome, setOutcome] = useState<Outcome>("all");

  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ["developer", "integration-log", outcome],
    queryFn: () => fetchLog({ data: { outcome, limit: 100 } }),
  });

  const entries = data ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Integration access log</h1>
        <p className="max-w-2xl text-muted-foreground">
          Every sign-in handshake, token refresh and API request made by an external EGREED system on
          your behalf — including anything that was refused and why.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={outcome} onValueChange={(value) => setOutcome(value as Outcome)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="success">Allowed</TabsTrigger>
            <TabsTrigger value="failure">Refused</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <p className="surface-panel rounded-xl p-6 text-sm text-muted-foreground">
          No integration activity yet. Run the integration tester or connect an application to see
          entries here.
        </p>
      ) : (
        <ol className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="surface-panel space-y-2 rounded-xl p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                <span className="font-mono text-xs text-foreground/90">{entry.event_type}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
              {entry.description ? (
                <p className="text-sm text-muted-foreground">{entry.description}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {entry.ip_address ?? "unknown origin"}
                {entry.user_agent ? ` · ${entry.user_agent.slice(0, 80)}` : ""}
              </p>
              {entry.metadata ? (
                <pre className="overflow-x-auto rounded-lg bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                  {entry.metadata}
                </pre>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
