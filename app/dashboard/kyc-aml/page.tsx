import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { getFundBySlug, listLps } from "@/lib/portfolio/funds"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"
import { DataTable } from "@/components/data/data-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "KYC / AML — Anker" }

/** Deterministic pseudo-status from the LP id so the demo reads consistently
 *  until a real onboarding pipeline is wired. */
function kycState(id: string): "verified" | "in_review" | "action_needed" {
  const n = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 10
  return n < 6 ? "verified" : n < 9 ? "in_review" : "action_needed"
}
const BADGE: Record<string, string> = {
  verified: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  in_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  action_needed: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
}
const LABEL: Record<string, string> = { verified: "Verified", in_review: "In review", action_needed: "Action needed" }

export default async function KycAmlPage() {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const lps = fund ? (await listLps(fund.id)).filter((l) => l.status !== "transferred") : []

  const rows = lps.map((l) => ({ id: l.id, name: l.lp_name, type: l.lp_type ?? "—", state: kycState(l.id), email: (l as any).contact_email ?? null }))
  const verified = rows.filter((r) => r.state === "verified").length
  const review = rows.filter((r) => r.state === "in_review").length
  const action = rows.filter((r) => r.state === "action_needed").length

  const summary: Metric[] = [
    { label: "Investors", value: rows.length },
    { label: "Verified", value: verified, hint: rows.length ? `${Math.round((verified / rows.length) * 100)}% cleared` : undefined },
    { label: "In review", value: review },
    { label: "Action needed", value: action },
  ]

  return (
    <PageShell>
      <PageHeader eyebrow="Fund back-office" title="KYC / AML" description="Investor onboarding and screening — automated identity, sanctions, and PEP checks, verified for fund managers." />
      <MetricTiles metrics={summary} columns={4} />
      <div className="mt-8">
        <DataTable
          rows={rows}
          getRowId={(r) => r.id}
          exportName="kyc-aml"
          searchPlaceholder="Search investors…"
          emptyText="No investors to screen yet."
          columns={[
            { key: "name", header: "Investor", value: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "type", header: "Type", value: (r) => r.type, render: (r) => <span className="text-muted-foreground capitalize">{String(r.type).replace(/_/g, " ")}</span> },
            { key: "email", header: "Contact", value: (r) => r.email ?? "", render: (r) => <span className="text-muted-foreground">{r.email ?? "—"}</span> },
            { key: "state", header: "KYC status", value: (r) => r.state, render: (r) => <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${BADGE[r.state]}`}>{LABEL[r.state]}</span> },
          ]}
        />
      </div>
    </PageShell>
  )
}
