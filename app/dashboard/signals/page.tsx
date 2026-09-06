import { MarketSignals } from "@/components/signals/market-signals"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Market Signals — Anker",
  description: "A live feed of investors actively deploying in your space.",
}

export default function SignalsPage() {
  return <MarketSignals />
}
