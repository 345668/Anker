/**
 * GET  /api/admin/news/api-keys
 *   Returns per-provider key state for the admin UI:
 *     - `set`        — whether the key is configured at all (DB or env)
 *     - `source`     — "db" | "env" | "none" so admin sees where it's coming from
 *     - `masked`     — last 4 chars when source=db (DB-stored keys are
 *                      revealable to admins; env-only keys never are)
 *
 * POST /api/admin/news/api-keys
 *   Body: { ALPHA_VANTAGE_API_KEY?, FINNHUB_API_KEY?, ... }
 *   Saves to system_settings.news_providers_v1. Pass "" to delete a key
 *   (the env-var fallback takes over for that one).
 *
 * Admin-gated. Keys are sensitive — we mask on read, never log on write.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  readNewsKeys, saveNewsKeys,
  NEWS_KEY_NAMES, type NewsKeyName,
} from "@/lib/news/runtime-keys"

export const runtime = "nodejs"

interface KeyStatus {
  name: NewsKeyName
  set: boolean
  source: "db" | "env" | "none"
  masked: string | null
}

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const dbKeys = await readNewsKeys()
  const out: KeyStatus[] = NEWS_KEY_NAMES.map((name) => {
    const fromDb = dbKeys[name]
    const fromEnv = process.env[name]?.trim()
    if (fromDb) {
      return {
        name, set: true, source: "db",
        masked: maskTail(fromDb),
      }
    }
    if (fromEnv) {
      return { name, set: true, source: "env", masked: null }
    }
    return { name, set: false, source: "none", masked: null }
  })
  return NextResponse.json({ keys: out })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  try {
    const body = await req.json()
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body must be a JSON object of name→value" }, { status: 400 })
    }
    const updates: Partial<Record<NewsKeyName, string>> = {}
    for (const name of NEWS_KEY_NAMES) {
      if (name in body) {
        const v = body[name]
        if (v == null) updates[name] = ""
        else if (typeof v === "string") updates[name] = v
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update — pass one or more recognised key names." }, { status: 400 })
    }
    // Diagnostic — visible in Vercel function logs when something goes wrong.
    console.log(`[news api-keys POST] admin=${admin.email ?? admin.id} updating ${Object.keys(updates).join(",")}`)
    const saved = await saveNewsKeys(updates, admin.id ?? admin.email)
    // Re-derive status the same way GET does so the client doesn't need
    // a second round-trip.
    const out: KeyStatus[] = NEWS_KEY_NAMES.map((name) => {
      const fromDb = saved[name]
      const fromEnv = process.env[name]?.trim()
      if (fromDb) return { name, set: true, source: "db", masked: maskTail(fromDb) }
      if (fromEnv) return { name, set: true, source: "env", masked: null }
      return { name, set: false, source: "none", masked: null }
    })
    return NextResponse.json({ keys: out })
  } catch (e: any) {
    console.error("[news api-keys POST]", e)
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 })
  }
}

function maskTail(s: string): string {
  const tail = s.slice(-4)
  return tail.length > 0 ? `••••${tail}` : "•••"
}
