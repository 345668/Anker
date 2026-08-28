/**
 * /dashboard/linkedin/senders — connected LinkedIn accounts + their safety limits.
 *
 * Phase 1 of the LinkedIn outreach engine (docs/scope-linkedin-outreach.md).
 * A sender carries the per-account caps / working hours the engine honours;
 * the extension executes approved actions as the logged-in account.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { listSenders } from "@/lib/linkedin/senders"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { SendersClient } from "@/components/linkedin/senders-client"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "LinkedIn Senders — Anker",
  description: "Connected LinkedIn accounts, daily caps, working hours, warmup.",
}

export default async function LinkedInSendersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const senders = await listSenders(user.id)

  return (
    <PageShell>
      <PageHeader
        accent="#0a66c2"
        eyebrow="LinkedOut"
        title="Senders"
        description="The LinkedIn accounts you send outreach as. Set conservative daily caps and working hours per account — the engine never exceeds them, and every action still passes the approval gate before it sends."
      />
      <SendersClient initial={senders} />
    </PageShell>
  )
}
