import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { listLps } from "@/lib/portfolio/funds"
import { LpImportsClient } from "@/components/portfolio/lp-imports-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "LP Statement Import — Anker",
  description: "Paste an LP capital statement; AI maps the columns into dated positions.",
}

/**
 * /dashboard/portfolio/fund/lp-imports — paste-a-statement LP import.
 *
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */
export default async function LpImportsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fundId = "svs-fund-ii"
  const lps = (await listLps(fundId)).map((l) => ({ id: l.id, name: l.lp_name }))

  return <LpImportsClient lps={lps} />
}
