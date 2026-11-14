import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useDeveloperMode } from "@/hooks/use-developer-mode";

export function DeveloperModeCard() {
  const { data } = useDeveloperMode();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  async function toggle(value: boolean) {
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { developer_mode: value } });
    setSaving(false);
    if (error) {
      toast.error("Could not update Developer mode.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["developer-mode"] });
    toast.success(value ? "Developer mode on" : "Developer mode off");
  }

  return (
    <section className="surface-panel flex items-start justify-between gap-6 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Developer mode</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enable tools for building integrations, registering OAuth applications and generating API keys.
          {data?.byRole && " Included with your role."}
        </p>
      </div>
      <Switch
        checked={data?.enabled ?? false}
        disabled={saving || !data || data.byRole}
        onCheckedChange={toggle}
        aria-label="Developer mode"
      />
    </section>
  );
}
