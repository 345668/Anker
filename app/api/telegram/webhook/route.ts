/**
 * POST /api/telegram/webhook — Telegram delivers every message to the Anker bot here (docs/architecture/57).
 * The secret header is checked before anything is parsed. The update is stored (the unique update id makes Telegram's retries harmless), acknowledged at once, and processed
 * after the response; a cron picks up anything left behind. No business logic lives in this route.
 */
import { NextRequest, NextResponse, after } from "next/server"
import { productBot, secretOk } from "@/lib/telegram/api"
import { enqueue, processUpdate, realDeps } from "@/lib/telegram/runtime"
import type { TgUpdate } from "@/lib/telegram/handler"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const bot = productBot()
  if (!bot || !secretOk(req.headers.get("x-telegram-bot-api-secret-token"), bot)) return new NextResponse(null, { status: 401 })
  let update: TgUpdate
  try { update = await req.json() } catch { return new NextResponse(null, { status: 400 }) }
  if (!update || typeof update.update_id !== "number") return new NextResponse(null, { status: 400 })
  try {
    if (await enqueue(update)) after(() => processUpdate(update.update_id, realDeps(bot)).catch((e) => console.error("[telegram] process failed:", (e as Error)?.message)))
  } catch (e) {
    console.error("[telegram] could not queue an update:", (e as Error)?.message)
    return new NextResponse(null, { status: 500 })      // Telegram will try again
  }
  return NextResponse.json({ ok: true })
}
