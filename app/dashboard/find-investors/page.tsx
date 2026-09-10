import { isAiAvailable } from "@/lib/matching/v2/ai-enrichment"
import { FindInvestorsContent } from "@/components/tesseract/find-investors-content"
import { requirePersona } from "@/lib/auth/persona-guard"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Find Investors — Anker",
  description: "Upload your pitch deck, review the extracted round profile, then match against relevant investors.",
}

export default async function FindInvestorsPage() {
  await requirePersona(["founder"])
  return <FindInvestorsContent aiAvailable={await isAiAvailable()} />
}
