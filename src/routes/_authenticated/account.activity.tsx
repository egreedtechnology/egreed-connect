import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listActivity } from "@/lib/identity.functions";

const CATEGORIES = ["all", "authentication", "security", "account", "privacy"] as const;
type Category = (typeof CATEGORIES)[number];

export const Route = createFileRoute("/_authenticated/account/activity")({
  head: () => ({
    meta: [
      { title: "Activity — EGREED Identity" },
      {
        name: "description",
        content: "An immutable audit trail of every event on your EGREED account.",
      },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const fetchActivity = useServerFn(listActivity);
  const [category, setCategory] = useState<Category>("all");

  const { data, isPending } = useQuery({
    queryKey: ["identity", "activity", category],
    queryFn: () => fetchActivity({ data: { category, limit: 100 } }),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Append-only audit log of authentication, security, account and privacy events.
        </p>
      </header>

      <Tabs value={category} onValueChange={(value) => setCategory(value as Category)}>
        <TabsList>
          {CATEGORIES.map((item) => (
            <TabsTrigger key={item} value={item} className="capitalize">
              {item}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <ul className="surface-panel divide-y divide-border p-2">
          {(data ?? []).map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{entry.description ?? entry.event_type}</p>
                  <Badge
                    variant={entry.status === "success" ? "secondary" : "destructive"}
                    className="capitalize"
                  >
                    {entry.status}
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {entry.event_category} · {entry.event_type} · {entry.ip_address ?? "no ip"}
                </p>
              </div>
              <time className="text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
              </time>
            </li>
          ))}
          {(data ?? []).length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">No events in this category.</li>
          )}
        </ul>
      )}
    </div>
  );
}
