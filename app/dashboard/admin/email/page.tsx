import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { EmailOutboxPanel } from "@/components/admin/email-outbox-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Email outbox — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · Email outbox"
      title="Send · track · follow up."
      description="Drafts queue (Send button → Resend), sent log with open + click counters, needs-follow-up bucket flipped by the agent after 3 days with no reply. Inbox IMAP poll runs from here too — replies land in /dashboard/admin/inbox with classification=NULL so the agent picks them up."
      email={email}
    >
      <EmailOutboxPanel />
    </AdminShell>
  )
}
