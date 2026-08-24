/**
 * /dashboard/linkedin/campaigns/[id] — the campaign builder.
 * Sequence steps + sender + full-auto + enrolled members + activate/pause.
 */
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCampaign, listSteps, listMembers, memberStateCounts } from "@/lib/linkedin/campaigns"
import { listSenders } from "@/lib/linkedin/senders"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { CampaignBuilderClient } from "@/components/linkedin/campaign-builder-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Campaign — Anker" }

export default async function CampaignBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const campaign = await getCampaign(user.id, id)
  if (!campaign) notFound()

  const [steps, members, counts, senders] = await Promise.all([
    listSteps(id), listMembers(id), memberStateCounts(id), listSenders(user.id),
  ])

  return (
    <PageShell>
      <PageHeader accent="#0a66c2" eyebrow="LinkedIn Campaign" title={campaign.name} description="Define the sequence, assign a sender, enroll people, then activate." />
      <CampaignBuilderClient
        campaign={campaign}
        initialSteps={steps}
        initialMembers={members}
        counts={counts}
        senders={senders.map((s) => ({ id: s.id, displayName: s.displayName, status: s.status }))}
      />
    </PageShell>
  )
}
