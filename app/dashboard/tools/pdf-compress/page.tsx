import Link from "next/link"
import { PdfCompressor } from "@/components/tools/pdf-compressor"

export const metadata = { title: "Shrink a PDF — Anker" }

export default function Page() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-6">
      <Link href="/dashboard/tools" className="text-sm text-muted-foreground hover:text-foreground">← Tools</Link>
      <h1 className="font-display mt-3 text-3xl">Shrink a PDF</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">Make a large PDF, such as a pitch deck, small enough to email or upload. Done in your browser; the file is never uploaded.</p>
      <PdfCompressor />
    </div>
  )
}
