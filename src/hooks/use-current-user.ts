import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SessionState = {
  user: User | null;
  loading: boolean;
};

/**
 * Client-side session state. The router gate owns access control; this hook is
 * only for rendering session-aware UI (avatars, sign-in/out affordances).
 */
export function useCurrentUser(): SessionState {
  const [state, setState] = useState<SessionState>({ user: null, loading: true });

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ user: data.session?.user ?? null, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ user: session?.user ?? null, loading: false });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export function initials(nameOrEmail: string | null | undefined): string {
  if (!nameOrEmail) return "EG";
  const base = (nameOrEmail.includes("@") ? nameOrEmail.split("@")[0] : nameOrEmail) ?? "";
  const parts = base.replace(/[._-]+/g, " ").trim().split(/\s+/);
  return (parts[0]?.[0] ?? "E").concat(parts[1]?.[0] ?? "").toUpperCase();
}
