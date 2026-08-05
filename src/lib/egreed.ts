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

/** Scopes an OAuth client may request from a user. */
export const OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "phone",
  "offline_access",
  "organizations:read",
] as const;

export const ORG_ROLES = [
  "owner",
  "admin",
  "manager",
  "developer",
  "employee",
  "guest",
] as const;
