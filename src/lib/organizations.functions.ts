/**
 * Organization + RBAC service layer. Every handler runs as the signed-in user,
 * so organization row level security decides what is visible or writable.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { randomToken, sha256, writeAuditLog } from "./identity.server";
import { slugify } from "./organizations.shared";
import { ORG_ROLES } from "./organizations.types";
import type {
  IncomingInvitation,
  OrgInvitation,
  OrgMember,
  OrgRole,
  Organization,
  OrganizationDetail,
  OrganizationSummary,
} from "./organizations.types";

const roleSchema = z.enum(ORG_ROLES);

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ organizations: OrganizationSummary[]; invitations: IncomingInvitation[] }> => {
      const { supabase, userId, claims } = context;
      const email = String((claims as Record<string, unknown>)["email"] ?? "").toLowerCase();

      const { data: memberships, error } = await supabase
        .from("organization_members")
        .select("role, organization_id, organizations(id, name, slug, plan, logo_url, created_at)")
        .eq("user_id", userId);
      if (error) throw new Error("Could not load your organizations.");

      const orgIds = (memberships ?? []).map((m) => m.organization_id);
      const counts = new Map<string, number>();
      if (orgIds.length > 0) {
        const { data: allMembers } = await supabase
          .from("organization_members")
          .select("organization_id")
          .in("organization_id", orgIds);
        for (const row of allMembers ?? []) {
          counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
        }
      }

      const organizations: OrganizationSummary[] = (memberships ?? [])
        .map((m) => {
          const org = m.organizations as unknown as Organization | null;
          if (!org) return null;
          return {
            ...org,
            role: m.role as OrgRole,
            memberCount: counts.get(org.id) ?? 1,
          };
        })
        .filter((o): o is OrganizationSummary => o !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      let invitations: IncomingInvitation[] = [];
      if (email) {
        const { data: invites } = await supabase
          .from("organization_invitations")
          .select(
            "id, organization_id, email, role, status, expires_at, created_at, organizations(name, slug)",
          )
          .eq("status", "pending")
          .order("created_at", { ascending: false });
        invitations = (invites ?? [])
          .filter((row) => row.email.toLowerCase() === email && !orgIds.includes(row.organization_id))
          .map((row) => {
            const org = row.organizations as unknown as { name: string; slug: string } | null;
            return {
              id: row.id,
              organization_id: row.organization_id,
              email: row.email,
              role: row.role as OrgRole,
              status: row.status,
              expires_at: row.expires_at,
              created_at: row.created_at,
              organization_name: org?.name ?? "Unknown organization",
              organization_slug: org?.slug ?? "",
            };
          });
      }

      return { organizations, invitations };
    },
  );

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9-]{3,40}$/, "Use 3-40 lowercase letters, numbers or dashes"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Organization> => {
    const { supabase, userId } = context;
    const slug = slugify(data.slug);
    if (slug.length < 3) throw new Error("Choose a longer workspace address.");

    const { data: org, error } = await supabase
      .from("organizations")
      .insert({ name: data.name, slug, created_by: userId })
      .select("id, name, slug, plan, logo_url, created_at")
      .single();
    if (error) {
      if (error.code === "23505" || error.message.includes("duplicate")) {
        throw new Error("That workspace address is already taken.");
      }
      throw new Error("Could not create the organization.");
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({ organization_id: org.id, user_id: userId, role: "owner" });
    if (memberError) throw new Error("Organization created, but owner access could not be set.");

    await writeAuditLog({
      userId,
      eventType: "organization.created",
      category: "organization",
      description: `Organization "${data.name}" created`,
    });

    return org as Organization;
  });

export const getOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ slug: z.string().trim().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<OrganizationDetail> => {
    const { supabase, userId } = context;

    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, slug, plan, logo_url, created_at")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!org) throw new Error("Organization not found, or you do not have access to it.");

    const { data: memberRows, error } = await supabase
      .from("organization_members")
      .select("id, user_id, role, department, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error("Could not load the member list.");

    const mine = (memberRows ?? []).find((m) => m.user_id === userId);
    if (!mine) throw new Error("You are not a member of this organization.");

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url, job_title")
      .in("id", (memberRows ?? []).map((m) => m.user_id));
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const members: OrgMember[] = (memberRows ?? []).map((m) => {
      const profile = profileById.get(m.user_id);
      return {
        id: m.id,
        user_id: m.user_id,
        role: m.role as OrgRole,
        department: m.department,
        created_at: m.created_at,
        display_name: profile?.display_name ?? null,
        username: profile?.username ?? null,
        avatar_url: profile?.avatar_url ?? null,
        job_title: profile?.job_title ?? null,
      };
    });

    const { data: invites } = await supabase
      .from("organization_invitations")
      .select("id, organization_id, email, role, status, expires_at, created_at")
      .eq("organization_id", org.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return {
      organization: org as Organization,
      myRole: mine.role as OrgRole,
      members,
      invitations: (invites ?? []) as OrgInvitation[],
    };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        email: z.string().trim().email().max(180),
        role: roleSchema.exclude(["owner"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<OrgInvitation> => {
    const { supabase, userId } = context;
    const email = data.email.toLowerCase();

    const { data: row, error } = await supabase
      .from("organization_invitations")
      .insert({
        organization_id: data.organizationId,
        email,
        role: data.role,
        invited_by: userId,
        token_hash: sha256(randomToken(24)),
      })
      .select("id, organization_id, email, role, status, expires_at, created_at")
      .single();
    if (error) {
      if (error.code === "23505" || error.message.includes("duplicate")) {
        throw new Error("There is already a pending invitation for that address.");
      }
      throw new Error("Could not send the invitation. Admin access is required.");
    }

    await writeAuditLog({
      userId,
      eventType: "organization.member_invited",
      category: "organization",
      description: `Invited ${email} as ${data.role}`,
    });

    return row as OrgInvitation;
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ invitationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("organization_invitations")
      .delete()
      .eq("id", data.invitationId);
    if (error) throw new Error("Could not revoke the invitation.");
    await writeAuditLog({
      userId: context.userId,
      eventType: "organization.invitation_revoked",
      category: "organization",
      status: "warning",
      description: "Invitation revoked",
    });
    return { ok: true };
  });

export const respondToInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        invitationId: z.string().uuid(),
        accept: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; slug: string | null }> => {
    const { supabase, userId, claims } = context;
    const email = String((claims as Record<string, unknown>)["email"] ?? "").toLowerCase();

    const { data: invite } = await supabase
      .from("organization_invitations")
      .select("id, organization_id, email, role, status, expires_at, organizations(slug)")
      .eq("id", data.invitationId)
      .maybeSingle();
    if (!invite) throw new Error("This invitation is no longer available.");
    if (invite.email.toLowerCase() !== email) {
      throw new Error("This invitation was sent to a different email address.");
    }
    if (invite.status !== "pending") throw new Error("This invitation was already answered.");
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      throw new Error("This invitation has expired. Ask an admin to send a new one.");
    }

    if (!data.accept) {
      const { error } = await supabase
        .from("organization_invitations")
        .update({ status: "declined" })
        .eq("id", invite.id);
      if (error) throw new Error("Could not decline the invitation.");
      return { ok: true, slug: null };
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({ organization_id: invite.organization_id, user_id: userId, role: invite.role });
    if (memberError && !memberError.message.includes("duplicate")) {
      throw new Error("Could not join the organization.");
    }

    const { error } = await supabase
      .from("organization_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (error) throw new Error("Joined, but the invitation could not be closed out.");

    await writeAuditLog({
      userId,
      eventType: "organization.member_joined",
      category: "organization",
      description: `Joined organization as ${invite.role}`,
    });

    const org = invite.organizations as unknown as { slug: string } | null;
    return { ok: true, slug: org?.slug ?? null };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        memberId: z.string().uuid(),
        organizationId: z.string().uuid(),
        role: roleSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;

    const { data: members } = await supabase
      .from("organization_members")
      .select("id, user_id, role")
      .eq("organization_id", data.organizationId);
    const target = (members ?? []).find((m) => m.id === data.memberId);
    if (!target) throw new Error("That member is no longer in this organization.");

    const owners = (members ?? []).filter((m) => m.role === "owner");
    if (target.role === "owner" && data.role !== "owner" && owners.length <= 1) {
      throw new Error("An organization must always keep at least one owner.");
    }

    const { error } = await supabase
      .from("organization_members")
      .update({ role: data.role })
      .eq("id", data.memberId);
    if (error) throw new Error("Could not update that role. Admin access is required.");

    await writeAuditLog({
      userId,
      eventType: "organization.role_changed",
      category: "organization",
      description: `Member role changed to ${data.role}`,
    });
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ memberId: z.string().uuid(), organizationId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;

    const { data: members } = await supabase
      .from("organization_members")
      .select("id, user_id, role")
      .eq("organization_id", data.organizationId);
    const target = (members ?? []).find((m) => m.id === data.memberId);
    if (!target) return { ok: true };

    const owners = (members ?? []).filter((m) => m.role === "owner");
    if (target.role === "owner" && owners.length <= 1) {
      throw new Error("Transfer ownership before removing the last owner.");
    }

    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", data.memberId);
    if (error) throw new Error("Could not remove that member.");

    await writeAuditLog({
      userId,
      eventType: "organization.member_removed",
      category: "organization",
      status: "warning",
      description: target.user_id === userId ? "Left organization" : "Member removed",
    });
    return { ok: true };
  });
