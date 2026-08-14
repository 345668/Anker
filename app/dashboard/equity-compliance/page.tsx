import { requirePersona } from "@/lib/auth/persona-guard"
import { ModuleScaffold } from "@/components/shell/module-scaffold"

export const dynamic = "force-dynamic"
export const metadata = { title: "Equity Compliance — Anker" }

export default async function EquityCompliancePage() {
  await requirePersona(["founder"])
  return (
    <ModuleScaffold
      accent="#e5380f"
      eyebrow="Equity Suite"
      title="Equity Compliance"
      description="Put compliance on auto-pilot with automated statutory registers and direct filings."
      capabilities={[
        { title: "Statutory registers", desc: "Keep your register of members and PSC register accurate automatically." },
        { title: "Direct filings", desc: "File confirmation statements and share allotments straight to the registry." },
        { title: "Deadline tracking", desc: "Never miss a filing — deadlines tracked with reminders." },
        { title: "Board consents", desc: "Generate and store the consents behind every equity event." },
        { title: "Cap-table sync", desc: "Registers stay in lockstep with your live cap table." },
        { title: "Audit trail", desc: "An immutable record of every equity change, ready for diligence." },
      ]}
    />
  )
}
