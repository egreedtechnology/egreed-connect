import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildSampleRequests, runIntegrationTest } from "@/lib/integration-test.functions";
import { listOAuthClients } from "@/lib/identity.functions";

export const Route = createFileRoute("/_authenticated/developer/testing")({
  head: () => ({
    meta: [
      { title: "Integration tester — EGREED Identity" },
      {
        name: "description",
        content:
          "Generate sample authorize, token and userinfo requests and verify them end to end against your EGREED OAuth configuration.",
      },
      { property: "og:title", content: "Integration tester — EGREED Identity" },
      {
        property: "og:description",
        content: "Verify OAuth token exchange, userinfo and permissions for your EGREED integration.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TestingPage,
});

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("Copied");
          }}
        >
          Copy
        </Button>
      </div>
      <pre className="surface-panel overflow-x-auto rounded-lg p-4 font-mono text-xs leading-relaxed text-foreground/90">
        {value}
      </pre>
    </div>
  );
}

function TestingPage() {
  const fetchClients = useServerFn(listOAuthClients);
  const buildSamples = useServerFn(buildSampleRequests);
  const runTest = useServerFn(runIntegrationTest);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [apiKey, setApiKey] = useState("");

  const { data: clients, isPending } = useQuery({
    queryKey: ["developer", "clients"],
    queryFn: () => fetchClients(),
  });

  const selected = (clients ?? []).find((client) => client.client_id === clientId);

  const samples = useMutation({
    mutationFn: () => buildSamples({ data: { clientId } }),
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: () =>
      runTest({
        data: {
          clientId,
          ...(clientSecret ? { clientSecret } : {}),
          ...(apiKey ? { apiKey } : {}),
        },
      }),
    onSuccess: (run) =>
      run.ok
        ? toast.success(`All ${run.passed} checks passed`)
        : toast.error(`${run.failed} of ${run.passed + run.failed} checks failed`),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Integration tester</h1>
        <p className="max-w-2xl text-muted-foreground">
          Generate ready-to-run sign-in and token requests for one of your applications, then run a
          full simulated handshake — token exchange, identity claims and permissions — to confirm an
          external EGREED system can connect.
        </p>
      </header>

      <section className="surface-panel space-y-4 rounded-xl p-6">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (clients ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Register an application first, then come back to test it.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Application</Label>
              <Select
                value={clientId}
                onValueChange={(value) => {
                  setClientId(value);
                  samples.reset();
                  test.reset();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an application" />
                </SelectTrigger>
                <SelectContent>
                  {(clients ?? []).map((client) => (
                    <SelectItem key={client.client_id} value={client.client_id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret">
                Client secret{" "}
                <span className="text-muted-foreground">
                  {selected?.client_type === "confidential" ? "(required)" : "(not needed)"}
                </span>
              </Label>
              <Input
                id="secret"
                type="password"
                placeholder="egr_secret_…"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                disabled={selected?.client_type !== "confidential"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apikey">
                API key <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="apikey"
                type="password"
                placeholder="egr_live_…"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Secrets and keys are used for this run only and never stored.
        </p>
      </section>

      {clientId ? (
        <Tabs defaultValue="samples">
          <TabsList>
            <TabsTrigger value="samples">Sample requests</TabsTrigger>
            <TabsTrigger value="run">End-to-end test</TabsTrigger>
          </TabsList>

          <TabsContent value="samples" className="space-y-6 pt-6">
            <Button onClick={() => samples.mutate()} disabled={samples.isPending}>
              {samples.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Generate requests
            </Button>

            {samples.data ? (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{samples.data.clientType}</Badge>
                  {samples.data.scopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="font-mono text-xs">
                      {scope}
                    </Badge>
                  ))}
                </div>
                <CodeBlock label="1. Authorize URL (open in a browser)" value={samples.data.authorizeUrl} />
                <CodeBlock label="2. Exchange the code for tokens" value={samples.data.tokenCurl} />
                <CodeBlock label="3. Read the identity (UserInfo)" value={samples.data.userinfoCurl} />
                <CodeBlock label="4. Identity REST endpoint" value={samples.data.meCurl} />
                <CodeBlock label="5. Permissions (organizations)" value={samples.data.organizationsCurl} />
                <CodeBlock label="Stay signed in (refresh)" value={samples.data.refreshCurl} />
                <CodeBlock label="Validate a token (introspection)" value={samples.data.introspectCurl} />
                <CodeBlock
                  label="PKCE pair used above"
                  value={`code_verifier: ${samples.data.codeVerifier}\ncode_challenge: ${samples.data.codeChallenge}\nmethod: S256`}
                />
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="run" className="space-y-6 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => test.mutate()} disabled={test.isPending}>
                {test.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Play className="mr-2 size-4" />
                )}
                Run integration test
              </Button>
              {test.data ? (
                <span className="text-sm text-muted-foreground">
                  {test.data.passed} passed · {test.data.failed} failed
                </span>
              ) : null}
            </div>

            {test.data ? (
              <ol className="space-y-3">
                {test.data.steps.map((step) => (
                  <li key={step.id} className="surface-panel rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      {step.ok ? (
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                      ) : (
                        <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{step.title}</p>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {step.method} {step.path}
                          </Badge>
                          {step.status === null ? null : (
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {step.status}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{step.detail}</p>
                        <p className="text-xs text-muted-foreground">Expected: {step.expectation}</p>
                        <pre className="overflow-x-auto rounded-lg bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                          {step.response}
                        </pre>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                The test signs in as you against your own application, so no consent screen is shown.
                Tokens created during the run are revoked afterwards.
              </p>
            )}
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
