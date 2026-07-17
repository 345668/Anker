import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { InboxPanel } from "@/components/admin/inbox-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Send Center · replies — Anker" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Send Center · replies"
      title="Triage inbound replies."
      description="Three buckets: pending, classified, actioned. Classify with local AI, edit draft, approve + sent — that advances the CRM stage forward-only."
      email={email}
    >
      <InboxPanel />
    </AdminShell>
  )
}
