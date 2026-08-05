import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { EgreedLogo } from "@/components/brand/EgreedLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/use-current-user";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/docs", label: "Documentation" },
  { to: "/status", label: "Status" },
] as const;

export function PublicHeader() {
  const { user, loading } = useCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link to="/" aria-label="EGREED Identity home">
          <EgreedLogo />
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {loading ? null : user ? (
            <Button asChild>
              <Link to="/account">Go to your account</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link to="/auth">
                  Sign in
                </Link>
              </Button>
              <Button asChild>
                <Link to="/auth">
                  Create account
                </Link>
              </Button>
            </>
          )}
        </div>

        <Sheet>
          <SheetTrigger asChild className="ml-auto md:hidden">
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 bg-surface">
            <nav aria-label="Mobile" className="mt-8 flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-4 flex flex-col gap-2">
                {user ? (
                  <Button asChild>
                    <Link to="/account">Your account</Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="secondary">
                      <Link to="/auth">
                        Sign in
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link to="/auth">
                        Create account
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
