import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { AiConfigPanel } from "@/components/admin/ai-config-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "AI config — Anker admin" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · AI config"
      title="Models, tasks, on/off."
      description="Force a provider (anthropic / ollama / none), override the model per task, or flip a task off so callers fall back to the deterministic heuristic. Reconnect re-probes the daemon — use it after starting Ollama or rotating an API key. Settings persist in system_settings."
      email={email}
    >
      <AiConfigPanel />
    </AdminShell>
  )
}
