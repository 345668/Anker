/**
 * /dashboard/linkedin/leads — lead lists (Phase 4).
 * Reusable audiences built from CSV/paste or your captured connections, then
 * dropped into campaigns.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { listLeadLists } from "@/lib/linkedin/lead-lists"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { LeadListsClient } from "@/components/linkedin/lead-lists-client"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "LinkedIn Leads — Anker",
  description: "Reusable LinkedIn audiences for your campaigns.",
}

export default async function LeadListsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const lists = await listLeadLists(user.id)

  return (
    <PageShell>
      <PageHeader
        accent="#0a66c2"
        eyebrow="LinkedIn Outreach"
        title="Leads"
        description="Build a reusable audience once — paste a CSV, or import from the connections and search results the extension captures — then drop the whole list into any campaign."
      />
      <LeadListsClient initial={lists} />
    </PageShell>
  )
}
