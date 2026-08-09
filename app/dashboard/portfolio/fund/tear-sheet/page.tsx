import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { listInvestments } from "@/lib/portfolio/investments"
import { TearSheetBuilder, type TearSheetCompany, type TearSheetFund } from "@/components/portfolio/tear-sheet-builder"

export const dynamic = "force-dynamic"
export const metadata = { title: "Tear sheet builder — Anker" }

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const mult = (v: number) => `${v.toFixed(2)}×`
const fmtDate = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : "—")

export default async function TearSheetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const fund = await getFundBySlug("svs-fund-ii")
  const investments = fund ? await listInvestments(fund.id) : []

  // Group investments into one tear sheet per portfolio company.
  const byCompany = new Map<string, typeof investments>()
  for (const i of investments) {
    const arr = byCompany.get(i.company_name) ?? []
    arr.push(i)
    byCompany.set(i.company_name, arr)
  }

  const companies: TearSheetCompany[] = Array.from(byCompany.entries()).map(([name, rows]) => {
    const cost = rows.reduce((s, r) => s + (Number(r.cost_basis) || 0), 0)
    const fv = rows.reduce((s, r) => s + (Number(r.current_fair_value ?? r.cost_basis) || 0), 0)
    const realized = rows.reduce((s, r) => s + (Number(r.realized_proceeds) || 0), 0)
    const gain = fv + realized - cost
    const ownership = rows.reduce((s, r) => s + (Number(r.fully_diluted_pct) || 0), 0)
    const heldSince = rows.map((r) => r.invested_at).filter(Boolean).sort()[0] ?? null
    const overview = rows.find((r) => r.notes)?.notes ?? ""
    const history = rows
      .slice()
      .sort((a, b) => (a.invested_at ?? "").localeCompare(b.invested_at ?? ""))
      .map((r) => {
        const c = Number(r.cost_basis) || 0
        const f = Number(r.current_fair_value ?? r.cost_basis) || 0
        return {
          date: fmtDate(r.invested_at),
          round: r.round_name ?? r.security_type.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase()),
          cost: money(c),
          multiple: c > 0 ? mult(f / c) : "—",
          irr: "—",
        }
      })
    return {
      name,
      heldBy: "1 fund",
      heldSince: fmtDate(heldSince),
      itdValue: fv > 0 ? money(fv) : "—",
      gainLoss: money(Math.abs(gain)),
      gainPositive: gain >= 0,
      ownership: ownership > 0 ? `${ownership.toFixed(2)}%` : "0.00%",
      latestMark: fv > 0 ? money(fv) : "—",
      overview,
      history,
    }
  })

  const funds: TearSheetFund[] = fund ? [{ id: fund.id, name: fund.name }] : []

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      {companies.length ? (
        <TearSheetBuilder firmName={fund?.name ?? "Fund"} funds={funds} companies={companies} />
      ) : (
        <p className="text-sm text-muted-foreground">No portfolio companies to build tear sheets from yet.</p>
      )}
    </div>
  )
}
