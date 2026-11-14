import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PRIVILEGED = ["developer", "admin", "owner"];

/** Developer tools are hidden unless the person turned on Developer mode or holds a privileged role. */
export async function fetchDeveloperAccess(): Promise<{ enabled: boolean; byRole: boolean }> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { enabled: false, byRole: false };
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const byRole = (roles ?? []).some((r) => PRIVILEGED.includes(r.role as string));
  const flag = user.user_metadata?.["developer_mode"] === true;
  return { enabled: byRole || flag, byRole };
}

export function useDeveloperMode() {
  return useQuery({ queryKey: ["developer-mode"], queryFn: fetchDeveloperAccess, staleTime: 60_000 });
}
