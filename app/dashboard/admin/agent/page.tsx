import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { AgentPanel } from "@/components/admin/agent-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Outreach agent — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · outreach agent"
      title="Agentic outreach loop."
      description="Run the orchestrator on one CRM entry or kick off a tick. Pipeline: enrich firm → build investor profile → draft 4-step DM sequence → classify pending replies → sync CRM stage. Hard rule — never auto-sends."
      email={email}
    >
      <AgentPanel />
    </AdminShell>
  )
}
