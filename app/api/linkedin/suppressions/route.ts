/**
 * /api/linkedin/suppressions — the do-not-contact list (dashboard-facing).
 *   GET    → { ok, suppressions }
 *   POST   → { ok, added }   { urls: string[] }  (or { blob })
 *   DELETE ?id=…            → { ok }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { listSuppressions, addSuppressions, removeSuppression } from "@/lib/linkedin/suppressions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  return NextResponse.json({ ok: true, suppressions: await listSuppressions(auth.id) })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const body = await req.json().catch(() => ({}))
  const raw: string[] = Array.isArray(body.urls)
    ? body.urls
    : typeof body.blob === "string"
      ? body.blob.split(/\r?\n/)
      : []
  const people = raw.map((s) => String(s).trim()).filter((s) => /linkedin\.com\/in\//i.test(s)).map((url) => ({ url, reason: "manual" }))
  const added = await addSuppressions(auth.id, people)
  return NextResponse.json({ ok: true, added })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const id = new URL(req.url).searchParams.get("id") || ""
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 })
  const ok = await removeSuppression(auth.id, id)
  if (!ok) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
