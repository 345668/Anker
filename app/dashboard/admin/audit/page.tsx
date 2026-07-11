import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"

export const dynamic = "force-dynamic"
export const metadata = { title: "Audit log — Anker admin" }

/**
 * Audit log admin page — stub.
 *
 * Placeholder for the immutable audit trail of who did what, when. Wired
 * into the sidebar so admins have a canonical destination; the real screen
 * ships once we finalize the audit_events table shape.
 */
export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · audit"
      title="Audit log."
      description="Who did what, when. Immutable trail of admin actions, LP touches, legal-doc approvals, and deck exports."
      email={email}
    >
      <div className="rounded-xl border border-foreground/10 bg-background p-6 text-sm text-muted-foreground">
        <p className="mb-3 font-medium text-foreground">Coming soon</p>
        <p>
          This page will render a paginated feed from the <code>audit_events</code> table:
          actor, action, target, old/new value, IP, user-agent. Filter by actor, entity,
          or event-type. Nothing here is deletable.
        </p>
      </div>
    </AdminShell>
  )
}
