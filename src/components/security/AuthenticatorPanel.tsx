import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };
type Enrolling = { factorId: string; qr: string; secret: string };

export function AuthenticatorPanel() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
  }
  useEffect(() => {
    void load();
  }, []);

  async function start() {
    setBusy(true);
    // Clear half-finished setups so a new one can start.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of all?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
    });
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "Could not start setup.");
    setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolling.factorId,
      code: code.trim(),
    });
    setBusy(false);
    if (error) return toast.error("That code didn't work. Try the newest one.");
    toast.success("Authenticator app turned on");
    setEnrolling(null);
    setCode("");
    void load();
  }

  async function remove(id: string) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return toast.error(error.message);
    toast.success("Authenticator removed");
    void load();
  }

  const active = factors.filter((f) => f.status === "verified");

  return (
    <section className="surface-panel p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" aria-hidden />
        <h2 className="font-display text-lg font-semibold">Authenticator app</h2>
        {active.length > 0 && <Badge variant="secondary">On</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask for a 6-digit code from Google Authenticator, Microsoft Authenticator or 1Password
        when signing in.
      </p>

      {active.map((f) => (
        <div key={f.id} className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm">
            {f.friendly_name ?? "Authenticator"} · added {new Date(f.created_at).toLocaleDateString()}
          </p>
          <Button size="sm" variant="destructive" onClick={() => remove(f.id)}>
            Turn off
          </Button>
        </div>
      ))}

      {active.length === 0 && !enrolling && (
        <Button className="mt-4" onClick={start} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Set up authenticator
        </Button>
      )}

      {enrolling && (
        <form className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]" onSubmit={confirm}>
          <img
            src={enrolling.qr}
            alt="QR code to scan with your authenticator app"
            className="size-44 rounded-md bg-card p-2"
          />
          <div className="space-y-3">
            <p className="text-sm">1. Scan the code with your authenticator app.</p>
            <p className="text-xs text-muted-foreground">
              Can't scan? Enter this key: <span className="font-mono break-all">{enrolling.secret}</span>
            </p>
            <p className="text-sm">2. Type the 6-digit code it shows.</p>
            <Input
              inputMode="numeric"
              maxLength={6}
              className="max-w-[10rem] font-mono tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || code.length !== 6}>
                Turn on
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEnrolling(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
