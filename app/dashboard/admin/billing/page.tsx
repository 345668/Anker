import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { resolveActiveMembership } from "@/lib/org/active"
import { AdminShell } from "@/components/admin/admin-shell"
import { BillingClient } from "@/components/admin/billing-client"
import { getBillingState } from "@/lib/billing/billing"
import { isBillingConfigured, BILLING_PLANS } from "@/lib/billing/stripe"

export const dynamic = "force-dynamic"
export const metadata = { title: "Billing & credits — Anker admin" }

/** Billing & credits — Stripe-backed subscription + AI-credit balance for the org. */
export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { active } = user ? await resolveActiveMembership(user.id) : { active: null }
  const orgId = active?.orgId ?? (user ? `user:${user.id}` : "unknown")

  const configured = isBillingConfigured()
  const state = await getBillingState(orgId)
  const plans = BILLING_PLANS.map((p) => ({ id: p.id, label: p.label, blurb: p.blurb, credits: p.credits }))

  return (
    <AdminShell
      eyebrow="Admin · billing"
      title="Billing & credits."
      description="Plan, subscription status, and AI-credit balance — powered by Stripe. Manage payment and invoices in the Stripe customer portal."
      email={email}
    >
      <BillingClient configured={configured} state={state} plans={plans} />
    </AdminShell>
  )
}
