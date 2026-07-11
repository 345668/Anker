/**
 * Campaign builder wizard.
 *
 * Server component: verifies the campaign belongs to the current user,
 * pulls minimal campaign metadata, then hands off to the client wizard
 * that walks through Source → Score → Verify → Draft.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { CampaignBuilderWizard } from "@/components/outreach/campaign-builder-wizard"

export const dynamic = "force-dynamic"
export const metadata = { title: "Build campaign — Anker" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const camp = await sql<any[]>`
    SELECT id, name, description, status, cc_addresses, bcc_addresses,
           event_slug, event_date, event_url, event_topic
    FROM outreach_campaigns
    WHERE id = ${id} AND user_id = ${user.id}
  `
  if (!camp.length) redirect("/dashboard/outreach")

  // Pool stats so we can show current state before Step 1
  const stats = await sql<any[]>`
    SELECT
      count(*)                                   AS pool,
      count(*) FILTER (WHERE selected = true)    AS selected,
      count(*) FILTER (WHERE email_status = 'valid') AS verified,
      count(*) FILTER (WHERE tier = 't1')        AS t1,
      count(*) FILTER (WHERE tier = 't2')        AS t2,
      count(*) FILTER (WHERE tier = 't3')        AS t3
    FROM outreach_campaign_members
    WHERE campaign_id = ${id} AND user_id = ${user.id}
  `

  return (
    <CampaignBuilderWizard
      campaign={{
        id: camp[0].id,
        name: camp[0].name,
        description: camp[0].description,
        eventTopic: camp[0].event_topic,
        eventDate: camp[0].event_date,
        eventUrl: camp[0].event_url,
        ccAddresses: camp[0].cc_addresses || [],
      }}
      initialStats={{
        pool: Number(stats[0]?.pool ?? 0),
        selected: Number(stats[0]?.selected ?? 0),
        verified: Number(stats[0]?.verified ?? 0),
        byTier: {
          t1: Number(stats[0]?.t1 ?? 0),
          t2: Number(stats[0]?.t2 ?? 0),
          t3: Number(stats[0]?.t3 ?? 0),
        },
      }}
    />
  )
}
