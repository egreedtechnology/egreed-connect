/**
 * Integration access log — reads the `integration` audit trail written by the
 * OAuth token endpoints, REST handlers and the integration tester.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntegrationLogEntry = {
  id: string;
  event_type: string;
  status: string;
  description: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const listIntegrationAccessLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        outcome: z.enum(["all", "success", "failure"]).default("all"),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<IntegrationLogEntry[]> => {
    let query = context.supabase
      .from("audit_logs")
      .select("id, event_type, status, description, ip_address, user_agent, metadata, created_at")
      .eq("user_id", context.userId)
      .eq("event_category", "integration")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.outcome === "success") query = query.eq("status", "success");
    if (data.outcome === "failure") query = query.neq("status", "success");

    const { data: rows, error } = await query;
    if (error) throw new Error("Could not load the integration access log.");
    return (rows ?? []) as IntegrationLogEntry[];
  });
