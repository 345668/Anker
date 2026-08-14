import { requirePersona } from "@/lib/auth/persona-guard"
import { ModuleScaffold } from "@/components/shell/module-scaffold"

export const dynamic = "force-dynamic"
export const metadata = { title: "SPVs — Anker" }

export default async function SpvsPage() {
  await requirePersona(["vc"])
  return (
    <ModuleScaffold
      eyebrow="Fund back-office"
      title="SPVs"
      description="Form, close, and administer special-purpose vehicles on a platform built for professional investors."
      capabilities={[
        { title: "Form an SPV", desc: "Spin up a deal vehicle with entity docs, terms, and a subscription flow in minutes." },
        { title: "Close & onboard", desc: "Collect commitments, run KYC/AML, and countersign — all in one room." },
        { title: "Cap table & waterfall", desc: "Track ownership and model the distribution waterfall per deal." },
        { title: "Capital & distributions", desc: "Call capital and pay out with the same wizards as the main fund." },
        { title: "Investor portal", desc: "Each SPV LP gets a scoped view of their capital account and documents." },
        { title: "Tax & compliance", desc: "K-1s, filings, and an audit trail generated from the SPV's records." },
      ]}
    />
  )
}
