import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateBackupCodes, getBackupCodeStatus } from "@/lib/backup-codes.functions";
import { MfaChallenge, needsMfa } from "./MfaChallenge";

export function BackupCodesPanel() {
  const getStatus = useServerFn(getBackupCodeStatus);
  const generate = useServerFn(generateBackupCodes);
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["identity", "backup-codes"], queryFn: () => getStatus() });
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState(false);
  async function create() {
    if (!window.confirm("Generate 10 new backup codes? All previous backup codes will stop working.")) return;
    setBusy(true);
    try {
      if (await needsMfa()) { setVerify(true); return; }
      const result = await generate();
      setCodes(result.codes);
      await qc.invalidateQueries({ queryKey: ["identity", "backup-codes"] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate codes."); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([`EGREED Identity backup codes\nKeep these private and offline. Each code works once.\n\n${codes.join("\n")}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url; link.download = "egreed-backup-codes.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="surface-panel p-6">
      <div className="flex items-center gap-2"><KeyRound className="size-4 text-primary" /><h2 className="font-display text-lg font-semibold">Backup codes</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">Recover your account if you lose your passkey or authenticator. Each code can be used once.</p>
      {status.isError ? <p className="mt-3 text-sm text-destructive">Could not load backup code status.</p> : <p className="mt-3 text-sm">{status.isPending ? "Checking codes…" : `${status.data.remaining} unused codes`}</p>}
      {verify ? <div className="mt-4"><MfaChallenge onVerified={() => { setVerify(false); void create(); }} onCancel={() => setVerify(false)} /></div> : <Button className="mt-4" disabled={busy || status.isPending || status.isError} onClick={create}>{busy && <Loader2 className="size-4 animate-spin" />}{status.data?.remaining ? "Generate new codes" : "Generate backup codes"}</Button>}
      {codes.length > 0 && <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">Save these now. They will not be shown again after you leave this page. Anyone with a code can recover your account.</p>
        <ul className="grid gap-2">{codes.map((code) => <li key={code} className="break-all font-mono text-xs sm:text-sm" data-backup-code>{code}</li>)}</ul>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={download}><Download className="size-4" />Download codes</Button><Button variant="ghost" onClick={() => setCodes([])}>I've saved my codes</Button></div>
      </div>}
    </section>
  );
}