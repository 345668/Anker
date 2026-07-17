import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { EmailOutboxPanel } from "@/components/admin/email-outbox-panel"

/**
 * /dashboard/send-center — Shared send + reply queue (Jul 11 IA overhaul).
 *
 * Formerly at /dashboard/admin/email. Renamed to Send Center now that outbox +
 * inbox + deliverability all live under one Relationships sidebar entry. The
 * three tabs (queue / sent / replies) are child routes:
 *   /dashboard/send-center           — this file, outbox
 *   /dashboard/send-center/replies   — inbound triage
 *   /dashboard/send-center/deliverability — SPF/DKIM/DMARC checker
 */
export const dynamic = "force-dynamic"
export const metadata = { title: "Send Center — Anker" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Send Center · outbox"
      title="Send · track · follow up."
      description="Drafts queue (Send button → Resend), sent log with open + click counters, needs-follow-up bucket flipped by the agent after 3 days with no reply."
      email={email}
    >
      <EmailOutboxPanel />
    </AdminShell>
  )
}
