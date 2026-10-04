import Link from "next/link"
import { OfficeToPdfTool } from "@/components/tools/doc-tools"

export const metadata = { title: "PowerPoint to PDF — Anker" }

export default function Page() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-6">
      <Link href="/dashboard/tools" className="text-sm text-muted-foreground hover:text-foreground">← Tools</Link>
      <h1 className="font-display mt-3 text-3xl">PowerPoint to PDF</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">Turn a presentation into a PDF, one page per slide: .pptx, .ppt or .odp. Uses Anker's converter.</p>
      <OfficeToPdfTool direction="powerpoint-to-pdf" />
    </div>
  )
}
