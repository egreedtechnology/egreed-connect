import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { checkCurrentDevice } from "@/lib/identity.functions";
import { MfaChallenge, needsMfa } from "./MfaChallenge";

/**
 * Signs this browser out when the user remotely signs it out or locks it, and
 * asks for an authenticator code when the session hasn't passed it yet.
 */
export function DeviceGuard() {
  const check = useServerFn(checkCurrentDevice);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mfa, setMfa] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function run() {
      try {
        const res = await check();
        if (stopped || !res.signOut) return;
        toast.error(res.locked ? "This device was locked from another device." : "You were signed out remotely.");
        qc.clear();
        await supabase.auth.signOut({ scope: "local" });
        navigate({ to: "/auth", replace: true });
      } catch {
        /* network blips must not sign people out */
      }
    }
    void run();
    void needsMfa().then((n) => !stopped && setMfa(n));
    const t = setInterval(run, 20000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [check, navigate, qc]);

  if (!mfa) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4 backdrop-blur">
      <div className="surface-panel w-full max-w-sm p-6">
        <MfaChallenge
          onVerified={() => setMfa(false)}
          onCancel={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth", replace: true });
          }}
        />
      </div>
    </div>
  );
}
