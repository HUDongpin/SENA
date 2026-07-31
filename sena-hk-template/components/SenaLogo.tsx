import { cn } from "@/lib/utils";

export function SenaLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)} aria-label="SENA brand">
      <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full border border-cyanGlow/40 bg-card/70 shadow-glow backdrop-blur-xl">
        <svg viewBox="0 0 64 64" className="h-10 w-10" aria-hidden="true">
          <defs>
            <linearGradient id="sena-logo-gradient" x1="6" x2="58" y1="10" y2="56" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgb(var(--glow-cyan))" />
              <stop offset="0.55" stopColor="rgb(var(--glow-violet))" />
              <stop offset="1" stopColor="rgb(var(--glow-magenta))" />
            </linearGradient>
          </defs>
          <path
            d="M32 4 55 17.5v29L32 60 9 46.5v-29L32 4Z"
            fill="none"
            stroke="url(#sena-logo-gradient)"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M43 19H28.5c-5 0-8.5 2.7-8.5 7 0 4.7 4.3 6.3 9.5 7.3l5 1c4.1.8 6.5 2.1 6.5 5 0 3.4-3.4 5.7-8.5 5.7H20"
            fill="none"
            stroke="rgb(var(--foreground))"
            strokeLinecap="round"
            strokeWidth="5"
          />
          <circle cx="21" cy="24" r="3" fill="rgb(var(--glow-cyan))" />
          <circle cx="43" cy="20" r="3" fill="rgb(var(--glow-violet))" />
          <circle cx="41" cy="41" r="3" fill="rgb(var(--glow-magenta))" />
          <path d="M21 24 43 20 41 41 21 24Z" fill="none" stroke="rgb(var(--foreground) / 0.22)" strokeWidth="1.5" />
        </svg>
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <div className="text-2xl font-black tracking-tight text-foreground">SENA</div>
          <div className="max-w-[17rem] text-xs font-semibold text-muted sm:text-sm">Social-Epistemic Nexus Analytics</div>
        </div>
      )}
    </div>
  );
}
