/**
 * /dashboard/portfolio/fund/ledger — the fund general ledger.
 *
 * Phase 3 of FUND_OPS_DESIGN.md §3.3: double-entry journal derived from
 * the record (calls, investments, valuations, exits, distributions),
 * manual entries for fees/expenses, trial balance + fund P&L + balance
 * sheet folded from journal lines.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { listEntries, buildStatements, hasLedgerTables } from "@/lib/portfolio/fund-ledger"
import { FundLedgerClient } from "@/components/portfolio/fund-ledger-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fund Ledger — Anker" }

export default async function LedgerPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const tablesReady = await hasLedgerTables()
  const [entries, statements] = tablesReady
    ? await Promise.all([listEntries(fund.id), buildStatements(fund.id)])
    : [[], null]

  return (
    <FundLedgerClient
      fund={fund}
      initialEntries={entries}
      initialStatements={statements}
      tablesReady={tablesReady}
    />
  )
}
