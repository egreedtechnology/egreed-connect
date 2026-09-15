import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  Boxes,
  FlaskConical,

  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorSmartphone,
  ShieldCheck,
  Terminal,
  UserRound,
  Lock,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { EgreedLogo } from "@/components/brand/EgreedLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { initials, useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    title: "Account",
    items: [
      { to: "/account" as const, label: "Overview", icon: LayoutDashboard, exact: true },
      { to: "/account/profile" as const, label: "Profile", icon: UserRound, exact: false },
      { to: "/account/security" as const, label: "Security", icon: ShieldCheck, exact: false },
      { to: "/account/devices" as const, label: "Devices", icon: MonitorSmartphone, exact: false },
      { to: "/account/activity" as const, label: "Activity", icon: Activity, exact: false },
      { to: "/account/privacy" as const, label: "Privacy", icon: Lock, exact: false },
    ],
  },
  {
    title: "Teams",
    items: [
      { to: "/organizations" as const, label: "Organizations", icon: Building2, exact: false },
    ],
  },
  {
    title: "Developer",
    items: [
      { to: "/developer" as const, label: "Console", icon: Terminal, exact: true },
      { to: "/developer/applications" as const, label: "Applications", icon: Boxes, exact: false },
      { to: "/developer/keys" as const, label: "API keys", icon: KeyRound, exact: false },
      { to: "/developer/testing" as const, label: "Integration tester", icon: FlaskConical, exact: false },

    ],
  },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 text-[0.68rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            {group.title}
          </p>
          <nav aria-label={group.title} className="mt-2 flex flex-col gap-0.5">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                activeOptions={{ exact: item.exact }}
                activeProps={{
                  className: "bg-sidebar-accent text-sidebar-accent-foreground shadow-glow",
                }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ))}
    </div>
  );
}

/** Shared chrome for every signed-in surface (account + developer console). */
export function AccountShell({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const label = user?.user_metadata?.["display_name"] ?? user?.email ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" aria-label="Open account navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar">
              <div className="mt-6">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Link to="/account" aria-label="EGREED Identity account home">
            <EgreedLogo subtitle="Account" />
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-[180px] truncate text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">Signed in</p>
            </div>
            <Avatar className="size-9 border border-border">
              <AvatarFallback className="bg-secondary text-xs font-semibold">
                {initials(label)}
              </AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={handleSignOut}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24">
            <NavLinks />
            <Separator className="my-6" />
            <Link
              to="/docs"
              className="block rounded-lg border border-border bg-surface/60 p-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Read the identity documentation, API reference and SDK guides.
            </Link>
          </div>
        </aside>

        <main className={cn("min-w-0 flex-1 pb-16")}>{children}</main>
      </div>
    </div>
  );
}
