import { Link } from "@tanstack/react-router";
import { EgreedLogo } from "@/components/brand/EgreedLogo";
import { EGREED, SUBDOMAINS } from "@/lib/egreed";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { label: "Overview", to: "/" as const },
      { label: "Documentation", to: "/docs" as const },
      { label: "Status", to: "/status" as const },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", to: "/auth" as const },
      { label: "Your account", to: "/account" as const },
      { label: "Developer console", to: "/developer" as const },
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <EgreedLogo />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">{EGREED.description}</p>
          <p className="mt-4 font-mono text-xs text-muted-foreground">{EGREED.domain}</p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-xs font-semibold tracking-[0.18em] text-foreground uppercase">
              {col.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {EGREED.company}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {SUBDOMAINS.slice(0, 4).map((s) => (
              <li key={s.host} className="font-mono">
                {s.host}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
