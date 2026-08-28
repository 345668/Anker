/**
 * /dashboard/linkedin/review — the approval Review Queue (§4a).
 *
 * Every outbound LinkedIn action lands here as 'pending_approval'. A human
 * approves (optionally editing the message) or rejects. Only approved actions
 * become 'queued' — the single state the extension can claim — so nothing
 * reaches LinkedIn without passing through this page.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { listActions, actionCounts } from "@/lib/linkedin/action-queue"
import { listSenders } from "@/lib/linkedin/senders"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { ReviewQueueClient } from "@/components/linkedin/review-queue-client"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "LinkedIn Review Queue — Anker",
  description: "Approve or reject queued LinkedIn outreach actions before they send.",
}

export default async function LinkedInReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const [pending, recent, counts, senders] = await Promise.all([
    listActions(user.id, { status: "pending_approval" }),
    listActions(user.id, { status: ["queued", "claimed", "done", "failed", "rejected"], limit: 50 }),
    actionCounts(user.id),
    listSenders(user.id),
  ])

  return (
    <PageShell>
      <PageHeader
        accent="#0a66c2"
        eyebrow="LinkedOut"
        title="Review Queue"
        description="Approve outbound actions before they send. Approved actions become claimable by the extension; nothing reaches LinkedIn without your sign-off."
      />
      <ReviewQueueClient
        initialPending={pending}
        initialRecent={recent}
        counts={counts}
        senders={senders.map((s) => ({ id: s.id, displayName: s.displayName }))}
      />
    </PageShell>
  )
}
