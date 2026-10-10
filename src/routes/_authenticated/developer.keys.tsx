import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { checkConnection } from "@/lib/setup.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { API_SCOPES, API_SCOPE_DETAILS } from "@/lib/egreed";
import {
  createApiKey,
  listApiKeys,
  listOAuthClients,
  revokeApiKey,
} from "@/lib/identity.functions";

export const Route = createFileRoute("/_authenticated/developer/keys")({
  head: () => ({
    meta: [
      { title: "API keys — EGREED Identity" },
      {
        name: "description",
        content: "Create and revoke scoped API keys for the EGREED Identity API.",
      },
    ],
  }),
  component: KeysPage,
});

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "0", label: "No expiry" },
];

function KeysPage() {
  const queryClient = useQueryClient();
  const fetchKeys = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);

  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("test");
  const [expiry, setExpiry] = useState("90");
  const [scopes, setScopes] = useState<string[]>(["identity:read"]);
  const [plaintext, setPlaintext] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["developer", "keys"],
    queryFn: () => fetchKeys(),
  });

  const fetchClients = useServerFn(listOAuthClients);
  const { data: clients } = useQuery({
    queryKey: ["developer", "clients"],
    queryFn: () => fetchClients(),
  });
  const [pickedClientId, setEnvClientId] = useState("");
  const envClientId = pickedClientId || clients?.[0]?.client_id || "";
  const issuer = typeof window === "undefined" ? "" : window.location.origin;
  const envBlock = `EGREED_ID_API_KEY=${plaintext ?? ""}\nEGREED_ID_CLIENT_ID=${envClientId || "<register an application>"}\nEGREED_ID_ISSUER=${issuer}`;

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: { name, environment, scopes, expiresInDays: Number(expiry) },
      }),
    onSuccess: (result) => {
      setPlaintext(result.plaintext);
      setName("");
      toast.success("API key created");
      queryClient.invalidateQueries({ queryKey: ["developer", "keys"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revoke({ data: { keyId } }),
    onSuccess: () => {
      toast.success("API key revoked");
      queryClient.invalidateQueries({ queryKey: ["developer", "keys"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">API keys</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Scoped credentials for server-to-server calls to the EGREED Identity API.
        </p>
      </header>

      <section className="surface-panel p-6">
        <h2 className="font-display text-lg font-semibold">Using a key</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send the key as a bearer token (or in the <code className="font-mono">X-API-Key</code>{" "}
          header) from your backend — never from a browser.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md bg-secondary p-4 font-mono text-xs">
          {`curl ${typeof window === "undefined" ? "" : window.location.origin}/api/public/v1/me \\
  -H "Authorization: Bearer egr_live_..."`}
        </pre>
        <p className="mt-3 text-xs text-muted-foreground">
          Keys are stored as SHA-256 hashes, honour their scopes and expiry, and record last use on
          every call.
        </p>
      </section>


      {plaintext && (
        <div className="surface-panel border-primary/50 p-5">
          <p className="text-sm font-medium">Copy your credentials now</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Only a hash is stored — this is the only time the key is shown. Paste these into the
            environment settings of the EGREED system you are connecting.
          </p>
          {(clients ?? []).length > 1 && (
            <div className="mt-3 max-w-xs space-y-1">
              <Label>Application (for client ID)</Label>
              <Select value={envClientId} onValueChange={setEnvClientId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(clients ?? []).map((c) => (
                    <SelectItem key={c.client_id} value={c.client_id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <pre className="mt-3 overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs">
            {envBlock}
          </pre>
          {!envClientId && (
            <p className="mt-2 text-xs text-muted-foreground">
              Register an OAuth application to get a client ID.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(envBlock);
                toast.success("Credentials copied");
              }}
            >
              Copy all
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const blob = new Blob([`# EGREED Identity — keep this file private, never commit it\n${envBlock}\n`], {
                  type: "text/plain",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = ".env";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download .env
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={checkMutation.isPending}
              onClick={() => checkMutation.mutate()}
            >
              {checkMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Check connection
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPlaintext(null)}>
              I've stored it safely
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The file is created in your browser only. Add <code className="font-mono">.env</code> to
            your <code className="font-mono">.gitignore</code>.
          </p>
          {checkMutation.data && (
            <ul className="mt-4 space-y-2">
              {checkMutation.data.items.map((item) => (
                <li key={item.id} className="flex gap-2 text-xs">
                  {item.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-destructive" />
                  )}
                  <span>
                    <span className="font-medium">{item.label}:</span>{" "}
                    <span className="text-muted-foreground">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form
        className="surface-panel space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate();
        }}
      >
        <h2 className="font-display text-lg font-semibold">Create a key</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              required
              minLength={2}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Billing service"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="key-env">Environment</Label>
            <Select
              value={environment}
              onValueChange={(value) => setEnvironment(value as "live" | "test")}
            >
              <SelectTrigger id="key-env">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="key-expiry">Expires</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger id="key-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Scopes</legend>
          <p className="text-xs text-muted-foreground">
            A key can only reach the endpoints its scopes allow — every call is checked again on the
            server, and anything outside these scopes is refused.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {API_SCOPES.map((scope) => {
              const detail = API_SCOPE_DETAILS[scope];
              const active = scopes.includes(scope);
              return (
                <label
                  key={scope}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                    active ? "border-primary/60 bg-primary/5" : "border-border/60 hover:border-border"
                  }`}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={active}
                    onCheckedChange={(checked) =>
                      setScopes((prev) =>
                        checked ? [...new Set([...prev, scope])] : prev.filter((s) => s !== scope),
                      )
                    }
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{detail.label}</span>
                      <Badge
                        variant={detail.risk === "high" ? "destructive" : "secondary"}
                        className="text-[10px] uppercase"
                      >
                        {detail.risk} risk
                      </Badge>
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">{scope}</span>
                    <span className="block text-xs text-muted-foreground">{detail.description}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground/80">
                      {detail.endpoints.join(" · ")}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>


        <Button type="submit" disabled={createMutation.isPending || scopes.length === 0}>
          {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Create API key
        </Button>
      </form>

      {isPending ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <ul className="space-y-3">
          {(data ?? []).map((key) => (
            <li key={key.id} className="surface-panel flex flex-wrap items-start gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{key.name}</p>
                  <Badge variant="outline" className="uppercase">
                    {key.environment}
                  </Badge>
                  {key.revoked_at && <Badge variant="destructive">Revoked</Badge>}
                </div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {key.key_prefix}••••••••
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {key.scopes.join(" ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created {new Date(key.created_at).toLocaleDateString()} ·{" "}
                  {key.expires_at
                    ? `expires ${new Date(key.expires_at).toLocaleDateString()}`
                    : "no expiry"}
                </p>
              </div>
              {!key.revoked_at && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(key.id)}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
          {(data ?? []).length === 0 && (
            <li className="surface-panel p-6 text-sm text-muted-foreground">
              No API keys yet.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
