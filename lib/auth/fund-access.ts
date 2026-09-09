import { NextResponse } from "next/server"
import { redirect, notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
import { sql } from "@/lib/db"
import { getFundById } from "@/lib/portfolio/funds"

/** Staff privileges and navigation previews never imply access to tenant funds. */
export async function resolveWorkspaceFund(userId: string) {
  const { active } = await resolveActiveMembership(userId)
  if (!active || active.kind !== "fund" || active.persona !== "vc" ||
      !["workspace_owner", "admin"].includes(active.orgRole)) return null
  const [org] = await sql`SELECT fund_id FROM organizations WHERE id = ${active.orgId} LIMIT 1`
  return org?.fund_id ? getFundById(String(org.fund_id)) : null
}

export async function requireFundAccess(requested: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const fund = await resolveWorkspaceFund(user.id)
  if (!fund || ![fund.id, fund.slug].includes(requested.trim())) {
    return NextResponse.json({ error: "Fund access denied" }, { status: 403 })
  }
  return { id: user.id, email: user.email ?? null, metadata: user.user_metadata ?? {}, fund }
}

export async function requireActiveFund() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const fund = await resolveWorkspaceFund(user.id)
  if (!fund) notFound()
  return fund
}

export async function getAuthorizedFundById(id: string) {
  const fund = await requireActiveFund()
  if (fund.id !== id) notFound()
  return fund
}
