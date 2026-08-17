import { NextResponse } from "next/server"
import { getStripe, isBillingConfigured, planForPriceId, BILLING_PLANS } from "@/lib/billing/stripe"
import { upsertSubscription, orgForStripeCustomer, upsertCustomer, grantCredits } from "@/lib/billing/billing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Stripe webhook — keeps the local billing mirror in sync. Verifies the
 * signature against STRIPE_WEBHOOK_SECRET, then upserts subscription state and
 * grants the plan's monthly credit allotment on each paid invoice.
 *
 * Configure in Stripe (or via the Vercel Stripe integration) to POST to
 * /api/billing/webhook for: checkout.session.completed,
 * customer.subscription.{created,updated,deleted}, invoice.paid.
 */
export async function POST(req: Request) {
  if (!isBillingConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 })
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const stripe = await getStripe()
  if (!stripe || !secret) return NextResponse.json({ error: "not configured" }, { status: 503 })

  const sig = req.headers.get("stripe-signature") ?? ""
  const raw = await req.text()
  let event: any
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (e: any) {
    return NextResponse.json({ error: `signature: ${e?.message}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object
        const orgId = s.client_reference_id || s.metadata?.orgId
        if (orgId && s.customer) await upsertCustomer(orgId, s.customer, s.customer_details?.email ?? null)
        if (orgId && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription)
          await upsertSubscription(orgId, sub)
        }
        break
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object
        const orgId = sub.metadata?.orgId || (await orgForStripeCustomer(sub.customer))
        if (orgId) await upsertSubscription(orgId, sub)
        break
      }
      case "invoice.paid": {
        const inv = event.data.object
        const orgId = await orgForStripeCustomer(inv.customer)
        const priceId = inv.lines?.data?.[0]?.price?.id
        const planId = planForPriceId(priceId)
        const plan = BILLING_PLANS.find((p) => p.id === planId)
        if (orgId && plan) await grantCredits(orgId, plan.credits, "plan_allotment", { invoice: inv.id, plan: plan.id })
        break
      }
    }
  } catch (e: any) {
    console.error("[billing webhook]", event?.type, e?.message)
    return NextResponse.json({ error: "handler failed" }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}
