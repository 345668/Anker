import { sql } from "@/lib/db"
import { currentAiContext } from "@/lib/assistant/context"

/**
 * The one meter for paid calls that are not chat completions (docs/architecture/58 section 4). A call states its unit and quantity; the cost is the quantity times the list price
 * in `unit_prices` (editable in SAIL). It never throws and never blocks the work it measures.
 *   exact      the quantity was measured (seconds of audio, characters sent, pages read)
 *   estimated  the quantity was guessed (a size, a text length)
 *   unpriced   the unit has no price: counted by an alert, never read as free
 */
export const UNITS = ["asr_second", "tts_char", "embed_token", "vision_doc", "vision_page", "image", "video_second"] as const
export type Unit = (typeof UNITS)[number]
export type MeterState = "exact" | "estimated" | "unpriced"

/** Used only if the price table cannot be read. Placeholders, like the seeded rows. */
const FALLBACK: Record<Unit, number> = { asr_second: 0.00003, tts_char: 0.00001, embed_token: 0.00000007, vision_doc: 0.01, vision_page: 0.002, image: 0.04, video_second: 0.1 }
let cache: { at: number; map: Map<string, number> } | null = null
const TTL_MS = 60_000
export const resetUnitPriceCache = () => { cache = null }

export async function unitPrice(unit: Unit): Promise<number | undefined> { return (await prices()).get(unit) }

async function prices(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map
  try {
    const rows = (await sql`SELECT unit, price_usd FROM unit_prices`) as any[]
    cache = { at: Date.now(), map: new Map(rows.map((r) => [String(r.unit), Number(r.price_usd)])) }
  } catch { cache = { at: Date.now() - TTL_MS + 5_000, map: new Map(Object.entries(FALLBACK)) } }
  return cache.map
}

export interface MeterInput {
  unit: Unit
  qty: number
  /** The route or job that made the call, for the report ("telegram-voice", "embeddings"). */
  source: string
  /** The workspace that pays. Taken from the running request when not given; absent means a platform job. */
  owner?: string | null
  /** A run, job or update id, to tie the cost to a job. */
  ref?: string | null
  /** True when the quantity is a guess. */
  estimated?: boolean
}

export async function meter(i: MeterInput): Promise<void> {
  try {
    const qty = Number.isFinite(i.qty) && i.qty > 0 ? i.qty : 0
    if (qty === 0) return
    const org = i.owner !== undefined ? i.owner : currentAiContext()?.principal?.orgId ?? null
    const price = (await prices()).get(i.unit)
    const state: MeterState = price === undefined ? "unpriced" : i.estimated ? "estimated" : "exact"
    const cost = price === undefined ? null : qty * price
    await sql`INSERT INTO usage_events (org_id, cost_center, unit, qty, unit_cost, cost_usd, cost_state, source, ref)
      VALUES (${org}, ${org ? `workspace:${org}` : `platform:${i.source}`}, ${i.unit}, ${qty}, ${price ?? null}, ${cost}, ${state}, ${i.source.slice(0, 64)}, ${i.ref ? String(i.ref).slice(0, 128) : null})`
  } catch (e) {
    console.error("[metering] could not record usage:", (e as Error)?.message)
  }
}

/** Rough size of an audio file in seconds, for the places that only have the bytes. About 12 KB a second covers voice notes and typical MP3s; deliberately a guess. */
export const guessAudioSeconds = (bytes: number) => Math.max(1, Math.round(bytes / 12_000))
/** About four characters to a token. */
export const guessTokens = (chars: number) => Math.ceil(chars / 4)
