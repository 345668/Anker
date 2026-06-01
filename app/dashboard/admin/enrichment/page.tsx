import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { EnrichmentPanel } from "@/components/admin/enrichment-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Enrichment — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · enrichment"
      title="Crawl, extract, write back."
      description="Pick a thin firm or investor row, crawl their site, AI-extract sectors, stages, check size, portfolio. Routed to the balanced tier (qwen2.5:7b by default). Idempotent — never overwrites filled fields unless you opt in."
      email={email}
    >
      <EnrichmentPanel />
    </AdminShell>
  )
}
