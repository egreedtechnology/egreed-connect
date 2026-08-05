import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getIdentityOverview, updateProfile } from "@/lib/identity.functions";

export const Route = createFileRoute("/_authenticated/account/profile")({
  head: () => ({
    meta: [
      { title: "Profile — EGREED Identity" },
      { name: "description", content: "Manage the identity details shared across EGREED products." },
    ],
  }),
  component: ProfilePage,
});

const EMPTY = {
  display_name: "",
  full_name: "",
  username: "",
  phone: "",
  job_title: "",
  timezone: "UTC",
  locale: "en",
};

function ProfilePage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getIdentityOverview);
  const save = useServerFn(updateProfile);
  const [form, setForm] = useState(EMPTY);

  const { data, isPending } = useQuery({
    queryKey: ["identity", "overview"],
    queryFn: () => fetchOverview(),
  });

  useEffect(() => {
    const p = data?.profile;
    if (!p) return;
    setForm({
      display_name: p.display_name ?? "",
      full_name: p.full_name ?? "",
      username: p.username ?? "",
      phone: p.phone ?? "",
      job_title: p.job_title ?? "",
      timezone: p.timezone ?? "UTC",
      locale: p.locale ?? "en",
    });
  }, [data?.profile]);

  const mutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["identity", "overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function field(key: keyof typeof EMPTY) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  if (isPending) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          These details are shared with EGREED products you sign in to.
        </p>
      </header>

      <form
        className="surface-panel space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input id="display_name" required maxLength={80} {...field("display_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="full_name">Legal name</Label>
            <Input id="full_name" maxLength={120} {...field("full_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" maxLength={32} placeholder="ada.lovelace" {...field("username")} />
            <p className="text-xs text-muted-foreground">
              3–32 lowercase letters, numbers, dot, dash or underscore.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="job_title">Job title</Label>
            <Input id="job_title" maxLength={80} {...field("job_title")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" maxLength={32} {...field("phone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input id="timezone" maxLength={64} {...field("timezone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="locale">Locale</Label>
            <Input id="locale" maxLength={16} {...field("locale")} />
          </div>
        </div>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Save changes
        </Button>
      </form>
    </div>
  );
}
