import { RunwayContent } from "@/components/tesseract/runway-content"
import { requirePersona } from "@/lib/auth/persona-guard"

export const metadata = {
  title: "Runway — Tesseract",
  description: "Plan your burn, model scenarios, and pinpoint when you'll need to raise.",
}

export default async function RunwayPage() {
  await requirePersona(["founder"])
  return <RunwayContent />
}
