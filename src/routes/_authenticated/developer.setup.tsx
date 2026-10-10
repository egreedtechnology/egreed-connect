import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateSetupGuide } from "@/lib/setup.functions";

export const Route = createFileRoute("/_authenticated/developer/setup")({
  head: () => ({
    meta: [
      { title: "Setup assistant — EGREED Identity" },
      {
        name: "description",
        content: "Get AI-written EGREED ID login and signup instructions tailored to your framework.",
      },
      { property: "og:title", content: "Setup assistant — EGREED Identity" },
      {
        property: "og:description",
        content: "Tailored EGREED Identity integration steps for your stack.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const generate = useServerFn(generateSetupGuide);
  const [framework, setFramework] = useState("");
  const [requirements, setRequirements] = useState("");

  const mutation = useMutation({
    mutationFn: () => generate({ data: { framework, requirements } }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Setup assistant</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Describe your app and get step-by-step instructions for adding EGREED ID login and
          signup.
        </p>
      </header>

      <form
        className="surface-panel space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="framework">Framework or platform</Label>
          <Input
            id="framework"
            required
            minLength={2}
            maxLength={80}
            placeholder="Next.js, Laravel, Django, React Native…"
            value={framework}
            onChange={(e) => setFramework(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="requirements">Requirements</Label>
          <Textarea
            id="requirements"
            rows={4}
            maxLength={2000}
            placeholder="e.g. Server-side sessions, read organization roles, call the REST API from a cron job"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {mutation.isPending ? "Writing instructions…" : "Generate instructions"}
        </Button>
      </form>

      {mutation.data && (
        <section className="surface-panel space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Your setup guide</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(mutation.data.guide);
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
            {mutation.data.guide}
          </pre>
          <p className="text-xs text-muted-foreground">
            AI-generated — review before shipping.
          </p>
        </section>
      )}
    </div>
  );
}
