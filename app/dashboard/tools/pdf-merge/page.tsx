import Link from "next/link"
import { PdfMergeTool } from "@/components/tools/doc-tools"

export const metadata = { title: "Merge PDFs — Anker" }

export default function Page() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-6">
      <Link href="/dashboard/tools" className="text-sm text-muted-foreground hover:text-foreground">← Tools</Link>
      <h1 className="font-display mt-3 text-3xl">Merge PDFs</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">Combine several PDFs into one, in the order you choose. Done in your browser; nothing is uploaded.</p>
      <PdfMergeTool />
    </div>
  )
}
