import { isAiAvailable } from "@/lib/matching/v2/ai-enrichment"
import { FindInvestorsContent } from "@/components/tesseract/find-investors-content"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Find Investors — Anker",
  description: "Upload your pitch deck, review the extracted round profile, then match against relevant investors.",
}

export default async function FindInvestorsPage() {
  return <FindInvestorsContent aiAvailable={await isAiAvailable()} />
}
