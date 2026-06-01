import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { SystemPanel } from "@/components/admin/system-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "System health — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · system"
      title="System health."
      description="Database + Ollama + Twenty + SearXNG + Marker reachability, table counts, pgvector status, and the live AI-router task → model map. Auto-refreshes every 15s when enabled."
      email={email}
    >
      <SystemPanel />
    </AdminShell>
  )
}
