import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { NewsroomEditor } from "@/components/admin/newsroom-editor"

export const dynamic = "force-dynamic"
export const metadata = { title: "New article — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · newsroom"
      title="New article."
      description="Draft a new newsroom article. Save as draft, AI-draft a first version, or publish straight to /newsroom."
      email={email}
    >
      <NewsroomEditor />
    </AdminShell>
  )
}
