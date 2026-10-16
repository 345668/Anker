/** POST /api/telegram/webhook/<bot id> — a workspace's own bot delivers here (docs/architecture/57 section 19). The bot's own derived secret is checked before anything is parsed. */
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { loadBot } from "@/lib/telegram/bots"
import { receive } from "@/lib/telegram/webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ bot: string }> }) {
  const { bot } = await ctx.params
  if (!/^[\w-]{8,24}$/.test(bot) || bot === "platform") return new NextResponse(null, { status: 404 })
  const loaded = await loadBot(bot).catch(() => null)
  return receive(req, loaded?.bot ?? null)
}
