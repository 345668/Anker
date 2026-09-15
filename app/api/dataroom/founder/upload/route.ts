import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createDocument } from "@/lib/portfolio/data-room"
import { FOUNDER_SECTION_KEYS } from "@/lib/dataroom/taxonomy"
import { onboardingCompanyId } from "@/lib/org/provision"
import { requireWorkspace, WorkspaceError } from "@/lib/auth/workspace-context"
import { MAX_DECK_BYTES } from "@/lib/matching/deck-upload"

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
  const itemKey = (form.get("itemKey") ? String(form.get("itemKey")) : null) || null
  const title = String(form.get("title") ?? "") || (file instanceof File ? file.name : "Document")
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 })
  if (!FOUNDER_SECTION_KEYS.includes(section)) return NextResponse.json({ error: "invalid section" }, { status: 400 })
  if (!file.size || file.size > MAX_DECK_BYTES) return NextResponse.json({ error: "Choose a non-empty file of 4 MB or less. Compress a larger deck first." }, { status: 413 })
  if (!/^application\/(pdf|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml\.presentation)$/.test(file.type) && !/\.(pdf|pptx?)$/i.test(file.name)) {
    return NextResponse.json({ error: "Upload a PDF or PowerPoint deck" }, { status: 415 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  try {
    let companyId: string
    if (new URL(req.url).searchParams.get("onboarding") === "1") companyId = await onboardingCompanyId(user.id)
    else {
      const scope = await requireWorkspace(true)
      if (scope.persona !== "founder") throw new WorkspaceError("Select a company workspace before uploading a founder document.", 403)
      companyId = scope.orgId
    }
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
      itemKey,
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
    if (e instanceof WorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e?.message ?? "upload failed" }, { status: 500 })
  }
}
