import Link from "next/link"
import { WordToPdfTool } from "@/components/tools/doc-tools"

export const metadata = { title: "Word to PDF — Anker" }

export default function Page() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-6">
      <Link href="/dashboard/tools" className="text-sm text-muted-foreground hover:text-foreground">← Tools</Link>
      <h1 className="font-display mt-3 text-3xl">Word to PDF</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">Turn a .docx into a PDF: headings, paragraphs, lists, simple tables and pictures. Done in your browser; nothing is uploaded.</p>
      <WordToPdfTool />
    </div>
  )
}
