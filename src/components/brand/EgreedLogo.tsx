import { cn } from "@/lib/utils";

/** EGREED shield mark. Pure SVG so it scales and themes with design tokens. */
export function EgreedMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="EGREED"
      className={cn("size-8", className)}
    >
      <defs>
        <linearGradient id="egreed-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary-glow)" />
          <stop offset="100%" stopColor="var(--primary)" />
        </linearGradient>
      </defs>
      <path
        d="M16 2 4 6.5v9.2c0 6.4 4.7 11.9 12 14.3 7.3-2.4 12-7.9 12-14.3V6.5L16 2Z"
        fill="url(#egreed-mark)"
      />
      <path
        d="M11 11.5h10M11 16h7.5M11 20.5h10"
        stroke="var(--primary-foreground)"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EgreedLogo({
  className,
  subtitle = "Identity",
}: {
  className?: string;
  subtitle?: string | null;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <EgreedMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[0.95rem] font-bold tracking-[0.18em] text-foreground">
          EGREED
        </span>
        {subtitle ? (
          <span className="text-[0.7rem] font-medium tracking-[0.22em] text-muted-foreground uppercase">
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
