import { requirePersona } from "@/lib/auth/persona-guard"
import { ModuleScaffold } from "@/components/shell/module-scaffold"

export const dynamic = "force-dynamic"
export const metadata = { title: "Contracts — Anker" }

export default async function ContractsPage() {
  await requirePersona(["vc"])
  return (
    <ModuleScaffold
      eyebrow="Fund services"
      title="Contracts"
      description="AI-native contract execution, anchored to your firm's precedent — from routine NDAs to complex agreements."
      capabilities={[
        { title: "Clause-level search", desc: "Find any clause across every agreement in seconds." },
        { title: "AI redlines", desc: "Draft and redline against your playbook, then verify with a lawyer." },
        { title: "Playbook enforcement", desc: "Codify your firm's standard positions and flag every deviation." },
        { title: "Signature & tracking", desc: "Route for signature and track counterparty status end to end." },
        { title: "Templates", desc: "A library of vetted templates for the agreements you sign most." },
        { title: "Audit trail", desc: "A complete, defensible record of every contract and its versions." },
      ]}
    />
  )
}
