import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getIdentityOverview, updatePreferences } from "@/lib/identity.functions";

export const Route = createFileRoute("/_authenticated/account/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — EGREED Identity" },
      {
        name: "description",
        content: "Control notifications, analytics and how your EGREED profile is shared.",
      },
    ],
  }),
  component: PrivacyPage,
});

type Visibility = "private" | "organization" | "public";

const DEFAULTS = {
  email_security_alerts: true,
  email_sign_in_alerts: true,
  email_product_updates: false,
  allow_analytics: true,
  profile_visibility: "organization" as Visibility,
};

const TOGGLES = [
  {
    key: "email_security_alerts" as const,
    label: "Security alerts",
    hint: "Critical notifications about your account security.",
  },
  {
    key: "email_sign_in_alerts" as const,
    label: "New sign-in alerts",
    hint: "Email me whenever a new device signs in.",
  },
  {
    key: "email_product_updates" as const,
    label: "Product updates",
    hint: "Occasional news about the EGREED ecosystem.",
  },
  {
    key: "allow_analytics" as const,
    label: "Product analytics",
    hint: "Allow anonymised usage analytics to improve EGREED.",
  },
];

function PrivacyPage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getIdentityOverview);
  const save = useServerFn(updatePreferences);
  const [form, setForm] = useState(DEFAULTS);

  const { data, isPending } = useQuery({
    queryKey: ["identity", "overview"],
    queryFn: () => fetchOverview(),
  });

  useEffect(() => {
    const p = data?.preferences;
    if (!p) return;
    setForm({
      email_security_alerts: p.email_security_alerts,
      email_sign_in_alerts: p.email_sign_in_alerts,
      email_product_updates: p.email_product_updates,
      allow_analytics: p.allow_analytics,
      profile_visibility: (p.profile_visibility as Visibility) ?? "organization",
    });
  }, [data?.preferences]);

  const mutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => {
      toast.success("Preferences saved");
      queryClient.invalidateQueries({ queryKey: ["identity", "overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isPending) return <Skeleton className="h-80 w-full" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose what EGREED sends you and how your profile is shared.
        </p>
      </header>

      <section className="surface-panel divide-y divide-border p-2">
        {TOGGLES.map((toggle) => (
          <div key={toggle.key} className="flex items-start justify-between gap-6 p-4">
            <div>
              <Label htmlFor={toggle.key} className="text-sm font-medium">
                {toggle.label}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">{toggle.hint}</p>
            </div>
            <Switch
              id={toggle.key}
              checked={form[toggle.key]}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, [toggle.key]: checked }))}
            />
          </div>
        ))}
      </section>

      <section className="surface-panel space-y-3 p-6">
        <Label htmlFor="visibility">Profile visibility</Label>
        <Select
          value={form.profile_visibility}
          onValueChange={(value) =>
            setForm((prev) => ({ ...prev, profile_visibility: value as Visibility }))
          }
        >
          <SelectTrigger id="visibility" className="sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">Private — only you</SelectItem>
            <SelectItem value="organization">Organization — your teams</SelectItem>
            <SelectItem value="public">Public — anyone with your username</SelectItem>
          </SelectContent>
        </Select>
      </section>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
        Save preferences
      </Button>
    </div>
  );
}
