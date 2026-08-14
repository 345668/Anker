import { requirePersona } from "@/lib/auth/persona-guard"
import { ModuleScaffold } from "@/components/shell/module-scaffold"

export const dynamic = "force-dynamic"
export const metadata = { title: "Share Plans — Anker" }

export default async function SharePlansPage() {
  await requirePersona(["founder"])
  return (
    <ModuleScaffold
      accent="#e5380f"
      eyebrow="Equity Suite"
      title="Share Plans"
      description="Set up your share plan, grant options online, and track scheme usage — all synced to your cap table."
      capabilities={[
        { title: "Option pool", desc: "Create and size your ESOP; see it reflected in dilution instantly." },
        { title: "Grants & vesting", desc: "Issue option grants online with custom vesting schedules and cliffs." },
        { title: "Exercise & settlement", desc: "Employees exercise online; the cap table updates automatically." },
        { title: "EMI / CSOP", desc: "Tax-advantaged UK schemes with the right paperwork built in." },
        { title: "Employee dashboard", desc: "Give your team a clear view of what they hold and what it's worth." },
        { title: "Scheme reporting", desc: "Board-ready and filing-ready reports on scheme usage." },
      ]}
    />
  )
}
