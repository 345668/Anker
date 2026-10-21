import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { eraseInvestor } from "@/lib/investor/rights"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
/** { confirm: "ERASE" } — erases the signed-in investor (docs/architecture/73). Cannot be undone. */
export async function POST(req: NextRequest) {
  try {
    const c = await investorContext(), b = await req.json()
    const summary = await eraseInvestor(c.userId, b?.confirm, async (id) => { const { error } = await createAdminClient().auth.admin.deleteUser(id); if (error) throw new Error(error.message) })
    return NextResponse.json({ ok: true, summary })
  } catch (e) { return investorFailure(e, "Your account could not be erased. Nothing further was changed after the last step; please contact us.") }
}
