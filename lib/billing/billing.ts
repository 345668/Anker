import { sql } from "@/lib/db"
import { planForPriceId } from "@/lib/billing/stripe"

/**
 * Billing data access (org-scoped). Reads the local mirror of Stripe state that
 * the webhook keeps in sync — the app never hits Stripe on a read path.
 */

export interface BillingState {
  orgId: string
  stripeCustomerId: string | null
  subscription: {
    id: string | null
    status: string | null
    plan: string | null
    priceId: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  } | null
  creditBalance: number
}

const d = (v: any) => (v ? String(v) : null)

export async function getBillingState(orgId: string): Promise<BillingState> {
  const [cust, sub, bal] = await Promise.all([
    sql`SELECT stripe_customer_id FROM billing_customers WHERE org_id = ${orgId} LIMIT 1`,
    sql`SELECT * FROM billing_subscriptions WHERE org_id = ${orgId} LIMIT 1`,
    sql`SELECT COALESCE(SUM(delta), 0)::int AS balance FROM billing_credit_ledger WHERE org_id = ${orgId}`,
  ])
  const s = sub[0]
  return {
    orgId,
    stripeCustomerId: cust[0]?.stripe_customer_id ?? null,
    subscription: s
      ? {
          id: s.stripe_subscription_id ?? null,
          status: s.status ?? null,
          plan: s.plan ?? null,
          priceId: s.price_id ?? null,
          currentPeriodEnd: d(s.current_period_end),
          cancelAtPeriodEnd: s.cancel_at_period_end === true,
        }
      : null,
    creditBalance: bal[0]?.balance ?? 0,
  }
}

export async function upsertCustomer(orgId: string, stripeCustomerId: string, email: string | null): Promise<void> {
  await sql`
    INSERT INTO billing_customers (org_id, stripe_customer_id, email, updated_at)
    VALUES (${orgId}, ${stripeCustomerId}, ${email}, now())
    ON CONFLICT (org_id) DO UPDATE SET stripe_customer_id = ${stripeCustomerId}, email = COALESCE(${email}, billing_customers.email), updated_at = now()`
}

/** Look up the org that owns a Stripe customer (webhook → local). */
export async function orgForStripeCustomer(stripeCustomerId: string): Promise<string | null> {
  const rows = await sql`SELECT org_id FROM billing_customers WHERE stripe_customer_id = ${stripeCustomerId} LIMIT 1`
  return rows[0]?.org_id ?? null
}

/** Upsert subscription state from a Stripe subscription object (webhook). */
export async function upsertSubscription(orgId: string, sub: any): Promise<void> {
  const priceId = sub?.items?.data?.[0]?.price?.id ?? null
  const plan = planForPriceId(priceId)
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
  await sql`
    INSERT INTO billing_subscriptions (org_id, stripe_subscription_id, stripe_customer_id, status, plan, price_id, current_period_end, cancel_at_period_end, updated_at)
    VALUES (${orgId}, ${sub?.id ?? null}, ${sub?.customer ?? null}, ${sub?.status ?? null}, ${plan}, ${priceId}, ${periodEnd}::timestamptz, ${sub?.cancel_at_period_end === true}, now())
    ON CONFLICT (org_id) DO UPDATE SET
      stripe_subscription_id = ${sub?.id ?? null}, stripe_customer_id = ${sub?.customer ?? null},
      status = ${sub?.status ?? null}, plan = ${plan}, price_id = ${priceId},
      current_period_end = ${periodEnd}::timestamptz, cancel_at_period_end = ${sub?.cancel_at_period_end === true}, updated_at = now()`
}

export async function grantCredits(orgId: string, delta: number, reason: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await sql`INSERT INTO billing_credit_ledger (org_id, delta, reason, metadata) VALUES (${orgId}, ${Math.round(delta)}, ${reason}, ${JSON.stringify(metadata)}::jsonb)`
}
