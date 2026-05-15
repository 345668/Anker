import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { ImportPanel } from "@/components/admin/import-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Imports — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · imports"
      title="CSV / XLSX bulk import."
      description="Upload an arbitrary firm or investor CSV/XLSX. Headers are auto-detected (Firm / VC Firm / Company → name; Founders / Investor / Contact → people). Stable-id dedup keeps re-imports idempotent. Always start with a dry run."
      email={email}
    >
      <ImportPanel />
    </AdminShell>
  )
}
