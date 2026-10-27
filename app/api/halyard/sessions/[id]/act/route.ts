import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure, inWorkspaceAi } from "@/lib/halyard/route"
import { act, foldIfDue, type Action } from "@/lib/halyard/brain"

export const runtime = "nodejs"
export const maxDuration = 60
/**
 * { action: "say" | "assist" | "followup" | "recap" | "ask", question? } — answers as a server-sent-event stream: `suggestion` (the text and timings), then `done`.
 * The model answer arrives whole in H2 and is sent as one event; token streaming is H3's concern (the client contract does not change). A brief fold runs after the answer.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let c
  try { c = await sessionContext((await params).id) } catch (e) { return halyardFailure(e) }
  const b = await req.json().catch(() => ({}))
  const enc = new TextEncoder(), send = (ctl: ReadableStreamDefaultController, event: string, data: unknown) => ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
  // Check up front so a refusal is a normal HTTP error the client can show, not a stream that fails.
  let result
  try { result = await inWorkspaceAi(c, req.signal, () => act(c.session, b?.action as Action, { question: b?.question })) } catch (e) { return halyardFailure(e) }
  const stream = new ReadableStream({
    async start(ctl) {
      send(ctl, "suggestion", result)
      send(ctl, "done", { ok: true })
      ctl.close()
      void inWorkspaceAi(c, undefined, () => foldIfDue(c.session)).catch((e) => console.error("[halyard] fold", (e as Error)?.message))
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" } })
}
