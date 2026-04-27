import { TemplatesContent } from "@/components/tesseract/templates-content"
import { TEMPLATES } from "@/lib/templates/manifest"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Financial Models — Anker",
  description: "Cap tables, VC fund models, SaaS forecasts, runway tools, and DD checklists.",
}

export default function TemplatesPage() {
  return <TemplatesContent templates={TEMPLATES} />
}
