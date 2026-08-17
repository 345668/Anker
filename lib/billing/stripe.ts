/**
 * Stripe client — lazily loaded so the app builds and runs even when the `stripe`
 * package isn't installed or no key is configured. Billing is simply "not
 * configured" until STRIPE_SECRET_KEY is set (see isBillingConfigured). The
 * dynamic import specifier is cast to string so TypeScript doesn't require the
 * module at compile time.
 */

export function isBillingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

/** Public config the client UI needs (which plans exist, portal availability). */
export const BILLING_PLANS: { id: string; label: string; priceEnv: string; blurb: string; credits: number }[] = [
  { id: "starter", label: "Starter", priceEnv: "STRIPE_PRICE_STARTER", blurb: "For a founder raising a round.", credits: 500 },
  { id: "pro", label: "Pro", priceEnv: "STRIPE_PRICE_PRO", blurb: "For an active fund or power user.", credits: 5000 },
  { id: "scale", label: "Scale", priceEnv: "STRIPE_PRICE_SCALE", blurb: "For a multi-fund platform.", credits: 25000 },
]

export function priceIdForPlan(planId: string): string | null {
  const plan = BILLING_PLANS.find((p) => p.id === planId)
  if (!plan) return null
  return process.env[plan.priceEnv] ?? null
}
export function planForPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null
  const plan = BILLING_PLANS.find((p) => process.env[p.priceEnv] === priceId)
  return plan?.id ?? null
}

let _stripe: any = null

/** Resolve the Stripe SDK, or null when unconfigured. */
export async function getStripe(): Promise<any | null> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  if (_stripe) return _stripe
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod: any = await import("stripe" as string)
  const Stripe = mod.default ?? mod
  _stripe = new Stripe(key, { apiVersion: "2024-06-20" })
  return _stripe
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://an-ker.de"
}
