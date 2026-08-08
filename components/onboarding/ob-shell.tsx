"use client"

import { Anchor, Check } from "lucide-react"

/** Two persona accents (Carta uses one orange; we hold Founder/​Fund). */
export const ACCENT = { founder: "#e5380f", vc: "#2f45e0" } as const
export type PersonaKey = keyof typeof ACCENT

export const serif = { fontFamily: "var(--font-fraunces), Georgia, 'Times New Roman', serif" }

/**
 * Carta-style onboarding shell: a slim app bar, an optional left step rail,
 * a clean content column, and an optional right aside (live preview card).
 */
export function ObShell({
  current,
  total,
  eyebrow,
  title,
  sub,
  accent = ACCENT.founder,
  steps,
  aside,
  children,
}: {
  current: number
  total: number
  eyebrow: string
  title: string
  sub?: string
  accent?: string
  steps?: string[]
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* app bar */}
      <header className="h-14 shrink-0 border-b border-foreground/10 flex items-center gap-3 px-5 lg:px-8">
        <span className="grid place-items-center w-7 h-7 rounded border border-foreground/20">
          <Anchor className="w-4 h-4" />
        </span>
        <span className="font-semibold tracking-tight">Anker</span>
        <span className="ml-auto text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          Step {String(current).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </header>

      <div className={`flex-1 w-full max-w-6xl mx-auto px-5 lg:px-8 py-8 lg:py-12 grid gap-8 ${steps ? "lg:grid-cols-[190px_1fr]" : ""}`}>
        {/* left step rail */}
        {steps ? (
          <nav className="hidden lg:block" aria-label="Onboarding steps">
            <ol className="space-y-1 sticky top-24">
              {steps.map((label, i) => {
                const n = i + 1
                const done = n < current
                const active = n === current
                return (
                  <li key={label}>
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${active ? "bg-foreground/[0.06] font-medium" : "text-muted-foreground"}`}>
                      <span
                        className="grid place-items-center w-5 h-5 rounded-full text-[10px] font-mono shrink-0 border"
                        style={
                          done
                            ? { backgroundColor: accent, borderColor: accent, color: "#fff" }
                            : active
                              ? { borderColor: accent, color: accent }
                              : { borderColor: "rgba(127,127,127,0.35)" }
                        }
                      >
                        {done ? <Check className="w-3 h-3" /> : n}
                      </span>
                      <span className="truncate">{label}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </nav>
        ) : null}

        {/* content + optional aside */}
        <div className={`grid gap-8 ${aside ? "lg:grid-cols-[1fr_320px]" : ""} items-start`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-4 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              <span className="w-2.5 h-2.5" style={{ backgroundColor: accent }} />
              {eyebrow}
            </div>
            <h1 className="text-3xl lg:text-[2.6rem] leading-[1.05] tracking-tight text-balance" style={serif}>
              {title}
            </h1>
            {sub ? <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed max-w-prose">{sub}</p> : null}
            <div className="mt-8">{children}</div>
          </div>
          {aside ? <aside className="lg:sticky lg:top-24">{aside}</aside> : null}
        </div>
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
