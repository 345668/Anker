import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { readThread, sendMessage } from "@/lib/investor/talks"
import { readMessage } from "@/lib/investor/read-message"

export const runtime = "nodejs"
type Ctx = { params: Promise<{ id: string }> }
export async function GET(_r: NextRequest, { params }: Ctx) {
  try { const c = await investorContext(); return NextResponse.json(await readThread("investor", { userId: c.userId }, (await params).id)) } catch (e) { return investorFailure(e) }
}
/** JSON { body } or multipart: body, file (up to 3 PDF, JPEG or PNG files, 4 MB each). */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const c = await investorContext(), { body, files } = await readMessage(req)
    return NextResponse.json({ ok: true, message: await sendMessage("investor", { userId: c.userId, senderId: c.userId }, (await params).id, body, undefined, files) }, { status: 201 })
  } catch (e) { return investorFailure(e) }
}
