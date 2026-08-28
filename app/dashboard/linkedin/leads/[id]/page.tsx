/**
 * /dashboard/linkedin/leads/[id] — lead list detail.
 * Add leads (paste/CSV), import from captured connections, enroll into a campaign.
 */
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getLeadList, listLeadListMembers } from "@/lib/linkedin/lead-lists"
import { listCampaigns } from "@/lib/linkedin/campaigns"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { LeadListDetailClient } from "@/components/linkedin/lead-list-detail-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Lead list — Anker" }

export default async function LeadListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const list = await getLeadList(user.id, id)
  if (!list) notFound()
  const [members, campaigns] = await Promise.all([listLeadListMembers(id), listCampaigns(user.id)])

  return (
    <PageShell>
      <PageHeader accent="#0a66c2" eyebrow="LinkedIn Leads" title={list.name} description="Add people, import from your connections, then send the list to a campaign." />
      <LeadListDetailClient
        list={list}
        initialMembers={members}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status }))}
      />
    </PageShell>
  )
}
