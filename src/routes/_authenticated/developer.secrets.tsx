import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { listProjectSecrets } from "@/lib/secrets.functions";

export const Route = createFileRoute("/_authenticated/developer/secrets")({
  head: () => ({
    meta: [
      { title: "Project secrets — EGREED Identity" },
      { name: "description", content: "See which secrets EGREED Identity uses and whether each is configured." },
    ],
  }),
  component: SecretsPage,
});

function SecretsPage() {
  const fetchSecrets = useServerFn(listProjectSecrets);
  const [revealed, setRevealed] = useState(true);
  const { data, isPending } = useQuery({
    queryKey: ["developer", "secrets"],
    queryFn: () => fetchSecrets(),
  });

  const maskName = (name: string) =>
    name.length <= 4 ? "••••" : `${name.slice(0, 2)}${"•".repeat(Math.max(6, name.length - 4))}${name.slice(-2)}`;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Project secrets</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every secret this platform reads on the server. Values are never shown — only whether each
            one is set.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRevealed((v) => !v)}
          aria-pressed={!revealed}
        >
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {revealed ? "Hide secrets" : "Show secrets"}
        </Button>
      </header>
      {isPending ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <ul className="space-y-3">
          {(data ?? []).map((s) => (
            <li key={s.name} className="surface-panel flex flex-wrap items-start gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {revealed ? (
                    <p className="font-mono text-sm font-semibold">{s.name}</p>
                  ) : (
                    <p className="font-mono text-sm font-semibold tracking-[0.2em] select-none" aria-label="Hidden secret name">
                      {maskName(s.name)}
                    </p>
                  )}
                  {s.sensitive && <Badge variant="destructive">Private</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.purpose}</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">••••••••••••</p>
              </div>
              <Badge variant={s.configured ? "secondary" : "outline"}>
                {s.configured ? "Configured" : "Not set"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
