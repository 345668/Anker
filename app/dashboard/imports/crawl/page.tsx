import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { CrawlPanel } from "@/components/admin/crawl-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Web crawler — Anker" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Imports · crawl"
      title="Web crawler."
      description="Crawl a URL or a whole domain into structured firm intel. Respects robots.txt + rate-limits."
      email={email}
    >
      <CrawlPanel />
    </AdminShell>
  )
}
