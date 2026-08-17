import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/hooks/use-current-user";
import {
  getOrganization,
  inviteMember,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from "@/lib/organizations.functions";
import { ORG_ROLES, ORG_ROLE_DESCRIPTIONS } from "@/lib/organizations.types";
import type { OrgRole } from "@/lib/organizations.types";
import { isExpired } from "@/lib/organizations.shared";

const TITLE = "Organization team — EGREED Identity";
const DESCRIPTION =
  "Manage organization members, assign roles and invite teammates to your EGREED workspace.";

export const Route = createFileRoute("/_authenticated/organizations/$slug")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: OrganizationDetailPage,
});

const INVITABLE_ROLES = ORG_ROLES.filter((role) => role !== "owner");

function OrganizationDetailPage() {
  const { slug } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const fetchOrg = useServerFn(getOrganization);
  const invite = useServerFn(inviteMember);
  const revoke = useServerFn(revokeInvitation);
  const setRole = useServerFn(updateMemberRole);
  const remove = useServerFn(removeMember);

  const [email, setEmail] = useState("");
  const [role, setRoleValue] = useState<OrgRole>("employee");

  const queryKey = ["organizations", slug];
  const { data, isPending, error } = useQuery({
    queryKey,
    queryFn: () => fetchOrg({ data: { slug } }),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["organizations"] });

  const inviteMutation = useMutation({
    mutationFn: () =>
      invite({
        data: { organizationId: data!.organization.id, email: email.trim(), role },
      }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${email.trim()}`);
      setEmail("");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => revoke({ data: { invitationId } }),
    onSuccess: () => {
      toast.success("Invitation revoked");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { memberId: string; role: OrgRole }) =>
      setRole({ data: { ...vars, organizationId: data!.organization.id } }),
    onSuccess: () => {
      toast.success("Role updated");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      remove({ data: { memberId, organizationId: data!.organization.id } }),
    onSuccess: () => {
      toast.success("Member removed");
      refresh();
      navigate({ to: "/organizations" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (error) {
    return (
      <div className="surface-panel p-6">
        <h1 className="font-display text-lg font-semibold">Organization unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
        <Button asChild variant="outline" className="mt-5">
          <Link to="/organizations">Back to organizations</Link>
        </Button>
      </div>
    );
  }

  if (isPending || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const canManage = data.myRole === "owner" || data.myRole === "admin";

  return (
    <div className="space-y-8">
      <header>
        <Link
          to="/organizations"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All organizations
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {data.organization.name}
          </h1>
          <Badge variant="secondary">{data.organization.plan} plan</Badge>
          <Badge>{data.myRole}</Badge>
        </div>
        <p className="mt-2 font-mono text-xs text-muted-foreground">/{data.organization.slug}</p>
      </header>

      <section className="surface-panel p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold">
          Members <span className="text-muted-foreground">({data.members.length})</span>
        </h2>
        <ul className="mt-4 divide-y divide-border">
          {data.members.map((member) => {
            const label = member.display_name ?? member.username ?? "EGREED member";
            return (
              <li key={member.id} className="flex flex-wrap items-center gap-3 py-4">
                <Avatar className="size-9 border border-border">
                  <AvatarFallback className="bg-secondary text-xs font-semibold">
                    {initials(label)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.job_title ?? (member.username ? `@${member.username}` : "Team member")}
                  </p>
                </div>
                {canManage ? (
                  <Select
                    value={member.role}
                    onValueChange={(next) =>
                      roleMutation.mutate({ memberId: member.id, role: next as OrgRole })
                    }
                    disabled={roleMutation.isPending}
                  >
                    <SelectTrigger className="w-36" aria-label={`Role for ${label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORG_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{member.role}</Badge>
                )}
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${label}`}
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(member.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {canManage && (
        <section className="surface-panel p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">Invite a teammate</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            They will see the invitation in their EGREED account once they sign in with this email
            address. Invitations expire after 7 days.
          </p>
          <form
            className="mt-5 grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              inviteMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@egreedtech.org"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(next) => setRoleValue(next as OrgRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Send invite
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">{ORG_ROLE_DESCRIPTIONS[role]}</p>

          {data.invitations.length > 0 && (
            <>
              <Separator className="my-6" />
              <h3 className="text-sm font-medium">Pending invitations</h3>
              <ul className="mt-3 space-y-2">
                {data.invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface/60 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.role} ·{" "}
                        {isExpired(inv.expires_at)
                          ? "expired"
                          : `expires ${new Date(inv.expires_at).toISOString().slice(0, 10)}`}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revokeMutation.isPending}
                      onClick={() => revokeMutation.mutate(inv.id)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="surface-panel p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          Role reference
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {ORG_ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-border bg-surface/60 p-4">
              <dt className="text-sm font-medium capitalize">{r}</dt>
              <dd className="mt-1 text-xs text-muted-foreground">{ORG_ROLE_DESCRIPTIONS[r]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
