import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { dismissAlert, getIdentityOverview, listAlerts } from "@/lib/identity.functions";

export const Route = createFileRoute("/_authenticated/account/security")({
  head: () => ({
    meta: [
      { title: "Security — EGREED Identity" },
      {
        name: "description",
        content: "Change your password, review security alerts and track your EGREED security score.",
      },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getIdentityOverview);
  const fetchAlerts = useServerFn(listAlerts);
  const dismiss = useServerFn(dismissAlert);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const overview = useQuery({
    queryKey: ["identity", "overview"],
    queryFn: () => fetchOverview(),
  });
  const alerts = useQuery({ queryKey: ["identity", "alerts"], queryFn: () => fetchAlerts() });

  const dismissMutation = useMutation({
    mutationFn: (alertId: string) => dismiss({ data: { alertId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identity", "alerts"] });
      queryClient.invalidateQueries({ queryKey: ["identity", "overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success("Password updated");
  }


  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Security</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Credentials, alerts and the health of your EGREED ID.
        </p>
      </header>

      <section className="surface-panel p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          <h2 className="font-display text-lg font-semibold">Security score</h2>
        </div>
        {overview.isPending ? (
          <Skeleton className="mt-4 h-6 w-full" />
        ) : (
          <>
            <p className="mt-3 font-display text-3xl font-semibold">
              {overview.data?.securityScore ?? 0}%
            </p>
            <Progress value={overview.data?.securityScore ?? 0} className="mt-3" />
            <Button asChild variant="link" className="mt-2 h-auto p-0 text-xs">
              <Link to="/account">See recommendations</Link>
            </Button>
          </>
        )}
      </section>

      <section className="surface-panel p-6">
        <h2 className="font-display text-lg font-semibold">Change password</h2>
        <form className="mt-4 grid gap-4 sm:max-w-md" onSubmit={changePassword}>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-fit" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Update password
          </Button>
        </form>
      </section>

      <section className="surface-panel p-6">
        <h2 className="font-display text-lg font-semibold">Security alerts</h2>
        {alerts.isPending ? (
          <Skeleton className="mt-4 h-24 w-full" />
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {(alerts.data ?? []).map((alert) => (
              <li key={alert.id} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <Badge
                      variant={alert.severity === "critical" ? "destructive" : "secondary"}
                      className="capitalize"
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{alert.body}</p>
                </div>
                {!alert.is_read && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => dismissMutation.mutate(alert.id)}
                    disabled={dismissMutation.isPending}
                  >
                    Dismiss
                  </Button>
                )}
              </li>
            ))}
            {(alerts.data ?? []).length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">
                No security alerts. Everything looks healthy.
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="surface-panel p-6">
        <h2 className="font-display text-lg font-semibold">Connected applications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Third-party apps you granted access to with your EGREED ID.
        </p>
        {connected.isPending ? (
          <Skeleton className="mt-4 h-24 w-full" />
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {(connected.data ?? []).map((grant) => (
              <li key={grant.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm break-all">{grant.client_id}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {grant.scopes.join(" ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Connected {new Date(grant.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(grant.client_id)}
                >
                  Revoke access
                </Button>
              </li>
            ))}
            {(connected.data ?? []).length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">
                No applications are connected to your account.
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
