import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { MatchingQuality } from "@/components/admin/matching-quality"

export const dynamic = "force-dynamic"
export const metadata = { title: "Matching quality — Anker admin" }

/** The extra LP scoring factors: measured against the owner's own labelled LPs, promoted only on the evidence (docs/architecture/63 M6). */
export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell eyebrow="Admin · matching" title="Matching quality." description="Extra LP scoring factors are measured against LPs you have labelled before they are allowed to change a ranking. Nothing here changes anything until you promote a factor." email={email}>
      <MatchingQuality />
    </AdminShell>
  )
}
