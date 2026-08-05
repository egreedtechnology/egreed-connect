/**
 * Shared identity DTOs. These types cross the server-function boundary, so they
 * must stay plain, serialisable objects.
 */

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  job_title: string | null;
  locale: string;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type Preferences = {
  user_id: string;
  email_security_alerts: boolean;
  email_product_updates: boolean;
  email_sign_in_alerts: boolean;
  profile_visibility: string;
  allow_analytics: boolean;
};

export type Device = {
  id: string;
  device_label: string;
  browser: string | null;
  os: string | null;
  device_type: string;
  ip_address: string | null;
  location: string | null;
  is_trusted: boolean;
  last_seen_at: string;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  event_type: string;
  event_category: string;
  status: string;
  description: string | null;
  ip_address: string | null;
  device_label: string | null;
  location: string | null;
  created_at: string;
};

export type SecurityAlert = {
  id: string;
  severity: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

export type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  environment: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type OAuthClient = {
  id: string;
  name: string;
  description: string | null;
  client_id: string;
  secret_last_four: string | null;
  client_type: string;
  redirect_uris: string[];
  scopes: string[];
  homepage_url: string | null;
  is_active: boolean;
  created_at: string;
};

export type IdentityOverview = {
  profile: Profile | null;
  preferences: Preferences | null;
  roles: string[];
  deviceCount: number;
  trustedDeviceCount: number;
  unreadAlerts: number;
  recentActivity: AuditEntry[];
  securityScore: number;
  checklist: { id: string; label: string; done: boolean; hint: string }[];
};
