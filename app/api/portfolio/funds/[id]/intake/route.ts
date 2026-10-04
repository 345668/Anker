/**
 * GET /api/portfolio/funds/[id]/intake   the fund's intake config, recent submissions and its public link
 * PUT /api/portfolio/funds/[id]/intake   save the config (validated; the version goes up by one)
 * Fund workspace owners and admins only (requireFundAccess). docs/architecture/39.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireFundAccess } from "@/lib/auth/fund-access"
import { getConfig, saveConfig, listSubmissions } from "@/lib/intake/store"
import { PRESETS } from "@/lib/intake/model"
import { ZodError } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://www.an-ker.de").replace(/\/$/, "")

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireFundAccess((await ctx.params).id)
  if (guard instanceof NextResponse) return guard
  const [stored, submissions] = await Promise.all([getConfig(guard.fund.id), listSubmissions(guard.fund.id)])
  const link = `${appUrl()}/intake/${guard.fund.slug}`
  return NextResponse.json({
    config: stored.config, version: stored.version, exists: stored.exists, submissions, presets: PRESETS, link,
    embed: `<iframe src="${link}" style="width:100%;min-height:900px;border:0" title="Pitch ${guard.fund.name}"></iframe>`,
  })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireFundAccess((await ctx.params).id)
  if (guard instanceof NextResponse) return guard
  try {
    const saved = await saveConfig(guard.fund.id, await req.json(), guard.id)
    return NextResponse.json({ config: saved.config, version: saved.version })
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => i.message).join("; ") }, { status: 400 })
    return NextResponse.json({ error: "Could not save" }, { status: 500 })
  }
}
