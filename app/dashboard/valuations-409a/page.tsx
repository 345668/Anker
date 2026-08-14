import { requirePersona } from "@/lib/auth/persona-guard"
import { ModuleScaffold } from "@/components/shell/module-scaffold"

export const dynamic = "force-dynamic"
export const metadata = { title: "409A Valuations — Anker" }

export default async function Valuations409aPage() {
  await requirePersona(["founder"])
  return (
    <ModuleScaffold
      accent="#e5380f"
      eyebrow="Equity Suite"
      title="Valuations (409A)"
      description="Enter audits with confidence with tailored, cost-effective 409A, EMI, and CSOP valuations."
      capabilities={[
        { title: "Request a valuation", desc: "Kick off a 409A or EMI/CSOP valuation from your live cap table." },
        { title: "Audit-ready reports", desc: "Defensible, methodology-backed reports your auditors will accept." },
        { title: "Refresh triggers", desc: "Get prompted to re-value after a raise, tender, or material event." },
        { title: "Board approval", desc: "Route the valuation for board sign-off and record the consent." },
        { title: "History", desc: "Every prior valuation, versioned, with the assumptions behind it." },
        { title: "Strike-price setting", desc: "Set option strike prices straight from the approved fair market value." },
      ]}
    />
  )
}
