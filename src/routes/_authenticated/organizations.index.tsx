import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, Mail, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createOrganization,
  listOrganizations,
  respondToInvitation,
} from "@/lib/organizations.functions";
import { slugify } from "@/lib/organizations.shared";

const TITLE = "Organizations — EGREED Identity";
const DESCRIPTION =
  "Create EGREED organizations, manage teams and accept invitations to shared workspaces.";

export const Route = createFileRoute("/_authenticated/organizations/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchOrgs = useServerFn(listOrganizations);
  const create = useServerFn(createOrganization);
  const respond = useServerFn(respondToInvitation);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => fetchOrgs(),
  });

  const createMutation = useMutation({
    mutationFn: () => create({ data: { name: name.trim(), slug: slug || slugify(name) } }),
    onSuccess: (org) => {
      toast.success(`${org.name} is ready`);
      setName("");
      setSlug("");
      setSlugTouched(false);
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      navigate({ to: "/organizations/$slug", params: { slug: org.slug } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const respondMutation = useMutation({
    mutationFn: (vars: { invitationId: string; accept: boolean }) => respond({ data: vars }),
    onSuccess: (result, vars) => {
      toast.success(vars.accept ? "You joined the organization" : "Invitation declined");
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      if (vars.accept && result.slug) {
        navigate({ to: "/organizations/$slug", params: { slug: result.slug } });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Organizations group people, applications and access policies. Roles decide what each
          member can do across every EGREED product.
        </p>
      </header>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          {data && data.invitations.length > 0 && (
            <section className="surface-panel p-5">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <Mail className="size-4 text-primary" aria-hidden />
                Pending invitations
              </h2>
              <ul className="mt-4 space-y-3">
                {data.invitations.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface/60 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{invite.organization_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited as <span className="text-foreground">{invite.role}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={respondMutation.isPending}
                        onClick={() =>
                          respondMutation.mutate({ invitationId: invite.id, accept: true })
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={respondMutation.isPending}
                        onClick={() =>
                          respondMutation.mutate({ invitationId: invite.id, accept: false })
                        }
                      >
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="font-display text-base font-semibold">Your organizations</h2>
            {data && data.organizations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                You are not part of an organization yet. Create one below to start inviting your
                team.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {data?.organizations.map((org) => (
                  <li key={org.id}>
                    <Link
                      to="/organizations/$slug"
                      params={{ slug: org.slug }}
                      className="surface-panel flex h-full flex-col gap-3 p-5 transition-colors hover:border-primary/50"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary">
                          <Building2 className="size-5 text-primary" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{org.name}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            /{org.slug}
                          </p>
                        </div>
                      </div>
                      <div className="mt-auto flex items-center gap-2">
                        <Badge variant="secondary">{org.role}</Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="size-3.5" aria-hidden />
                          {org.memberCount} member{org.memberCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="surface-panel p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold">Create an organization</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You become the owner and can invite members straight away.
        </p>
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="EGREED Technologies"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Workspace address</Label>
            <Input
              id="org-slug"
              required
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="egreed-technologies"
            />
            <p className="font-mono text-xs text-muted-foreground">
              id.egreedtech.org/{effectiveSlug || "workspace"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={createMutation.isPending || name.trim().length < 2}>
              {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Create organization
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
