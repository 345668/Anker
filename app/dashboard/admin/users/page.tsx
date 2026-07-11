import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"

export const dynamic = "force-dynamic"
export const metadata = { title: "Users & roles — Anker admin" }

/**
 * Users & roles admin page — stub.
 *
 * Placeholder for user management, role assignment, and session inspection.
 * Wired into the sidebar so admins have a canonical destination; the real
 * screen ships in a follow-up task (see #120 area).
 */
export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · users"
      title="Users & roles."
      description="Manage accounts, assign roles, and inspect active sessions. Full UI ships in the next pass."
      email={email}
    >
      <div className="rounded-xl border border-foreground/10 bg-background p-6 text-sm text-muted-foreground">
        <p className="mb-3 font-medium text-foreground">Coming soon</p>
        <p>
          This page will list every account, their role (admin / member / LP / founder),
          the CRM entry they map to, last-active timestamp, and the sessions currently
          open on their behalf. From here you'll invite, demote, revoke sessions, and
          hand off ownership of funds or campaigns.
        </p>
      </div>
    </AdminShell>
  )
}
