import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { DeepResearchPanel } from "@/components/admin/deep-research-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Deep research — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · deep research"
      title="Crawl, synthesize, dossier."
      description="Multi-page crawl of a firm site + local-AI synthesis into a Markdown dossier. Routed to the deep tier (qwen2.5:14b by default) with citations to each source page. Word-doc download."
      email={email}
    >
      <DeepResearchPanel />
    </AdminShell>
  )
}
