import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { CrawlPanel } from "@/components/admin/crawl-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Web crawler — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · web crawler"
      title="Inspect a page."
      description="One-off page crawl: clean text, metadata, all links classified by purpose (about, team, portfolio, blog, social, external). Toggle multi-page to follow internal links."
      email={email}
    >
      <CrawlPanel />
    </AdminShell>
  )
}
