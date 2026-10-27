import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure } from "@/lib/halyard/route"
import { addSegment } from "@/lib/halyard/sessions"

export const runtime = "nodejs"
/** { segments: [{ seq, channel, text, startedMs, endedMs, confidence, audioSeconds }] } — text already transcribed (desktop local, WebAssembly). Idempotent on seq. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await sessionContext((await params).id), b = await req.json()
    const list = Array.isArray(b?.segments) ? b.segments.slice(0, 50) : []
    const out = []
    for (const g of list) out.push({ seq: g?.seq, ...(await addSegment(session, { seq: Number(g?.seq), channel: g?.channel, text: String(g?.text ?? ""), startedMs: g?.startedMs, endedMs: g?.endedMs, confidence: g?.confidence, audioSeconds: g?.audioSeconds })) })
    return NextResponse.json({ results: out })
  } catch (e) { return halyardFailure(e) }
}
