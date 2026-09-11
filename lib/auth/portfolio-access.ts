import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveWorkspaceFund } from "@/lib/auth/fund-access"

/** Portfolio requests always use the active fund. Explicit selectors are assertions,
 * never authority to switch tenants (including stale tabs after a workspace switch).
 */
export async function requirePortfolioAccess(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const fund = await resolveWorkspaceFund(user.id)
  if (!fund) return NextResponse.json({ error: "Fund access denied" }, { status: 403 })

  const selectors: unknown[] = new URL(req.url).searchParams.getAll("fundId")
  if (["POST", "PATCH", "PUT"].includes(req.method) && req.body !== null) {
    let body: unknown
    try { body = await req.clone().json() } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 })
    }
    if ("fundId" in body) selectors.push(body.fundId)
  }
  if (selectors.some((value) => typeof value !== "string" || ![fund.id, fund.slug].includes(value.trim()))) {
    return NextResponse.json({ error: "Fund access denied" }, { status: 403 })
  }
  return { id: user.id, email: user.email ?? null, fund }
}
