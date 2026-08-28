/**
 * /dashboard/linkedin/analytics — LinkedOut funnel.
 * Enrolled → connects → accepted → messages → replied, per campaign + totals.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { campaignFunnels } from "@/lib/linkedin/analytics"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { AnalyticsClient } from "@/components/linkedin/analytics-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "LinkedOut Analytics — Anker", description: "Outreach funnel by campaign." }

export default async function LinkedOutAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const report = await campaignFunnels(user.id)

  return (
    <PageShell>
      <PageHeader
        accent="#0a66c2"
        eyebrow="LinkedOut"
        title="Analytics"
        description="Your outreach funnel — connects sent, invites accepted, messages sent, and replies — per campaign and overall."
      />
      <AnalyticsClient report={report} />
    </PageShell>
  )
}
