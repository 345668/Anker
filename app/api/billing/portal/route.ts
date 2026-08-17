import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
import { getStripe, isBillingConfigured, appUrl } from "@/lib/billing/stripe"
import { getBillingState } from "@/lib/billing/billing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Open the Stripe customer portal (manage/cancel/update payment) for the org. */
export async function POST() {
  if (!isBillingConfigured()) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { active } = await resolveActiveMembership(user.id)
  const orgId = active?.orgId ?? `user:${user.id}`
  const state = await getBillingState(orgId)
  if (!state.stripeCustomerId) return NextResponse.json({ error: "No billing customer yet — subscribe first." }, { status: 400 })

  const stripe = await getStripe()
  if (!stripe) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 })
  const session = await stripe.billingPortal.sessions.create({
    customer: state.stripeCustomerId,
    return_url: `${appUrl()}/dashboard/admin/billing`,
  })
  return NextResponse.json({ url: session.url })
}
