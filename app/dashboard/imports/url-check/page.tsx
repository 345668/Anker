import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { UrlCheckPanel } from "@/components/admin/url-check-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "URL check — Anker" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Imports · URL check"
      title="Verify URLs on a list."
      description="Point at a column of URLs on a CSV; get back which ones are live, which redirect, which 404. Also flags Cloudflare + login walls."
      email={email}
    >
      <UrlCheckPanel />
    </AdminShell>
  )
}
