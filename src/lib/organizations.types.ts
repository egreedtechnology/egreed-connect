/**
 * Organization + RBAC DTOs. Plain serialisable shapes only — these cross the
 * server-function boundary.
 */

export const ORG_ROLES = [
  "owner",
  "admin",
  "manager",
  "developer",
  "employee",
  "guest",
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: "Full control, including billing and deleting the organization.",
  admin: "Manage members, roles, invitations and organization settings.",
  manager: "Manage teams and view all organization activity.",
  developer: "Create applications and API keys for the organization.",
  employee: "Standard access to organization apps and resources.",
  guest: "Limited, read-only access to shared resources.",
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  logo_url: string | null;
  created_at: string;
};

export type OrganizationSummary = Organization & {
  role: OrgRole;
  memberCount: number;
};

export type OrgMember = {
  id: string;
  user_id: string;
  role: OrgRole;
  department: string | null;
  created_at: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  job_title: string | null;
};

export type OrgInvitation = {
  id: string;
  organization_id: string;
  email: string;
  role: OrgRole;
  status: string;
  expires_at: string;
  created_at: string;
};

export type IncomingInvitation = OrgInvitation & {
  organization_name: string;
  organization_slug: string;
};

export type OrganizationDetail = {
  organization: Organization;
  myRole: OrgRole;
  members: OrgMember[];
  invitations: OrgInvitation[];
};
