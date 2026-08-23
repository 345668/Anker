import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { UsersClient } from "@/components/admin/users-client"
import { listPlatformUsers } from "@/lib/admin/users"

export const dynamic = "force-dynamic"
export const metadata = { title: "Users & roles — Anker admin" }

/**
 * Users & roles — the platform roster merged across Supabase Auth, the app `users`
 * table (admin/owner flags), and `memberships` (org role + persona). Owner/admin can
 * grant or revoke platform admin here; owner status and self-demotion are guarded, and
 * every change is written to the audit log.
 */
export default async function Page() {
  const { isAdmin, userId, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const { users, authSource, note } = await listPlatformUsers()

  return (
    <AdminShell
      eyebrow="Admin · users"
      title="Users & roles."
      description="Every account, their platform role and org memberships, and when they were last active. Grant or revoke admin — owner accounts and your own access are protected."
      email={email}
    >
      <UsersClient initialUsers={users} currentUserId={userId} authSource={authSource} note={note} />
    </AdminShell>
  )
}
