/**
 * POST /api/telegram/webhook — Telegram delivers every message to the shared Anker bot here (docs/architecture/57).
 * A workspace's own bot delivers to /api/telegram/webhook/<bot id>. No business logic lives in the routes (lib/telegram/webhook.ts).
 */
import type { NextRequest } from "next/server"
import { productBot } from "@/lib/telegram/api"
import { receive } from "@/lib/telegram/webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(req: NextRequest) { return receive(req, productBot()) }
