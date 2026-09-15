import { TermSheetContent } from "@/components/tesseract/term-sheet-content"
import { requirePersona } from "@/lib/auth/persona-guard"

export const metadata = {
  title: "Term Sheet — Tesseract",
  description: "Analyze a term sheet, surface red flags, and benchmark against market.",
}

export default async function TermSheetPage() {
  await requirePersona(["founder"])
  return <TermSheetContent />
}
