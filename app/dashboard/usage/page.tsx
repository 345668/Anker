/** /dashboard/usage — this month's AI allowance and where it went (docs/architecture/58). */
import { UsageCard } from "@/components/usage/usage-card"

export const dynamic = "force-dynamic"
export const metadata = { title: "Usage — Anker" }

export default function UsagePage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl">Usage</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm text-muted-foreground">What this workspace has used of its monthly AI allowance, and what it was used for.</p>
      <UsageCard />
    </div>
  )
}
