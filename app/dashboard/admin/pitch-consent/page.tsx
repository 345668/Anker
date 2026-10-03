import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { PitchConsentPanel } from "@/components/admin/pitch-consent-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Held pitch emails — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell eyebrow="Admin · outreach" title="Held pitch emails." description="Founder-campaign emails to recipients in Germany and other EU/EEA countries wait here until consent is recorded." email={email}>
      <PitchConsentPanel />
    </AdminShell>
  )
}
