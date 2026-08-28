/**
 * /dashboard/linkedin/unibox — unified LinkedIn inbox (Phase 3).
 * Conversations synced by the extension; reply from here (queues a message
 * action through the same approval gate).
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { listConversations, inboxCounts } from "@/lib/linkedin/inbox"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { UniboxClient } from "@/components/linkedin/unibox-client"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "LinkedIn Unibox — Anker",
  description: "Unified LinkedIn inbox — read and reply across campaigns.",
}

export default async function UniboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const [conversations, counts] = await Promise.all([listConversations(user.id), inboxCounts(user.id)])

  return (
    <PageShell>
      <PageHeader
        accent="#0a66c2"
        eyebrow="LinkedOut"
        title="Unibox"
        description="Every LinkedIn conversation in one place. Sync from the extension's Outreach tab; reply here and it queues through the same approval gate. When someone in a campaign replies, their sequence stops automatically."
      />
      <UniboxClient initial={conversations} counts={counts} />
    </PageShell>
  )
}
