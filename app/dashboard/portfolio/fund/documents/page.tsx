import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug, listLps } from "@/lib/portfolio/funds"
import { listDocuments, getDocumentViewStats, getRecentDocumentViews } from "@/lib/portfolio/data-room"
import { DataRoomAdminClient } from "@/components/portfolio/data-room-admin-client"
import { DocumentEngagementPanel } from "@/components/portfolio/document-engagement-panel"
import { completeness, FUND_SECTIONS } from "@/lib/dataroom/taxonomy"

export const dynamic = "force-dynamic"

export default async function DataRoomAdminPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const [docs, lps, viewStats, recentViews] = await Promise.all([
    listDocuments({ fundId: fund.id, limit: 200 }),
    listLps(fund.id),
    getDocumentViewStats(fund.id),
    getRecentDocumentViews(fund.id, 30),
  ])

  const sectionsWithDocs = new Set(docs.rows.map((d) => d.section).filter(Boolean) as string[])
  const score = completeness("fund", sectionsWithDocs)
  const sectionCounts = FUND_SECTIONS.map((s) => ({
    label: s.label,
    count: docs.rows.filter((d) => d.section === s.key).length,
    required: s.items.some((i) => i.required),
  }))

  return (
    <div>
      {/* Fund room completeness */}
      <div className="px-6 lg:px-8 pt-6">
        <div className="border border-foreground/10 rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-medium">Fund room completeness</div>
              <div className="text-xs text-muted-foreground">{score.met} of {score.total} required sections have documents</div>
            </div>
            <span className="text-2xl font-semibold tabular-nums text-[#2f45e0]">{score.pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-foreground/10 overflow-hidden mb-4">
            <div className="h-full rounded-full bg-[#2f45e0] transition-all" style={{ width: `${score.pct}%` }} />
          </div>
          <div className="flex flex-wrap gap-2">
            {sectionCounts.map((s) => (
              <span key={s.label} className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border ${s.count > 0 ? "border-foreground/12 text-foreground/70" : s.required ? "border-amber-500/30 text-amber-600 dark:text-amber-400" : "border-foreground/8 text-muted-foreground"}`}>
                {s.label}<span className="tabular-nums opacity-70">{s.count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <DocumentEngagementPanel stats={viewStats} recent={recentViews} />
      <DataRoomAdminClient
        fund={fund}
        initialDocuments={docs.rows}
        lps={lps.map((l) => ({
          id: l.id,
          name: l.lp_name,
          status: l.status,
          has_contact_email: !!l.contact_email,
        }))}
      />
    </div>
  )
}
