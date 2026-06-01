import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { EmailCheckPanel } from "@/components/admin/email-check-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Email check — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · email check"
      title="Verify deliverability."
      description="Bulk-validate every investor email via Hunter.io. Verdicts: valid · accept-all · risky · webmail · disposable · invalid · no-mx · malformed · timeout · unknown · error. Per-row Fix dialog repairs broken addresses with Hunter email-finder, local-AI guess, or manual paste — and writes back to investors.email after a fresh probe."
      email={email}
    >
      <EmailCheckPanel />
    </AdminShell>
  )
}
