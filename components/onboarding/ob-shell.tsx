"use client"

import { Anchor } from "lucide-react"

/** The two persona accents — the only colors we carry over from the earlier
 *  direction. Everything else uses the platform's Newsroom tokens. */
export const ACCENT = { founder: "#e5380f", vc: "#2f45e0" } as const
export type PersonaKey = keyof typeof ACCENT

/**
 * Onboarding frame in the Newsroom editorial style: a mono eyebrow masthead,
 * a font-display headline, a muted subline, and a hairline progress rule.
 * Pages provide the body.
 */
export function ObShell({
  step,
  total,
  title,
  sub,
  accent,
  children,
}: {
  step: number
  total: number
  title: string
  sub?: string
  accent?: string
  children: React.ReactNode
}) {
  const pct = Math.max(0, Math.min(100, (step / total) * 100))
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="w-full max-w-5xl mx-auto px-6 lg:px-12 pt-16 lg:pt-24 pb-10 lg:pb-16 flex-1 flex flex-col">
        {/* Masthead */}
        <header className="border-b border-foreground/10 pb-8 lg:pb-10">
          <div className="flex items-center gap-3 mb-6 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <Anchor className="w-3.5 h-3.5" />
            <span>Anker</span>
            <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
            <span>Onboarding</span>
            <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
            <span className="text-foreground/70">
              Step {String(step).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>
          <div className="grid lg:grid-cols-12 gap-6 lg:gap-12 items-end">
            <h1 className="lg:col-span-8 font-display text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.05] text-balance">
              {title}
            </h1>
            {sub ? (
              <p className="lg:col-span-4 text-sm lg:text-base text-muted-foreground leading-relaxed">{sub}</p>
            ) : null}
          </div>
          {/* progress rule */}
          <div className="mt-8 h-0.5 w-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%`, backgroundColor: accent ?? "var(--foreground)" }}
            />
          </div>
        </header>

        <div className="flex-1 flex flex-col pt-10 lg:pt-12">{children}</div>

        <footer className="pt-8 mt-8 border-t border-foreground/10 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
          You can run both a Founder and a Fund workspace later.
        </footer>
      </div>
    </div>
  )
}

/** Original anchor-derived persona sigils (no third-party IP). */
export function AnchorSigil({ variant }: { variant: PersonaKey }) {
  if (variant === "vc") {
    return (
      <svg viewBox="0 0 64 64" fill="none" aria-hidden className="w-full h-full">
        <path d="M32 5l23 13v20L32 51 9 38V18L32 5z" stroke="currentColor" strokeWidth="2.4" opacity=".45" />
        <circle cx="32" cy="20" r="3.4" stroke="currentColor" strokeWidth="2.6" />
        <path d="M32 23.5V47M18 32a14 14 0 0 0 28 0M32 29h-8m8 0h8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden className="w-full h-full">
      <path d="M32 6l7 9H25l7-9z" fill="currentColor" />
      <circle cx="32" cy="21" r="3.4" stroke="currentColor" strokeWidth="2.6" />
      <path
        d="M32 24.5V56M16 34a16 16 0 0 0 32 0M32 30H23m9 0h9M16 34h-4l2.6 4.4M48 34h4l-2.6 4.4"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
