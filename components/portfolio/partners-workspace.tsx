"use client"

import { useState } from "react"
import { PartnersTable, type Lp } from "@/components/portfolio/partners-table"
import { InformationSharingMatrix } from "@/components/portfolio/information-sharing-matrix"
import { LpEmailLog } from "@/components/portfolio/lp-email-log"
import type { LpSharingRow } from "@/lib/portfolio/information-sharing"

type Tab = "commitments" | "sharing" | "email"

/** Carta-style Partners sub-tabs: commitments · information sharing · email. */
export function PartnersWorkspace({
  lps,
  asOf,
  sharing,
  fundId,
}: {
  lps: Lp[]
  asOf?: string
  sharing: LpSharingRow[]
  fundId: string
}) {
  const [tab, setTab] = useState<Tab>("commitments")

  const tabs: { key: Tab; label: string }[] = [
    { key: "commitments", label: "Commitments" },
    { key: "sharing", label: "Information sharing" },
    { key: "email", label: "Email" },
  ]

  return (
    <div>
      <div className="flex items-center gap-1 mb-5 border-b border-foreground/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative px-3 py-2.5 text-sm transition-colors ${tab === t.key ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
            {tab === t.key ? <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#2f45e0]" /> : null}
          </button>
        ))}
      </div>

      {tab === "commitments" && <PartnersTable rows={lps} asOf={asOf} />}
      {tab === "sharing" && <InformationSharingMatrix initial={sharing} fundId={fundId} />}
      {tab === "email" && <LpEmailLog fundId={fundId} />}
    </div>
  )
}
