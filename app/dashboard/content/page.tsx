import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { NewsroomList } from "@/components/admin/newsroom-list"

/**
 * /dashboard/content — Content publishing surface (Jul 11 IA overhaul).
 *
 * Formerly at /dashboard/admin/newsroom. Same underlying editor + list, now
 * lives as a first-class page under Fund & studio in the sidebar. Publish
 * remains role-gated (isAdminUser), so this only renders for admins; the
 * sidebar entry is also admin-scoped.
 */
export const dynamic = "force-dynamic"
export const metadata = { title: "Content — Anker" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Content"
      title="Articles, drafts, archive."
      description="Publishing surface for the public newsroom at /newsroom. Create drafts, AI-assist a first version, publish when ready, archive when stale."
      email={email}
    >
      <NewsroomList />
    </AdminShell>
  )
}
