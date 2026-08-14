import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createDocument } from "@/lib/portfolio/data-room"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { FOUNDER_SECTION_KEYS } from "@/lib/dataroom/taxonomy"

export const runtime = "nodejs"
export const maxDuration = 60

/** POST multipart { file, section, title? } — upload a document into the
 *  founder's raise room, scoped to their company/workspace. */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const form = await req.formData()
  const file = form.get("file")
  const section = String(form.get("section") ?? "")
  const title = String(form.get("title") ?? "") || (file instanceof File ? file.name : "Document")
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 })
  if (!FOUNDER_SECTION_KEYS.includes(section)) return NextResponse.json({ error: "invalid section" }, { status: 400 })

  const companyId = await resolveFounderCompanyId(user.id)
  const bytes = Buffer.from(await file.arrayBuffer())

  try {
    const { put } = await import("@vercel/blob")
    const safe = file.name.replace(/[^a-z0-9._-]+/gi, "-")
    const blob = await put(`founder-room/${companyId}/${section}/${safe}`, bytes, {
      access: "private" as any,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: file.type || "application/octet-stream",
      addRandomSuffix: true,
    })
    const doc = await createDocument({
      roomType: "founder",
      companyId,
      section,
      category: "other",
      title,
      fileUrl: blob.url,
      fileName: file.name,
      contentType: file.type || null,
      byteSize: bytes.byteLength,
      uploadedBy: user.id,
    })
    return NextResponse.json({ ok: true, id: doc.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "upload failed" }, { status: 500 })
  }
}
