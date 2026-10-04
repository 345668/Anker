/** PUT /api/portfolio/funds/[id]/intake/slug { slug } — change the public address of the fund's intake form. Old links stop working. */
import { NextRequest, NextResponse } from "next/server"
import { requireFundAccess } from "@/lib/auth/fund-access"
import { cleanSlug } from "@/lib/intake/slug"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireFundAccess((await ctx.params).id)
  if (guard instanceof NextResponse) return guard
  const c = cleanSlug((await req.json().catch(() => ({})))?.slug)
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: 400 })
  const taken = (await sql`SELECT 1 FROM funds WHERE slug = ${c.slug} AND id <> ${guard.fund.id} LIMIT 1`) as any[]
  if (taken.length) return NextResponse.json({ error: "That address is already used. Choose another." }, { status: 409 })
  await sql`UPDATE funds SET slug = ${c.slug}, updated_at = now() WHERE id = ${guard.fund.id}`
  return NextResponse.json({ slug: c.slug })
}
