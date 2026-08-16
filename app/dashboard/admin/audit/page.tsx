import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { AuditFeed } from "@/components/admin/audit-feed"
import { listAuditEvents, listAuditActions, getAuditStats } from "@/lib/audit/audit-log"

export const dynamic = "force-dynamic"
export const metadata = { title: "Audit log — Anker admin" }

/** Immutable audit trail — who did what, when. Append-only feed from audit_events. */
export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const [{ events, nextCursor }, actions, stats] = await Promise.all([
    listAuditEvents({ limit: 50 }),
    listAuditActions(),
    getAuditStats(),
  ])

  return (
    <AdminShell
      eyebrow="Admin · audit"
      title="Audit log."
      description="Who did what, when. Immutable trail of admin actions, fund and LP changes, equity events, and legal-doc approvals."
      email={email}
    >
      <AuditFeed initialEvents={events} initialCursor={nextCursor} stats={stats} actions={actions} />
    </AdminShell>
  )
}
