/**
 * POST /api/agents/profile
 *   { investorId? | firmId? | linkedinUrl? | firmWebsite?, extraContext? }
 *
 * Builds an investor profile (multi-source).  Returns the synthesized
 * profile + raw evidence.  Owner OR admin can trigger.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { buildInvestorProfile } from "@/lib/agents/profile-builder"

export const runtime = "nodejs"
export const maxDuration = 240

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const body = await req.json()

    if (!body?.investorId && !body?.firmId && !body?.linkedinUrl && !body?.firmWebsite) {
      return NextResponse.json({ error: "investorId | firmId | linkedinUrl | firmWebsite required" }, { status: 400 })
    }

    // Permission: must be admin OR own a CRM entry that links to this
    // investor/firm.  We do a simple ownership check.
    const meta = (user.user_metadata ?? {}) as Record<string, any>
    const isAdmin = meta.role === "admin"
    if (!isAdmin && (body.investorId || body.firmId)) {
      const [own] = await sql`
        SELECT 1 FROM crm_entries
        WHERE user_id = ${user.id}
          AND (investor_id = ${body.investorId ?? null} OR firm_id = ${body.firmId ?? null})
        LIMIT 1
      `
      if (!own) {
        return NextResponse.json({ error: "Forbidden — investor not in your CRM" }, { status: 403 })
      }
    }

    const profile = await buildInvestorProfile({
      investorId: body.investorId,
      firmId: body.firmId,
      linkedinUrl: body.linkedinUrl,
      firmWebsite: body.firmWebsite,
      extraContext: body.extraContext,
    })
    return NextResponse.json({ profile })
  } catch (e: any) {
    console.error("[agents/profile] error:", e)
    return NextResponse.json({ error: e?.message ?? "profile failed" }, { status: 500 })
  }
}
