import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AccountShell } from "@/components/layout/AccountShell";

export const Route = createFileRoute("/_authenticated/developer")({
  component: () => (
    <AccountShell>
      <Outlet />
    </AccountShell>
  ),
});
