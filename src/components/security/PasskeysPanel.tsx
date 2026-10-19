import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deletePasskey,
  listPasskeys,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
} from "@/lib/passkeys.functions";

export function PasskeysPanel() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listPasskeys);
  const getOptions = useServerFn(passkeyRegisterOptions);
  const verify = useServerFn(passkeyRegisterVerify);
  const remove = useServerFn(deletePasskey);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useQuery({ queryKey: ["identity", "passkeys"], queryFn: () => fetchList() });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Passkey removed");
      qc.invalidateQueries({ queryKey: ["identity", "passkeys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function add() {
    setBusy(true);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const options = await getOptions();
      const response = await startRegistration({ optionsJSON: options as never });
      await verify({ data: { name: name.trim() || "Passkey", response } });
      setName("");
      toast.success("Passkey added. You can now sign in with it.");
      qc.invalidateQueries({ queryKey: ["identity", "passkeys"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Passkey setup was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-panel p-6">
      <div className="flex items-center gap-2">
        <Fingerprint className="size-4 text-primary" aria-hidden />
        <h2 className="font-display text-lg font-semibold">Passkeys</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Sign in with your fingerprint, face or security key instead of a password.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Name, e.g. My laptop"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button onClick={add} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Add a passkey
        </Button>
      </div>
      <ul className="mt-4 divide-y divide-border">
        {(list.data ?? []).map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                Added {new Date(p.created_at).toLocaleDateString()} ·{" "}
                {p.last_used_at ? `last used ${new Date(p.last_used_at).toLocaleString()}` : "never used"}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remove passkey"
              onClick={() => removeMutation.mutate(p.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
        {list.data?.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">No passkeys yet.</li>
        )}
      </ul>
    </section>
  );
}
