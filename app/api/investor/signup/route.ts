import { NextRequest, NextResponse } from "next/server"
import { startSignup, verifySignup } from "@/lib/investor/signup"
import { investorFailure } from "@/lib/investor/access"
import { createAdminClient } from "@/lib/supabase/admin"
import { isLocalMode } from "@/lib/supabase/server"
import { createUser } from "@/lib/auth/local"
import type { AdminAuth } from "@/lib/investor/signup"

/** On a local database there is no Supabase: the account goes into the local users table instead. Never on a production deployment (isLocalMode is false there). */
const localAdmin = (): AdminAuth => ({
  createUser: async (a) => {
    const r = await createUser({ email: a.email, password: a.password, name: String(a.user_metadata?.full_name ?? ""), role: "founder" })
    return r.ok ? { data: { user: { id: r.user.id } }, error: null } : { data: { user: null }, error: { message: r.error } }
  },
})

export const runtime = "nodejs"

/** Public. { step: "start", email, name, termsAccepted } emails a code; { step: "verify", email, code, password } makes the account. Closed while the platform flag is off. */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    if (b?.step === "verify") {
      const r = await verifySignup({ email: b.email, code: b.code, password: b.password }, () => (isLocalMode ? localAdmin() : (createAdminClient().auth.admin as any)))
      return NextResponse.json({ ok: true, email: r.email })
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
    return NextResponse.json({ ok: true, ...(await startSignup({ email: b?.email, name: b?.name, termsAccepted: b?.termsAccepted === true, ip })) })
  } catch (e) { return investorFailure(e, "Sign-up could not be completed.") }
}
