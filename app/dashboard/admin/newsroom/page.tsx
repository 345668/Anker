import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { NewsroomList } from "@/components/admin/newsroom-list"

export const dynamic = "force-dynamic"
export const metadata = { title: "Newsroom — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · newsroom"
      title="Articles, drafts, archive."
      description="CMS for the public newsroom at /newsroom.  Create drafts, AI-assist a first version, publish when ready, archive when stale."
      email={email}
    >
      <NewsroomList />
    </AdminShell>
  )
}
