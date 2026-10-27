import { NextRequest } from "next/server"
import { viewContext, halyardFailure } from "@/lib/halyard/route"
import { follow } from "@/lib/halyard/follow"
import { viewableSession } from "@/lib/halyard/sharing"

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"
/** Server-sent events: the live turns, notes and state of a session, for its owner and for colleagues it is shared with. Reconnects by `Last-Event-ID`. Never the owner's suggestions or email draft. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let c
  try { c = await viewContext((await params).id) } catch (e) { return halyardFailure(e) }
  const q = Number(req.nextUrl.searchParams.get("after")), h = Number(req.headers.get("last-event-id"))
  const afterSeq = Number.isFinite(h) && req.headers.get("last-event-id") ? h : Number.isFinite(q) && req.nextUrl.searchParams.has("after") ? q : -1
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(ctl) {
      ctl.enqueue(enc.encode("retry: 1500\n\n"))
      try {
        for await (const ev of follow(c.session.id, { afterSeq, signal: req.signal, allowed: async () => viewableSession(c.session.id, c.orgId, c.userId).then(() => true, () => false) }))
          ctl.enqueue(enc.encode(`${ev.id ? `id: ${ev.id}\n` : ""}event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`))
      } catch (e) { console.error("[halyard] follow", (e as Error)?.message) } finally { try { ctl.close() } catch { /* already closed */ } }
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" } })
}
