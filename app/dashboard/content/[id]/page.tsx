import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { NewsroomEditor } from "@/components/admin/newsroom-editor"

export const dynamic = "force-dynamic"
export const metadata = { title: "Edit article — Anker" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  const { id } = await params
  return (
    <AdminShell
      eyebrow="Content · edit"
      title="Edit article."
      description="Edit content, change status (draft / published / archived), or delete. Local AI drafts replace the body."
      email={email}
    >
      <NewsroomEditor articleId={id} />
    </AdminShell>
  )
}
