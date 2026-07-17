import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { EnrichmentPanel } from "@/components/admin/enrichment-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Enrichment — Anker" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Imports · enrichment"
      title="Enrich firms + people."
      description="Backfill missing fields on an imported list — firm URL, sector, geography, contact emails. Uses configured LLM provider."
      email={email}
    >
      <EnrichmentPanel />
    </AdminShell>
  )
}
