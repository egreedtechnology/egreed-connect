import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

/** Returns true when this session still needs an authenticator code. */
export async function needsMfa(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal1" && data?.nextLevel === "aal2";
}

export function MfaChallenge({ onVerified, onCancel }: { onVerified: () => void; onCancel?: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp.find((f) => f.status === "verified");
    if (!factor) {
      setBusy(false);
      return onVerified();
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (error) return toast.error("That code didn't work. Try the newest one.");
    onVerified();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">Enter your code</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open your authenticator app and type the 6-digit code for EGREED ID.
        </p>
      </div>
      <Input
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="font-mono text-lg tracking-[0.5em]"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || code.length !== 6}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Verify
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Use another account
          </Button>
        )}
      </div>
    </form>
  );
}
