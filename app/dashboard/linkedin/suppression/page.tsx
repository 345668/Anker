/**
 * /dashboard/linkedin/suppression — the do-not-contact list.
 * People here are never enqueued; replies that read as opt-outs auto-add here.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { listSuppressions } from "@/lib/linkedin/suppressions"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { SuppressionClient } from "@/components/linkedin/suppression-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "LinkedOut Suppression — Anker", description: "Do-not-contact list." }

export default async function SuppressionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const suppressions = await listSuppressions(user.id)

  return (
    <PageShell>
      <PageHeader
        accent="#0a66c2"
        eyebrow="LinkedOut"
        title="Do-not-contact"
        description="People on this list are never enqueued by any campaign. Replies that read as an opt-out (‘stop’, ‘unsubscribe’, ‘not interested’) are added here automatically."
      />
      <SuppressionClient initial={suppressions} />
    </PageShell>
  )
}
