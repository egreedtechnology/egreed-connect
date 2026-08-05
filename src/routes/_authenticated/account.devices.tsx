import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MonitorSmartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listDevices, revokeDevice, setDeviceTrust } from "@/lib/identity.functions";

export const Route = createFileRoute("/_authenticated/account/devices")({
  head: () => ({
    meta: [
      { title: "Devices — EGREED Identity" },
      {
        name: "description",
        content: "Review the devices signed in to your EGREED account and revoke access.",
      },
    ],
  }),
  component: DevicesPage,
});

function DevicesPage() {
  const queryClient = useQueryClient();
  const fetchDevices = useServerFn(listDevices);
  const trust = useServerFn(setDeviceTrust);
  const revoke = useServerFn(revokeDevice);

  const { data, isPending } = useQuery({
    queryKey: ["identity", "devices"],
    queryFn: () => fetchDevices(),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["identity", "devices"] });
    queryClient.invalidateQueries({ queryKey: ["identity", "overview"] });
  }

  const trustMutation = useMutation({
    mutationFn: (vars: { deviceId: string; trusted: boolean }) => trust({ data: vars }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (deviceId: string) => revoke({ data: { deviceId } }),
    onSuccess: () => {
      toast.success("Device access revoked");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Devices</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every browser and device that has authenticated with your EGREED ID.
        </p>
      </header>

      {isPending ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <ul className="space-y-3">
          {(data ?? []).map((device) => (
            <li key={device.id} className="surface-panel flex flex-wrap items-center gap-4 p-5">
              <MonitorSmartphone className="size-5 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{device.device_label}</p>
                  {device.is_trusted && <Badge variant="secondary">Trusted</Badge>}
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {device.browser ?? "unknown"} · {device.os ?? "unknown"} ·{" "}
                  {device.ip_address ?? "no ip"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last seen {new Date(device.last_seen_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={trustMutation.isPending}
                  onClick={() =>
                    trustMutation.mutate({ deviceId: device.id, trusted: !device.is_trusted })
                  }
                >
                  {device.is_trusted ? "Remove trust" : "Trust device"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(device.id)}
                >
                  Revoke
                </Button>
              </div>
            </li>
          ))}
          {(data ?? []).length === 0 && (
            <li className="surface-panel p-6 text-sm text-muted-foreground">
              No devices recorded yet.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
