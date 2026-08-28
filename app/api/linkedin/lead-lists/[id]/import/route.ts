/**
 * POST /api/linkedin/lead-lists/[id]/import — import from captured connections.
 * Body: { degree?: 1|2|3, companyLike?: string, limit?: number }
 * → { ok, added }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { importFromConnections } from "@/lib/linkedin/lead-lists"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  try {
    const added = await importFromConnections(auth.id, id, {
      degree: body.degree ? Number(body.degree) : undefined,
      companyLike: typeof body.companyLike === "string" ? body.companyLike.trim() : undefined,
      limit: body.limit ? Number(body.limit) : undefined,
    })
    return NextResponse.json({ ok: true, added })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Import failed" }, { status: 400 })
  }
}
