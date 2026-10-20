import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { acceptNda } from "@/lib/investor/materials"

export const runtime = "nodejs"
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await investorContext()
    return NextResponse.json({ ok: true, nda: await acceptNda(c.userId, (await params).id, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, req.headers.get("user-agent")) })
  } catch (e) { return investorFailure(e) }
}
