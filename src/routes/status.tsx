import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Badge } from "@/components/ui/badge";
import { SUBDOMAINS } from "@/lib/egreed";

const TITLE = "Platform status — EGREED Identity";
const DESCRIPTION = "Live availability of EGREED Identity authentication, API and developer surfaces.";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-5 py-20">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Platform status</h1>
        <p className="mt-4 text-muted-foreground">{DESCRIPTION}</p>

        <div className="surface-panel mt-10 flex items-center gap-3 p-5">
          <CheckCircle2 className="size-5 text-primary" aria-hidden />
          <p className="text-sm font-medium">All identity services operational</p>
        </div>

        <ul className="mt-8 divide-y divide-border">
          {SUBDOMAINS.map((entry) => (
            <li key={entry.host} className="flex flex-wrap items-center justify-between gap-2 py-4">
              <div>
                <code className="font-mono text-sm text-foreground">{entry.host}</code>
                <p className="text-xs text-muted-foreground">{entry.purpose}</p>
              </div>
              <Badge variant="secondary">Operational</Badge>
            </li>
          ))}
        </ul>
      </main>
      <PublicFooter />
    </div>
  );
}
