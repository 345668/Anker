import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { InboxPanel } from "@/components/admin/inbox-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Reply inbox — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · Reply inbox"
      title="Triage inbound replies."
      description="Three buckets: pending (raw text, no classification yet), classified (draft ready for review), actioned (approved / sent). Classify with local AI, edit the draft, copy it to wherever you send from, then Approve + sent — that advances the CRM stage forward-only. Founder context persists locally."
      email={email}
    >
      <InboxPanel />
    </AdminShell>
  )
}
