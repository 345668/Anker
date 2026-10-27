import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure, inWorkspaceAi } from "@/lib/halyard/route"
import { ingestUtterance, MAX_UTTERANCE_BYTES } from "@/lib/halyard/utterance"
import { HalyardError } from "@/lib/halyard/sessions"

export const runtime = "nodejs"
export const maxDuration = 60
/** Multipart: audio (a file), seq, channel, startedMs, endedMs. Transcribes, stores the segment, returns the text. Idempotent on seq. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await sessionContext((await params).id)
    if (Number(req.headers.get("content-length") ?? 0) > MAX_UTTERANCE_BYTES + 4096) throw new HalyardError("That audio chunk is too large.", 413, "too_large")
    const f = await req.formData(), audio = f.get("audio")
    if (!(audio instanceof Blob)) throw new HalyardError("Send the audio as a file called audio.", 400, "bad_audio")
    const channel = String(f.get("channel") ?? "room")
    if (!["you", "them", "room"].includes(channel)) throw new HalyardError("Unknown channel.", 400, "bad_channel")
    const r = await inWorkspaceAi(c, req.signal, async () => ingestUtterance(c.session, {
      seq: Number(f.get("seq")), channel: channel as any, startedMs: Number(f.get("startedMs") ?? 0), endedMs: Number(f.get("endedMs") ?? 0),
      bytes: Buffer.from(await audio.arrayBuffer()), mime: audio.type || "audio/wav",
    }))
    return NextResponse.json(r)
  } catch (e) { return halyardFailure(e) }
}
