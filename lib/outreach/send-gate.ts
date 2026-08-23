/**
 * Outreach send-gate — the deliverability + volume guard every send passes through.
 *
 * Sending real email on a founder's/fund's behalf is irreversible, so the agent
 * `send_outreach` tool never sends on its own reasoning: it defaults to a DRY RUN
 * and only dispatches when the caller passes an explicit `confirm: true` (which
 * should follow a human's approval in chat). This module supplies the two
 * deterministic checks that run before any dispatch:
 *
 *   1. checkDeliverability — a syntactically valid address that isn't an obvious
 *      placeholder / no-reply / example domain.
 *   2. waveCapRemaining — how many sends are left under today's per-user cap
 *      (OUTREACH_DAILY_CAP, default 50), counted from `outreach_messages`.
 *
 * Both are advisory inputs the tool surfaces; neither writes anything.
 */

import { sql } from "@/lib/db"

/** RFC-5322-lite: good enough to catch typos without rejecting valid addresses. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const BLOCKED_DOMAINS = ["example.com", "example.org", "example.net", "test.com", "localhost", "email.com", "domain.com"]
const BLOCKED_LOCALPARTS = ["noreply", "no-reply", "donotreply", "do-not-reply", "postmaster", "mailer-daemon", "abuse"]

export interface DeliverabilityCheck {
  ok: boolean
  reason?: string
  normalized?: string
}

/** Deterministic address hygiene — no network, no MX lookup (serverless-safe). */
export function checkDeliverability(to: string): DeliverabilityCheck {
  const addr = String(to ?? "").trim().toLowerCase()
  if (!addr) return { ok: false, reason: "No recipient address." }
  if (!EMAIL_RE.test(addr)) return { ok: false, reason: `"${to}" is not a valid email address.` }
  const [local, domain] = addr.split("@")
  if (BLOCKED_DOMAINS.includes(domain)) return { ok: false, reason: `"${domain}" is a placeholder domain — not a real recipient.` }
  if (BLOCKED_LOCALPARTS.includes(local)) return { ok: false, reason: `"${local}@" is an unattended mailbox — outreach there won't reach a person.` }
  return { ok: true, normalized: addr }
}

export const DAILY_CAP = Math.max(1, Number(process.env.OUTREACH_DAILY_CAP) || 50)

export interface WaveCap {
  cap: number
  sentToday: number
  remaining: number
}

/** How many sends remain under today's per-user cap. Counts sent rows in
 *  `outreach_messages` for this user since UTC midnight. Fails open (assumes the
 *  full cap is available) if the count query errors, so a telemetry hiccup never
 *  blocks a human-approved send. */
export async function waveCapRemaining(userId: string | undefined): Promise<WaveCap> {
  let sentToday = 0
  if (userId) {
    try {
      const rows = await sql`
        SELECT count(*)::int AS n FROM outreach_messages
        WHERE user_id = ${userId} AND status IN ('sent','delivered')
          AND sent_at >= date_trunc('day', now() at time zone 'utc')` as { n: number }[]
      sentToday = rows[0]?.n ?? 0
    } catch {
      sentToday = 0 // fail open — telemetry must not block an approved send
    }
  }
  return { cap: DAILY_CAP, sentToday, remaining: Math.max(0, DAILY_CAP - sentToday) }
}
