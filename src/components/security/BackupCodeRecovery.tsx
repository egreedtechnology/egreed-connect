import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { recoverWithBackupCode } from "@/lib/backup-codes.functions";

export function BackupCodeRecovery() {
  const recover = useServerFn(recoverWithBackupCode);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { tokenHash } = await recover({ data: { email, code } });
      setCode("");
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (error) throw error;
      toast.success("Account recovered. Add new passkeys and an authenticator.");
      window.location.replace("/account/security");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recovery failed. Try again.");
    } finally { setBusy(false); }
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <h2 className="font-display text-xl font-semibold">Recover with a backup code</h2>
      <p className="text-sm text-muted-foreground">This uses one code and removes your existing passkeys and authenticators. Set them up again after recovery.</p>
      <div className="space-y-2"><Label htmlFor="backup-email">Account email</Label><Input id="backup-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="backup-code">Backup code</Label><Input id="backup-code" type="password" autoComplete="off" required maxLength={100} value={code} onChange={(e) => setCode(e.target.value)} /></div>
      <Button type="submit" disabled={busy || !code.trim()}>{busy && <Loader2 className="size-4 animate-spin" />}Recover account</Button>
    </form>
  );
}