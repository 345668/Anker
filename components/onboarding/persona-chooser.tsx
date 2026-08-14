"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Check } from "lucide-react"
import { ObShell, AnchorSigil, ACCENT, serif, type PersonaKey } from "./ob-shell"

type Persona = { key: PersonaKey; name: string; role: string; tag: string; setup: string[] }

const PERSONAS: Persona[] = [
  {
    key: "founder",
    name: "Founder",
    role: "Raising capital",
    tag: "Find investors, run outreach, and manage your raise end-to-end.",
    setup: ["Match investors to your deck", "Draft & send outreach", "Cap table & runway", "Pitch deck + data room"],
  },
  {
    key: "vc",
    name: "Venture Fund",
    role: "Deploying capital",
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
    <ObShell
      current={1}
      total={8}
      eyebrow="Get started"
      title="Choose your path"
      sub="This sets up your workspace around how you'll use Anker. You can run both a Founder and a Fund workspace later."
    >
      <div className="grid md:grid-cols-2 gap-5">
        {PERSONAS.map((p) => {
          const active = sel === p.key
          const c = ACCENT[p.key]
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => choose(p.key)}
              aria-pressed={active}
              className="group text-left rounded-xl border border-foreground/12 bg-foreground/[0.015] overflow-hidden transition-colors hover:border-foreground/30 focus:outline-none"
              style={active ? { borderColor: c, boxShadow: `inset 0 0 0 1px ${c}` } : undefined}
            >
              <div className="h-1 w-full" style={{ backgroundColor: c }} />
              <div className="p-6 lg:p-7">
                <div className="flex items-start justify-between">
                  <span className="w-11 h-11" style={{ color: c }}>
                    <AnchorSigil variant={p.key} />
                  </span>
                  <span
                    className="text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border"
                    style={{ color: c, borderColor: `color-mix(in oklab, ${c} 40%, transparent)` }}
                  >
                    {p.role}
                  </span>
                </div>
                <h2 className="mt-5 text-3xl tracking-tight" style={serif}>{p.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{p.tag}</p>
                <ul className="mt-5 pt-5 border-t border-foreground/10 grid gap-2.5">
                  {p.setup.map((s) => (
                    <li key={s} className="flex items-center gap-2.5 text-sm">
                      <Check className="w-4 h-4 shrink-0" style={{ color: c }} />
                      {s}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-mono uppercase tracking-wider" style={{ color: c }}>
                  {active ? "Selected" : "Select"} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className={`mt-8 flex flex-wrap items-center gap-4 transition-opacity ${sel ? "opacity-100" : "opacity-0 pointer-events-none"}`} aria-live="polite">
        <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          Selected — <span className="text-foreground">{selected?.name ?? ""}</span>
        </span>
        <button
          type="button"
          onClick={() => selected && router.push(`/onboarding/${selected.key}`)}
          className="ml-auto inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-px"
          style={{ backgroundColor: selected ? ACCENT[selected.key] : ACCENT.founder }}
        >
          Continue as {selected?.name ?? ""} <ArrowRight className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => setSel(null)} className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Change
        </button>
      </div>
    </ObShell>
  )
}
