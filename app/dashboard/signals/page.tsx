import { MarketSignals } from "@/components/signals/market-signals"
import { requirePersona } from "@/lib/auth/persona-guard"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Market Signals — Anker",
  description: "A live feed of investors actively deploying in your space.",
}

export default async function SignalsPage() {
  await requirePersona(["founder"])
  return <MarketSignals />
}
