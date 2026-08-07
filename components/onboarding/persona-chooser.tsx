"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Check } from "lucide-react"
import { ObShell, AnchorSigil, ACCENT, type PersonaKey } from "./ob-shell"

type Persona = {
  key: PersonaKey
  idx: string
  name: string
  role: string
  tag: string
  setup: string[]
}

const PERSONAS: Persona[] = [
  {
    key: "founder",
    idx: "01",
    name: "Founder",
    role: "The Builder",
    tag: "Find investors, run outreach, and manage your raise end-to-end.",
    setup: ["Match investors to your deck", "Draft & send outreach", "Cap table & runway", "Pitch deck + data room"],
  },
  {
    key: "vc",
    idx: "02",
    name: "Venture Fund",
    role: "The Allocator",
    tag: "Source deals, match LPs, and run the fund back-office.",
    setup: ["Source & score deals", "LP matchmaking", "Portfolio & NAV", "Fund back-office & LP reporting"],
  },
]

export function PersonaChooser() {
  const router = useRouter()
  const [sel, setSel] = useState<PersonaKey | null>(null)
  const selected = PERSONAS.find((p) => p.key === sel) || null

  function choose(key: PersonaKey) {
    setSel(key)
    fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_type: key, step: 0 }),
    }).catch(() => {})
  }

  return (
    <ObShell step={1} total={8} title="Choose your path" sub="This sets up your workspace around how you'll use Anker. Pick the one that fits you today.">
      <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
        {PERSONAS.map((p) => {
          const active = sel === p.key
          const c = ACCENT[p.key]
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => choose(p.key)}
              aria-pressed={active}
              className="group text-left border border-foreground/15 hover:border-foreground/40 transition-colors bg-foreground/[0.015] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={active ? { borderColor: c, boxShadow: `inset 0 0 0 1px ${c}` } : undefined}
            >
              {/* accent top rule */}
              <div className="h-1 w-full" style={{ backgroundColor: c }} />
              <div className="p-6 lg:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="w-12 h-12 lg:w-14 lg:h-14" style={{ color: c }}>
                    <AnchorSigil variant={p.key} />
                  </div>
                  <span className="font-display text-3xl lg:text-4xl text-foreground/15 leading-none">{p.idx}</span>
                </div>
                <div className="mt-6 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em]" style={{ color: c }}>
                  {p.role}
                </div>
                <h2 className="mt-1 font-display text-3xl lg:text-4xl tracking-tight text-foreground">{p.name}</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-sm">{p.tag}</p>

                <div className="mt-6 pt-6 border-t border-foreground/10">
                  <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">You&apos;ll set up</div>
                  <ul className="grid gap-2.5">
                    {p.setup.map((s) => (
                      <li key={s} className="flex items-center gap-2.5 text-sm text-foreground">
                        <Check className="w-4 h-4 shrink-0" style={{ color: c }} />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-7 inline-flex items-center gap-2 text-sm font-mono uppercase tracking-wider" style={{ color: c }}>
                  {active ? "Selected" : "Select"}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Confirm row */}
      <div
        className={`mt-8 flex flex-wrap items-center gap-4 border-t border-foreground/10 pt-6 transition-opacity ${sel ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        aria-live="polite"
      >
        <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          Path selected — <span className="text-foreground">{selected?.name ?? ""}</span>
        </span>
        <button
          type="button"
          onClick={() => selected && router.push(`/onboarding/${selected.key}`)}
          className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 text-sm font-mono uppercase tracking-wider text-white transition-transform hover:-translate-y-px"
          style={{ backgroundColor: selected ? ACCENT[selected.key] : ACCENT.founder }}
        >
          Continue as {selected?.name ?? ""}
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setSel(null)}
          className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Change
        </button>
      </div>
    </ObShell>
  )
}
