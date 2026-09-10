import { CapTableContent } from "@/components/tesseract/cap-table-content"
import { requirePersona } from "@/lib/auth/persona-guard"

export const metadata = {
  title: "Cap Table — Tesseract",
  description: "Model dilution across rounds with founder, ESOP, and investor scenarios.",
}

export default async function CapTablePage() {
  await requirePersona(["founder"])
  return <CapTableContent />
}
