import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  mintSpvPortalToken, listSpvPortalTokens, revokeSpvPortalToken, userOwnsSpv,
} from "@/lib/modules/spv-portal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function baseUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL
    || req.headers.get("origin")
    || `https://${req.headers.get("host") ?? "www.an-ker.de"}`
}

async function guard(spvId: string): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await userOwnsSpv(user.id, spvId))) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return { userId: user.id }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; subId: string }> }) {
  const { id, subId } = await params
  const g = await guard(id)
  if (g instanceof NextResponse) return g
  return NextResponse.json({ tokens: await listSpvPortalTokens(subId) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; subId: string }> }) {
  const { id, subId } = await params
  const g = await guard(id)
  if (g instanceof NextResponse) return g

  let body: any = {}
  try { body = await req.json() } catch { /* optional */ }
  const days = Number(body?.days)
  const minted = await mintSpvPortalToken(subId, id, {
    days: Number.isFinite(days) && days > 0 ? Math.min(days, 3650) : undefined,
    label: typeof body?.label === "string" ? body.label.slice(0, 80) : undefined,
    createdBy: g.userId,
  })
  const link = `${baseUrl(req).replace(/\/$/, "")}/spv-portal/${minted.token}`
  return NextResponse.json({ link, prefix: minted.prefix, expiresAt: minted.expiresAt })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; subId: string }> }) {
  const { id } = await params
  const g = await guard(id)
  if (g instanceof NextResponse) return g
  const tokenId = new URL(req.url).searchParams.get("tokenId")
  if (!tokenId) return NextResponse.json({ error: "tokenId required" }, { status: 400 })
  await revokeSpvPortalToken(tokenId, id)
  return NextResponse.json({ ok: true })
}
