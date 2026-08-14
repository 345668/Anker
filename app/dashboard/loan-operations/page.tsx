import { requirePersona } from "@/lib/auth/persona-guard"
import { ModuleScaffold } from "@/components/shell/module-scaffold"

export const dynamic = "force-dynamic"
export const metadata = { title: "Loan Operations — Anker" }

export default async function LoanOperationsPage() {
  await requirePersona(["vc"])
  return (
    <ModuleScaffold
      eyebrow="Fund services"
      title="Loan Operations"
      description="Automate every step and workflow with a connected loan solution — built for private-credit strategies."
      capabilities={[
        { title: "Origination", desc: "Structure and book loans with terms, tranches, and drawdown schedules." },
        { title: "Servicing & payments", desc: "Track principal and interest, process payments, and reconcile automatically." },
        { title: "Interest & amortization", desc: "Accrue interest and run amortization schedules with zero spreadsheets." },
        { title: "Covenant tracking", desc: "Monitor financial covenants and get alerted before a breach." },
        { title: "Borrower portal", desc: "Give borrowers a clean view of their balance, schedule, and documents." },
        { title: "Reporting", desc: "Portfolio-level exposure, yield, and cashflow reporting for LPs." },
      ]}
    />
  )
}
