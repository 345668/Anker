"use client"

import { useState } from "react"
import { PartnersTable, type Lp } from "@/components/portfolio/partners-table"
import { InformationSharingMatrix } from "@/components/portfolio/information-sharing-matrix"
import type { LpSharingRow } from "@/lib/portfolio/information-sharing"

/** Carta-style Partners sub-tabs: commitments table + information-sharing matrix. */
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
  const [tab, setTab] = useState<"commitments" | "sharing">("commitments")

  const tabs: { key: "commitments" | "sharing"; label: string }[] = [
    { key: "commitments", label: "Commitments" },
    { key: "sharing", label: "Information sharing" },
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

      {tab === "commitments" ? (
        <PartnersTable rows={lps} asOf={asOf} />
      ) : (
        <InformationSharingMatrix initial={sharing} fundId={fundId} />
      )}
    </div>
  )
}
