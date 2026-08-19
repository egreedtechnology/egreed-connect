import { createFileRoute } from "@tanstack/react-router";

/**
 * Organization memberships for the authenticated subject, so external systems
 * can mirror EGREED role assignments. Requires `organizations:read`.
 */
export const Route = createFileRoute("/api/public/v1/organizations")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/oauth.server");
        return corsPreflight();
      },
      GET: async ({ request }) => {
        const oauth = await import("@/lib/oauth.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const token = await oauth.authenticateBearer(request);
        const apiKey = token ? null : await oauth.authenticateApiKey(request);
        const subjectId = token?.userId ?? apiKey?.ownerId ?? null;
        const scopes = token?.scopes ?? apiKey?.scopes ?? [];

        if (!subjectId) {
          return oauth.oauthError(
            "invalid_token",
            "Provide an OAuth access token or an EGREED API key.",
            401,
            { "www-authenticate": 'Bearer realm="EGREED Identity"' },
          );
        }
        if (!oauth.requireScope(scopes, "organizations:read")) {
          return oauth.oauthError("insufficient_scope", "organizations:read scope required.", 403);
        }

        const { data, error } = await supabaseAdmin
          .from("organization_members")
          .select("role, department, created_at, organizations(id, name, slug, plan)")
          .eq("user_id", subjectId);
        if (error) {
          return oauth.oauthError("server_error", "Could not load organizations.", 500);
        }

        return oauth.jsonResponse({
          subject: subjectId,
          organizations: (data ?? []).map((row) => {
            const org = row.organizations as {
              id: string;
              name: string;
              slug: string;
              plan: string;
            } | null;
            return {
              id: org?.id ?? null,
              name: org?.name ?? null,
              slug: org?.slug ?? null,
              plan: org?.plan ?? null,
              role: row.role,
              department: row.department,
              member_since: row.created_at,
            };
          }),
        });
      },
    },
  },
});
