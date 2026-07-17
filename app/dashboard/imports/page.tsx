import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { ImportPanel } from "@/components/admin/import-panel"

/**
 * /dashboard/imports — Self-serve imports (Jul 11 IA overhaul).
 *
 * Formerly at /dashboard/admin/imports. Same underlying upload flow; now
 * lives under Source & match as a first-class page. Enrichment / crawl /
 * url-check are child routes.
 */
export const dynamic = "force-dynamic"
export const metadata = { title: "Imports — Anker" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Imports"
      title="CSV / XLSX bulk import."
      description="Upload arbitrary firm or investor CSV/XLSX. Headers auto-detected. Stable-id dedup keeps re-imports idempotent. Always start with a dry run."
      email={email}
    >
      <ImportPanel />
    </AdminShell>
  )
}
