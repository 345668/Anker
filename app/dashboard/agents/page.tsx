/** /dashboard/agents — scheduled helpers that propose work for you to approve (docs/architecture/44). */
import { AgentsPanel } from "@/components/agents/agents-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "Agents — Anker" }

export default function AgentsPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl">Agents</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm text-muted-foreground">Agents do routine work on a schedule. They never change your records or contact anyone themselves: anything they want to do appears in Actions for you to approve.</p>
      <AgentsPanel />
    </div>
  )
}
