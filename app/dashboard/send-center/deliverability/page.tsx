import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { EmailCheckPanel } from "@/components/admin/email-check-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Deliverability — Anker" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Send Center · deliverability"
      title="SPF · DKIM · DMARC."
      description="Verify sending domain reputation before shipping a batch. Includes MX check, SPF alignment, DKIM signature, and DMARC policy."
      email={email}
    >
      <EmailCheckPanel />
    </AdminShell>
  )
}
