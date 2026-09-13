/**
 * EGREED platform constants.
 *
 * Single source of truth for brand copy, ecosystem application registry and
 * navigation. Keep product-facing strings here so every surface stays in sync.
 */

export const EGREED = {
  name: "EGREED Identity",
  shortName: "EGREED ID",
  company: "EGREED Technologies",
  domain: "id.egreedtech.org",
  tagline: "One account for the entire EGREED ecosystem.",
  description:
    "EGREED Identity is the central identity and access management platform for every EGREED product — single sign-on, passkeys, device trust, audit logging and an OAuth 2.1 / OpenID Connect provider.",
} as const;

export type EcosystemApp = {
  slug: string;
  name: string;
  summary: string;
  status: "live" | "beta" | "planned";
};

export const ECOSYSTEM_APPS: readonly EcosystemApp[] = [
  { slug: "cloud", name: "EGREED Cloud", summary: "Infrastructure and hosting", status: "live" },
  { slug: "ai", name: "EGREED AI", summary: "Models, agents and assistants", status: "live" },
  { slug: "mail", name: "EGREED Mail", summary: "Secure business email", status: "live" },
  { slug: "drive", name: "EGREED Drive", summary: "Encrypted file storage", status: "beta" },
  { slug: "browser", name: "EGREED Browser", summary: "Privacy-first browsing", status: "beta" },
  { slug: "learn", name: "EGREED Learn", summary: "Training and certification", status: "beta" },
  { slug: "deploy", name: "EGREED Deploy", summary: "Continuous delivery", status: "planned" },
  { slug: "sos", name: "EGREED SOS", summary: "Emergency response network", status: "planned" },
] as const;

export const SUBDOMAINS = [
  { host: "id.egreedtech.org", purpose: "Account and sign-in experience" },
  { host: "admin.id.egreedtech.org", purpose: "Tenant and platform administration" },
  { host: "developer.id.egreedtech.org", purpose: "OAuth clients, API keys and SDKs" },
  { host: "docs.id.egreedtech.org", purpose: "Reference and guides" },
  { host: "api.id.egreedtech.org", purpose: "Versioned REST and OIDC endpoints" },
  { host: "status.id.egreedtech.org", purpose: "Availability and incident history" },
] as const;

/** Scopes that can be granted to API keys and personal access tokens. */
export const API_SCOPES = [
  "identity:read",
  "identity:write",
  "sessions:read",
  "sessions:revoke",
  "organizations:read",
  "organizations:write",
  "audit:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/**
 * Human-readable scope catalogue: what each scope unlocks and which REST
 * endpoints enforce it. Shown in the developer console and the docs.
 */
export const API_SCOPE_DETAILS: Record<
  ApiScope,
  { label: string; description: string; endpoints: string[]; risk: "low" | "medium" | "high" }
> = {
  "identity:read": {
    label: "Read identity",
    description: "Profile, email and verification status of the key owner.",
    endpoints: ["GET /api/public/v1/me"],
    risk: "low",
  },
  "identity:write": {
    label: "Update identity",
    description: "Update display name, job title, locale and timezone.",
    endpoints: ["PATCH /api/public/v1/me"],
    risk: "medium",
  },
  "sessions:read": {
    label: "Read devices",
    description: "List known devices and trust state.",
    endpoints: ["GET /api/public/v1/sessions"],
    risk: "medium",
  },
  "sessions:revoke": {
    label: "Revoke devices",
    description: "Remove trust from devices remotely.",
    endpoints: ["DELETE /api/public/v1/sessions"],
    risk: "high",
  },
  "organizations:read": {
    label: "Read organizations",
    description: "Organization memberships and roles for RBAC mirroring.",
    endpoints: ["GET /api/public/v1/organizations"],
    risk: "low",
  },
  "organizations:write": {
    label: "Manage organizations",
    description: "Reserved for provisioning integrations (SCIM-style).",
    endpoints: [],
    risk: "high",
  },
  "audit:read": {
    label: "Read audit log",
    description: "Security and account events for SIEM forwarding.",
    endpoints: ["GET /api/public/v1/audit"],
    risk: "medium",
  },
};

/** Scopes an OAuth client may request from a user. */
export const OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "phone",
  "offline_access",
  "organizations:read",
] as const;

export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const OAUTH_SCOPE_DESCRIPTIONS: Record<OAuthScope, string> = {
  openid: "Issue an ID token proving who signed in",
  profile: "Name, username, picture, locale and timezone",
  email: "Email address and verification status",
  phone: "Phone number and verification status",
  offline_access: "Refresh tokens so the app stays signed in",
  "organizations:read": "Organization memberships and roles",
};

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

export function isOAuthScope(value: string): value is OAuthScope {
  return (OAUTH_SCOPES as readonly string[]).includes(value);
}

export const ORG_ROLES = [
  "owner",
  "admin",
  "manager",
  "developer",
  "employee",
  "guest",
] as const;
