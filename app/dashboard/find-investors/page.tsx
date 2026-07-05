import { isAiAvailable } from "@/lib/matching/v2/ai-enrichment"
import { FindInvestorsContent } from "@/components/tesseract/find-investors-content"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Find Investors — Anker",
  description: "Upload your pitch deck, AI fills the round profile, then match against 20K+ investors.",
}

export default async function FindInvestorsPage() {
  return <FindInvestorsContent aiAvailable={await isAiAvailable()} />
}
