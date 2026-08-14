import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getFounderDocument } from "@/lib/portfolio/data-room"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"

export const runtime = "nodejs"
export const maxDuration = 60

/** GET — serve a founder-room document, only to the owning company. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ docId: string }> }) {
  const { docId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const companyId = await resolveFounderCompanyId(user.id)
  const doc = await getFounderDocument(docId, companyId)
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Private Blob → stream with the store token.
  try {
    const { get } = await import("@vercel/blob")
    const result = await get(doc.file_url, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN } as any)
    if (!result) return NextResponse.json({ error: "File not found" }, { status: 404 })
    return new NextResponse((result as any).stream as any, {
      headers: {
        "Content-Type": doc.content_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${(doc.file_name || doc.title).replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    })
  } catch {
    // Fallback: redirect (covers non-private/legacy URLs).
    return NextResponse.redirect(doc.file_url)
  }
}
