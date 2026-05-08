import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { UrlCheckPanel } from "@/components/admin/url-check-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "URL check — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · URL check"
      title="Sweep dead links."
      description="Bulk-validate firm websites and investor LinkedIn URLs. Verdicts: live, redirect, redirected-off-domain, dead, blocked, rate-limited, server error, timeout, TLS, DNS, unreachable."
      email={email}
    >
      <UrlCheckPanel />
    </AdminShell>
  )
}
