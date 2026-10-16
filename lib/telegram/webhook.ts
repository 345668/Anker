import "server-only"
import { NextResponse, after } from "next/server"
import type { ProductBot } from "./api"
import { secretOk } from "./api"
import { enqueue, processUpdate, realDeps } from "./runtime"
import type { TgUpdate } from "./handler"

/** The one webhook behaviour for every bot: secret header first, store once, acknowledge, process after the response (docs/architecture/57). */
export async function receive(req: Request, b: ProductBot | null): Promise<NextResponse> {
  if (!b || !secretOk(req.headers.get("x-telegram-bot-api-secret-token"), b)) return new NextResponse(null, { status: 401 })
  let update: TgUpdate
  try { update = await req.json() } catch { return new NextResponse(null, { status: 400 }) }
  if (!update || typeof update.update_id !== "number") return new NextResponse(null, { status: 400 })
  try {
    if (await enqueue(update, b.id)) after(() => processUpdate(update.update_id, realDeps(b), b.id).catch((e) => console.error("[telegram] process failed:", (e as Error)?.message)))
  } catch (e) {
    console.error("[telegram] could not queue an update:", (e as Error)?.message)
    return new NextResponse(null, { status: 500 })      // Telegram will try again
  }
  return NextResponse.json({ ok: true })
}
