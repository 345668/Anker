/**
 * Minimal fixed-window rate limiter.
 *
 * In-memory and therefore per-serverless-instance: on Vercel each warm lambda
 * keeps its own counters, so the effective limit is (configured limit ×
 * instance count). That is deliberate for v1 — it blunts a single client
 * hammering one instance and needs no external service. If we ever need a
 * hard global limit (strict quota, billing), swap the Map for Upstash/Redis
 * behind the same rateLimit() signature.
 *
 * Usage in a route, after requireUser():
 *
 *   const rl = rateLimit(`fund-deck-analyze:${auth.id}`, AI_HEAVY)
 *   if (!rl.ok) return rateLimitResponse(rl)
 */
import { NextResponse } from "next/server"

export interface RateLimitOpts {
  /** Max requests allowed within the window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  ok: boolean
  /** Requests left in the current window (0 when blocked). */
  remaining: number
  /** Milliseconds until the window resets (0 when allowed). */
  retryAfterMs: number
  /** Epoch ms when the current window resets. */
  resetAt: number
}

/** Sensible defaults for expensive multi-provider AI endpoints. */
export const AI_HEAVY: RateLimitOpts = { limit: 12, windowMs: 60_000 }
/** Lighter interactive endpoints (chat turns, quick generations). */
export const AI_INTERACTIVE: RateLimitOpts = { limit: 40, windowMs: 60_000 }

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
let lastSweep = 0

/** Drop expired buckets so the Map can't grow without bound. Cheap, runs at
 *  most once a minute regardless of traffic. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k)
}

export function rateLimit(key: string, opts: RateLimitOpts): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    const resetAt = now + opts.windowMs
    buckets.set(key, { count: 1, resetAt })
    return { ok: true, remaining: opts.limit - 1, retryAfterMs: 0, resetAt }
  }

  if (b.count >= opts.limit) {
    return { ok: false, remaining: 0, retryAfterMs: b.resetAt - now, resetAt: b.resetAt }
  }

  b.count++
  return { ok: true, remaining: opts.limit - b.count, retryAfterMs: 0, resetAt: b.resetAt }
}

/** 429 response carrying a Retry-After header (seconds, per RFC 7231). */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000))
  return NextResponse.json(
    { error: `Rate limit exceeded. Try again in ${retryAfterSec}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  )
}
