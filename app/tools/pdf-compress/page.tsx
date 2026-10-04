import { PdfCompressor } from "@/components/tools/pdf-compressor"

export const metadata = { title: "Shrink a PDF — Anker", description: "Make a large pitch deck small enough to send, right in your browser." }

export default function Page() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Shrink a PDF</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">Make a heavy pitch deck small enough to send. Anker also does this for you automatically when you upload a deck that is too large.</p>
      <PdfCompressor />
    </main>
  )
}
