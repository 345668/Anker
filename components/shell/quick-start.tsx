"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Compass, Send, FileUp, PieChart, Target, PhoneCall, Plus, Banknote, ArrowRight } from "lucide-react"

type Action = { label: string; href: string; icon: any }

const FOUNDER: Action[] = [
  { label: "Find investors", href: "/dashboard/find-investors", icon: Compass },
  { label: "Draft outreach", href: "/dashboard/outreach", icon: Send },
  { label: "Upload deck", href: "/dashboard/pitch-deck", icon: FileUp },
  { label: "Cap table", href: "/dashboard/cap-table", icon: PieChart },
]

const VC: Action[] = [
  { label: "Call capital", href: "/dashboard/portfolio/fund/calls/new", icon: PhoneCall },
  { label: "New investment", href: "/dashboard/portfolio/fund/investments", icon: Target },
  { label: "Initiate payment", href: "/dashboard/portfolio/fund/distributions/new", icon: Banknote },
  { label: "New deal", href: "/dashboard/portfolio/fund/deals", icon: Plus },
]

/** Carta-style Quick Start action bar, persona-aware via the active workspace. */
export function QuickStart() {
  const [persona, setPersona] = useState<"founder" | "vc" | null>(null)

  useEffect(() => {
    fetch("/api/org/active")
      .then((r) => r.json())
      .then((d) => {
        const active = (d.memberships ?? []).find((m: any) => m.orgId === d.activeOrgId) ?? (d.memberships ?? [])[0]
        setPersona(active?.persona === "vc" ? "vc" : "founder")
      })
      .catch(() => setPersona("founder"))
  }, [])

  const actions = persona === "vc" ? VC : FOUNDER

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-3 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
        <span className="w-2 h-2" style={{ backgroundColor: persona === "vc" ? "#2f45e0" : "#e5380f" }} />
        Quick start
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {actions.map((a) => {
          const Icon = a.icon
          return (
            <Link
              key={a.label}
              href={a.href}
              className="group flex items-center gap-3 rounded-lg border border-foreground/12 bg-foreground/[0.015] px-4 py-3.5 hover:border-foreground/40 transition-colors"
            >
              <span className="grid place-items-center w-9 h-9 rounded-md bg-foreground/[0.06] text-foreground/80 shrink-0">
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-sm font-medium flex-1">{a.label}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
