import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
import { getStripe, isBillingConfigured, priceIdForPlan, appUrl } from "@/lib/billing/stripe"
import { getBillingState, upsertCustomer } from "@/lib/billing/billing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Create a Stripe Checkout session for the active org to subscribe to a plan. */
export async function POST(req: Request) {
  if (!isBillingConfigured()) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { active } = await resolveActiveMembership(user.id)
  const orgId = active?.orgId ?? `user:${user.id}`

  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }
  const priceId = priceIdForPlan(String(body.plan ?? ""))
  if (!priceId) return NextResponse.json({ error: "Unknown or unconfigured plan." }, { status: 400 })

  const stripe = await getStripe()
  if (!stripe) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 })

  // Reuse the org's Stripe customer, or create one.
  const state = await getBillingState(orgId)
  let customerId: string = state.stripeCustomerId ?? ""
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email ?? undefined, metadata: { orgId } })
    customerId = String(customer.id)
    await upsertCustomer(orgId, customerId, user.email ?? null)
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: orgId,
    subscription_data: { metadata: { orgId } },
    success_url: `${appUrl()}/dashboard/admin/billing?checkout=success`,
    cancel_url: `${appUrl()}/dashboard/admin/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  })
  return NextResponse.json({ url: session.url })
}
