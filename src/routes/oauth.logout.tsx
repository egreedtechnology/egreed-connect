import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { EgreedLogo } from "@/components/brand/EgreedLogo";
import { supabase } from "@/integrations/supabase/client";
import { checkLogoutRedirect } from "@/lib/sso.functions";

const search = z.object({
  client_id: z.string().optional(),
  post_logout_redirect_uri: z.string().optional(),
  state: z.string().optional(),
});

export const Route = createFileRoute("/oauth/logout")({
  validateSearch: search,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing out — EGREED Identity" },
      { name: "description", content: "Signing you out of EGREED ID and every connected EGREED app." },
      { property: "og:title", content: "Signing out — EGREED Identity" },
      { property: "og:description", content: "Signing you out of EGREED ID and every connected EGREED app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LogoutPage,
});

function LogoutPage() {
  const { client_id, post_logout_redirect_uri, state } = Route.useSearch();
  const check = useServerFn(checkLogoutRedirect);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      await supabase.auth.signOut();
      if (post_logout_redirect_uri) {
        const r = await check({ data: { clientId: client_id, redirect: post_logout_redirect_uri } }).catch(() => ({ allowed: false }));
        if (r.allowed) {
          const url = new URL(post_logout_redirect_uri);
          if (state) url.searchParams.set("state", state);
          window.location.replace(url.toString());
          return;
        }
      }
      setDone(true);
    })();
  }, [client_id, post_logout_redirect_uri, state, check]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <EgreedLogo />
      <p className="text-sm text-muted-foreground">
        {done ? "You're signed out of EGREED ID. You can close this window." : "Signing you out…"}
      </p>
    </main>
  );
}
