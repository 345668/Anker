/**
 * Admin-side capital account statement viewer.
 *
 * Route: /dashboard/portfolio/fund/lps/[lpId]/statement
 *   ?as_of=YYYY-MM-DD  — optional cutoff
 *   ?nav=12345.67       — optional per-LP NAV for TVPI/RVPI
 *
 * Renders the LP's capital account statement: header, commitment summary,
 * performance metrics (DPI always; TVPI/RVPI when NAV passed), and the
 * chronological transaction history. The same statement object will back
 * the PDF export and (eventually) the LP-portal view.
 */
import { redirect, notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug, getLpById } from "@/lib/portfolio/funds"
import { buildStatement } from "@/lib/portfolio/capital-account"
import { StatementView } from "@/components/portfolio/statement-view"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ lpId: string }>
  searchParams: Promise<{ as_of?: string; nav?: string }>
}

export default async function CapitalAccountStatementPage({ params, searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const { lpId } = await params
  const { as_of: asOf, nav: navRaw } = await searchParams

  // Resolve the LP first to get the fund_id — same pattern the existing
  // [lpId] PATCH route uses (LP ids are globally unique).
  const lp = await getLpById(lpId)
  if (!lp) notFound()

  // Today there's a single fund (SVS Fund II) — keep this resolution flexible
  // so when multi-fund lands we just swap to getFundById(lp.fund_id).
  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund || fund.id !== lp.fund_id) {
    // LP belongs to a different fund than the one wired into the admin UI.
    // Render as not-found rather than a misleading mismatched statement.
    notFound()
  }

  const nav = navRaw == null || navRaw === "" ? null : Number(navRaw)
  const currentNav = nav != null && Number.isFinite(nav) ? nav : null

  const statement = await buildStatement({
    fundId: fund.id,
    lpId: lp.id,
    asOfDate: asOf ?? null,
    currentNav,
  })
  if (!statement) notFound()

  return <StatementView statement={statement} />
}
