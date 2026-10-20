import { NextRequest, NextResponse } from "next/server"
import { startSignup, verifySignup } from "@/lib/investor/signup"
import { investorFailure } from "@/lib/investor/access"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/** Public. { step: "start", email, name, termsAccepted } emails a code; { step: "verify", email, code, password } makes the account. Closed while the platform flag is off. */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    if (b?.step === "verify") {
      const r = await verifySignup({ email: b.email, code: b.code, password: b.password }, () => createAdminClient().auth.admin as any)
      return NextResponse.json({ ok: true, email: r.email })
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
    return NextResponse.json({ ok: true, ...(await startSignup({ email: b?.email, name: b?.name, termsAccepted: b?.termsAccepted === true, ip })) })
  } catch (e) { return investorFailure(e, "Sign-up could not be completed.") }
}
