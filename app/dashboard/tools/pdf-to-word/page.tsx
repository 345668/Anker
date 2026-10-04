import Link from "next/link"
import { PdfToWordTool } from "@/components/tools/doc-tools"

export const metadata = { title: "PDF to Word — Anker" }

export default function Page() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-6">
      <Link href="/dashboard/tools" className="text-sm text-muted-foreground hover:text-foreground">← Tools</Link>
      <h1 className="font-display mt-3 text-3xl">PDF to Word</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">Recover the text of a PDF as an editable .docx, with headings and lists. Choose exact layout (our converter) or a private conversion in your browser.</p>
      <PdfToWordTool />
    </div>
  )
}
