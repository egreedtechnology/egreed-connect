import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AccountShell } from "@/components/layout/AccountShell";
import { fetchDeveloperAccess } from "@/hooks/use-developer-mode";

export const Route = createFileRoute("/_authenticated/developer")({
  beforeLoad: async () => {
    const access = await fetchDeveloperAccess();
    if (!access.enabled) throw redirect({ to: "/account/privacy", search: {} as never });
  },
  component: () => (
    <AccountShell>
      <Outlet />
    </AccountShell>
  ),
});
