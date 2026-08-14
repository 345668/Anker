import { requirePersona } from "@/lib/auth/persona-guard"
import { ModuleScaffold } from "@/components/shell/module-scaffold"

export const dynamic = "force-dynamic"
export const metadata = { title: "Compensation — Anker" }

export default async function CompensationPage() {
  await requirePersona(["founder"])
  return (
    <ModuleScaffold
      accent="#e5380f"
      eyebrow="Equity Suite"
      title="Compensation"
      description="Get reliable salary and equity benchmarks for every role, level, and region — and build offers with confidence."
      capabilities={[
        { title: "Salary benchmarks", desc: "Market cash data by role, level, and geography, refreshed continuously." },
        { title: "Equity benchmarks", desc: "Option-grant ranges tied to stage and role, in line with the market." },
        { title: "Band builder", desc: "Define your own compensation bands and keep offers inside them." },
        { title: "Offer modeling", desc: "Model total comp — base, equity, and signing — before you extend it." },
        { title: "Level framework", desc: "Map roles to a leveling framework so pay stays consistent as you grow." },
        { title: "Equity-suite sync", desc: "Grant offers flow straight into Share Plans and the cap table." },
      ]}
    />
  )
}
