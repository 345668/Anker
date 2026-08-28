/**
 * /dashboard/linkedin/campaigns — LinkedIn outreach campaigns (Phase 2).
 * Multi-step sequences (connect → wait → message → follow-up) that the
 * sequencer advances, still behind the approval gate unless full-auto.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { listCampaigns } from "@/lib/linkedin/campaigns"
import { listSenders } from "@/lib/linkedin/senders"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { CampaignsClient } from "@/components/linkedin/campaigns-client"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "LinkedIn Campaigns — Anker",
  description: "Multi-step LinkedIn outreach sequences.",
}

export default async function LinkedInCampaignsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const [campaigns, senders] = await Promise.all([listCampaigns(user.id), listSenders(user.id)])

  return (
    <PageShell>
      <PageHeader
        accent="#0a66c2"
        eyebrow="LinkedIn Outreach"
        title="Campaigns"
        description="Build a sequence once — connect, wait, message, follow up — and let the engine run it at a safe pace. Every step still passes the approval gate unless you switch a campaign to full-auto."
      />
      <CampaignsClient
        initial={campaigns}
        senders={senders.map((s) => ({ id: s.id, displayName: s.displayName, status: s.status }))}
      />
    </PageShell>
  )
}
