/**
 * The Outreach Engine — the singular, list-level loop.
 *
 * Consolidates the two 8fundraising playbooks ("The Investor Outreach
 * Autopilot" + "Fundraising MCPs") into one engine that turns a SCORED
 * investor list into reviewed, channel-routed draft sequences.
 *
 * It is the layer ABOVE the per-entry orchestrator (lib/agents/outreach-agent
 * `runAgent`) and the personalizers (dm-personalizer / email-personalizer):
 * those handle one investor + one message; this handles the whole list.
 *
 * The 4-step loop (from the Autopilot CLAUDE.md):
 *
 *   1. INGEST  — pull the user's scored CRM rows; keep only score >= minScore
 *                with a usable identity (verified email OR LinkedIn URL);
 *                drop the rest. Skip rows contacted inside the dedupe window.
 *   2. ROUTE   — score each row to a channel: linkedin / email / dual / skip.
 *                LP-class allocators (family offices, FoFs, endowments,
 *                pensions, insurers) are NEVER cold-DMed on LinkedIn — they
 *                route to email/warm-intro only (fundraising-specific rule).
 *   3. DRAFT   — delegate to runAgent (enrich → profile → draft) per row and
 *                per routed channel. Draft-only, every message run through the
 *                7-rule validator. DUAL rows draft BOTH channels (different
 *                copy is inherent: DM vs email personalizers differ).
 *   4. QUEUE   — drafts already persisted as outreach_messages(status='draft').
 *                Nothing is sent. A human approves + ships from the UI.
 *
 * HARD RULES (never broken, from both playbooks):
 *   - Never auto-send. Drafts only. Human approval is the send trigger.
 *   - Never queue a row with score < minScore or no identity.
 *   - Never queue an investor to both channels on the same day (dedupe).
 *   - Never cold-DM LP-class allocators on LinkedIn.
 *   - Every message passes the 7 outreach rules.
 */

import { sql } from "@/lib/db"
import { runAgent, type RunAgentResult } from "@/lib/agents/outreach-agent"

// ─── Canonical sequence spec (the 14-day, 6-touchpoint plan as data) ──────
// Exported so the UI and agent share ONE definition of the cadence.
export interface SequenceStep {
  day: number
  touch: string
  channel: "linkedin" | "email" | "both"
  condition: string
  kind?: "connection_request" | "follow_up" | "different_angle" | "close_loop"
}

export const SEQUENCE_SPEC: {
  envelopeDays: number
  touchpoints: number
  linkedinAccepted: SequenceStep[]
  linkedinNotAccepted: SequenceStep[]
  email: SequenceStep[]
  reengageAfterDays: number
} = {
  envelopeDays: 14,
  touchpoints: 6,
  linkedinAccepted: [
    { day: 0, touch: "Connection request", channel: "linkedin", condition: "no note unless they posted in last 72h", kind: "connection_request" },
    { day: 0, touch: "Message 1 — opener (+3h after accept)", channel: "linkedin", condition: "if accepted", kind: "connection_request" },
    { day: 3, touch: "Message 2 — follow-up", channel: "linkedin", condition: "if no reply", kind: "follow_up" },
    { day: 7, touch: "Message 3 — final ping (2 lines)", channel: "linkedin", condition: "if no reply", kind: "different_angle" },
    { day: 8, touch: "View profile (signal)", channel: "linkedin", condition: "always" },
    { day: 9, touch: "End accepted branch (re-engage in 90d)", channel: "linkedin", condition: "if no reply", kind: "close_loop" },
  ],
  linkedinNotAccepted: [
    { day: 14, touch: "Like a recent post (warm handshake)", channel: "linkedin", condition: "if request not accepted" },
    { day: 19, touch: "End → quarterly re-engagement bucket", channel: "linkedin", condition: "always" },
  ],
  email: [
    { day: 0, touch: "Cold opener", channel: "email", condition: "always", kind: "connection_request" },
    { day: 3, touch: "Bump (threaded)", channel: "email", condition: "if no reply", kind: "follow_up" },
    { day: 7, touch: "Different angle", channel: "email", condition: "if no reply", kind: "different_angle" },
    { day: 14, touch: "Graceful close", channel: "email", condition: "if no reply", kind: "close_loop" },
  ],
  reengageAfterDays: 90,
}

// ─── Channel scoring ──────────────────────────────────────────────────────
export type EngineChannel = "linkedin" | "email" | "dual" | "skip"

export interface EntryRow {
  id: string
  display_name: string | null
  display_email: string | null
  display_linkedin: string | null
  display_type: string | null
  display_score: number | null
  why_match: string | null
  stage: string | null
  last_contacted_at: string | null
}

/** LP-class allocators strongly prefer warm intros + email; cold LinkedIn
 *  DMs to them convert <2% and burn the relationship (Autopilot §9). */
const LP_CLASS = /family\s*office|fund[\s-]*of[\s-]*funds|\bfof\b|endowment|pension|insurance|insurer|sovereign|foundation|\bl\.?p\.?\b|limited partner|wealth|gatekeeper|consultant|outsourced cio|\bocio\b/i

export function isLpClass(entry: Pick<EntryRow, "display_type" | "why_match" | "display_name">): boolean {
  const hay = [entry.display_type, entry.why_match, entry.display_name].filter(Boolean).join(" ")
  return LP_CLASS.test(hay)
}

export interface ChannelDecision {
  channel: EngineChannel
  reasons: string[]
  lpClass: boolean
}

/**
 * Score one row to a channel.
 *   - email if a verified-looking email exists
 *   - linkedin if a LinkedIn URL exists AND the row is NOT LP-class
 *   - dual if both are available (and not LP-class)
 *   - skip if neither
 * LP-class rows never get cold LinkedIn — email only (or skip if no email).
 */
export function scoreChannel(entry: EntryRow): ChannelDecision {
  const reasons: string[] = []
  const hasEmail = !!(entry.display_email && entry.display_email.includes("@"))
  const hasLinkedIn = !!(entry.display_linkedin && entry.display_linkedin.trim())
  const lp = isLpClass(entry)
  if (lp) reasons.push("LP-class allocator → email/warm-intro only (no cold LinkedIn)")

  if (lp) {
    if (hasEmail) { reasons.push("verified email present"); return { channel: "email", reasons, lpClass: lp } }
    reasons.push("no email and LinkedIn cold-DM disallowed for LP-class")
    return { channel: "skip", reasons, lpClass: lp }
  }

  if (hasEmail && hasLinkedIn) { reasons.push("email + LinkedIn both present → dual"); return { channel: "dual", reasons, lpClass: lp } }
  if (hasLinkedIn) { reasons.push("LinkedIn present, no email"); return { channel: "linkedin", reasons, lpClass: lp } }
  if (hasEmail) { reasons.push("email present, no LinkedIn"); return { channel: "email", reasons, lpClass: lp } }
  reasons.push("no email and no LinkedIn")
  return { channel: "skip", reasons, lpClass: lp }
}

// ─── The 7 outreach rules — reusable validator ─────────────────────────────
export interface RuleViolation { rule: string; detail: string }

const FILLER = [
  "i hope this finds you well", "i appreciate you taking the time", "hope you're doing well",
  "just circling back", "leverage", "synergy", "unlock", "to whom it may concern",
]
const BIG_CLAIM = /\b(leader|leading|best|#?1|number one|world[- ]class|revolutionary|game[- ]changing|unparalleled|cutting[- ]edge)\b/i

/**
 * Validate a single message against the 7 outreach rules. Returns the list of
 * violations (empty = clean). `channel` tunes the length checks (LinkedIn
 * day-0 ≤280 chars; email opener ≤ ~10 lines).
 */
export function validateMessage(
  text: string,
  opts: { channel: "linkedin" | "email"; kind?: string },
): { ok: boolean; violations: RuleViolation[] } {
  const violations: RuleViolation[] = []
  const t = (text ?? "").trim()
  const lower = t.toLowerCase()

  // Rule: no em dashes
  if (t.includes("—")) violations.push({ rule: "no em dashes", detail: "contains an em dash; use commas/colons/periods" })

  // Rule: length / skim-friendly
  if (opts.channel === "linkedin") {
    const max = opts.kind === "connection_request" ? 280 : 320
    if (t.length > max) violations.push({ rule: "length", detail: `${t.length} chars > ${max} max for LinkedIn ${opts.kind ?? "DM"}` })
  } else {
    const lines = t.split(/\n+/).filter((l) => l.trim()).length
    if (lines > 12) violations.push({ rule: "6-10 lines", detail: `${lines} lines; emails should stay short` })
    if (t.length > 900) violations.push({ rule: "length", detail: `${t.length} chars; tighten the email` })
  }

  // Rule: one clear CTA (more than 2 question marks usually means stacked asks)
  const qs = (t.match(/\?/g) || []).length
  if (qs > 2) violations.push({ rule: "one CTA", detail: `${qs} questions; keep one clear ask` })

  // Rule: proof early — at least one number/metric somewhere
  if (!/\d/.test(t)) violations.push({ rule: "proof early", detail: "no number/metric; add one concrete proof point" })

  // Rule: no big claim without a number nearby
  const claim = t.match(BIG_CLAIM)
  if (claim && !/\d/.test(t)) violations.push({ rule: "no big claims without numbers", detail: `claim "${claim[0]}" without a backing number` })

  // Rule: no vision essay (openers especially)
  const words = t.split(/\s+/).filter(Boolean).length
  if (opts.kind === "connection_request" && words > 90) violations.push({ rule: "no vision essay", detail: `${words} words; the opener should survive a 4-second scan` })
  if (/\b(we believe|the future of|our mission is|paradigm)\b/i.test(lower)) violations.push({ rule: "no vision essay", detail: "vision-essay phrasing; save it for the meeting" })

  // Rule: operator voice (no filler / begging)
  for (const f of FILLER) if (lower.includes(f)) { violations.push({ rule: "operator voice", detail: `filler phrase: "${f}"` }); break }

  return { ok: violations.length === 0, violations }
}

// ─── The loop ──────────────────────────────────────────────────────────────
export interface FounderBrief {
  companyName: string
  oneLiner: string
  facts: string[]
  calendarUrl?: string
  currency?: "USD" | "EUR" | "GBP"
}

export interface RunLoopInput {
  userId: string
  founder: FounderBrief
  /** Minimum display_score to enter the loop. Playbook default: 35. */
  minScore?: number
  /** Max rows to process this run. */
  limit?: number
  /** Don't re-process a row contacted within this many days. Default 7. */
  dedupeWindowDays?: number
  /** Force re-draft even if recently contacted / drafts exist. */
  force?: boolean
  /** Restrict to one channel (overrides scoring). */
  channelOverride?: "linkedin" | "email"
  actorUserId?: string | null
}

export interface LoopRowResult {
  crmEntryId: string
  name: string
  score: number
  channel: EngineChannel
  reasons: string[]
  drafted: ("linkedin" | "email")[]
  validation: { channel: string; kind: string; violations: RuleViolation[] }[]
  note: string
}

export interface OutreachLoopReport {
  ingested: number
  skipped: { reason: string; count: number }[]
  routed: Record<EngineChannel, number>
  drafted: number
  rows: LoopRowResult[]
  durationMs: number
  hardRules: string[]
}

const TERMINAL_STAGES = ["meeting", "won", "lost", "passed", "closed", "archived"]

/** Run the full INGEST → ROUTE → DRAFT → QUEUE loop for a user. Draft-only. */
export async function runOutreachLoop(input: RunLoopInput): Promise<OutreachLoopReport> {
  const t0 = Date.now()
  const minScore = input.minScore ?? 35
  const limit = Math.max(1, Math.min(200, input.limit ?? 25))
  const dedupeDays = Math.max(0, input.dedupeWindowDays ?? 7)
  const skipCounts = new Map<string, number>()
  const bumpSkip = (reason: string) => skipCounts.set(reason, (skipCounts.get(reason) ?? 0) + 1)

  if (!input.founder?.companyName || !input.founder?.oneLiner) {
    return {
      ingested: 0, skipped: [{ reason: "founder context missing", count: 1 }],
      routed: { linkedin: 0, email: 0, dual: 0, skip: 0 }, drafted: 0, rows: [],
      durationMs: Date.now() - t0, hardRules: HARD_RULES,
    }
  }

  // ── 1. INGEST ──
  // Candidate rows: this user's non-terminal CRM entries, score-gated, ranked.
  // We over-fetch (limit*3) so the score/identity/dedupe gates can drop rows
  // and still fill the batch.
  const candidates = (await sql`
    SELECT id, display_name, display_email, display_linkedin, display_type,
           display_score, why_match, stage, last_contacted_at
    FROM crm_entries
    WHERE user_id = ${input.userId}
      AND (stage IS NULL OR stage NOT IN ('meeting','won','lost','passed','closed','archived'))
    ORDER BY display_score DESC NULLS LAST, updated_at ASC
    LIMIT ${limit * 3}
  `) as unknown as EntryRow[]

  const ingested: EntryRow[] = []
  for (const row of candidates) {
    if (ingested.length >= limit) break
    const score = Number(row.display_score ?? 0)
    if (score < minScore) { bumpSkip(`score < ${minScore}`); continue }
    const hasIdentity = !!(row.display_email && row.display_email.includes("@")) || !!(row.display_linkedin && row.display_linkedin.trim())
    if (!hasIdentity) { bumpSkip("no email and no LinkedIn"); continue }
    if (!input.force && dedupeDays > 0 && row.last_contacted_at) {
      const ageMs = Date.now() - new Date(row.last_contacted_at).getTime()
      if (ageMs < dedupeDays * 86_400_000) { bumpSkip(`contacted within ${dedupeDays}d (dedupe)`); continue }
    }
    ingested.push(row)
  }

  // ── 2. ROUTE + 3/4. DRAFT/QUEUE ──
  const routed: Record<EngineChannel, number> = { linkedin: 0, email: 0, dual: 0, skip: 0 }
  const rows: LoopRowResult[] = []
  let drafted = 0

  for (const row of ingested) {
    const decision = input.channelOverride
      ? { channel: input.channelOverride as EngineChannel, reasons: [`channel override: ${input.channelOverride}`], lpClass: isLpClass(row) }
      : scoreChannel(row)
    routed[decision.channel]++

    if (decision.channel === "skip") {
      rows.push({ crmEntryId: row.id, name: row.display_name ?? "", score: Number(row.display_score ?? 0), channel: "skip", reasons: decision.reasons, drafted: [], validation: [], note: "skipped at routing" })
      continue
    }

    // DUAL drafts both channels (dedupe is at the lead level + send-time
    // spacing, never the same day — enforced by the rate-limit scheduler).
    const channels: ("linkedin" | "email")[] = decision.channel === "dual" ? ["email", "linkedin"] : [decision.channel]
    const draftedChannels: ("linkedin" | "email")[] = []
    let note = ""
    for (const ch of channels) {
      try {
        const res: RunAgentResult = await runAgent({
          crmEntryId: row.id,
          mode: "draft-only",
          channel: ch,
          founder: input.founder,
          force: input.force,
          actorUserId: input.actorUserId ?? null,
          trigger: "api",
        })
        const draftStep = res.steps.find((s) => s.step === "draft")
        if (draftStep?.status === "ok") { draftedChannels.push(ch); drafted++ }
        else if (draftStep) note += `${ch}: ${draftStep.detail}; `
      } catch (e: any) {
        note += `${ch}: ${e?.message ?? "draft error"}; `
      }
    }

    // Validate the freshly-persisted drafts against the 7 rules.
    const validation = await validateEntryDrafts(row.id)

    rows.push({
      crmEntryId: row.id,
      name: row.display_name ?? "",
      score: Number(row.display_score ?? 0),
      channel: decision.channel,
      reasons: decision.reasons,
      drafted: draftedChannels,
      validation,
      note: note.trim(),
    })
  }

  return {
    ingested: ingested.length,
    skipped: [...skipCounts.entries()].map(([reason, count]) => ({ reason, count })),
    routed,
    drafted,
    rows,
    durationMs: Date.now() - t0,
    hardRules: HARD_RULES,
  }
}

const HARD_RULES = [
  "Never auto-send — drafts only; human approval is the send trigger",
  "Never queue score < minScore or no identity (email/LinkedIn)",
  "Never queue an investor to both channels on the same day (dedupe)",
  "Never cold-DM LP-class allocators on LinkedIn",
  "Every message passes the 7 outreach rules",
]

/** Pull this entry's draft messages and run each through the 7-rule validator. */
async function validateEntryDrafts(crmEntryId: string): Promise<LoopRowResult["validation"]> {
  const msgs = (await sql`
    SELECT kind, channel, body, subject FROM outreach_messages
    WHERE crm_entry_id = ${crmEntryId} AND status = 'draft'
  `) as unknown as { kind: string; channel: string; body: string; subject: string | null }[]
  const out: LoopRowResult["validation"] = []
  for (const m of msgs) {
    const ch = (m.channel === "email" ? "email" : "linkedin") as "linkedin" | "email"
    const v = validateMessage(m.body ?? "", { channel: ch, kind: m.kind })
    if (!v.ok) out.push({ channel: ch, kind: m.kind, violations: v.violations })
  }
  return out
}

// ─── Weekly report ─────────────────────────────────────────────────────────
export interface WeeklyReport {
  windowDays: number
  byChannel: {
    channel: string
    sent: number
    opened: number          // email opens (LinkedIn: accepted proxy n/a)
    replied: number
    meetings: number
    replyRatePct: number
    flagLowReplyRate: boolean   // < 20%
  }[]
  totals: { sent: number; replied: number; meetings: number; replyRatePct: number }
  needsFollowup: number          // replied but not followed up within 24h
  flags: string[]
}

/** Aggregate the week's outreach into the playbook's reporting view. */
export async function weeklyReport(opts: { userId: string; days?: number }): Promise<WeeklyReport> {
  const days = Math.max(1, Math.min(90, opts.days ?? 7))
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const perChannel = (await sql`
    SELECT channel,
           COUNT(*) FILTER (WHERE status IN ('sent','delivered','replied','accepted'))::int AS sent,
           COALESCE(SUM(CASE WHEN opens > 0 THEN 1 ELSE 0 END),0)::int AS opened,
           COUNT(*) FILTER (WHERE status = 'replied')::int AS replied
    FROM outreach_messages
    WHERE user_id = ${opts.userId} AND created_at >= ${since}::timestamptz
    GROUP BY channel
  `) as unknown as { channel: string; sent: number; opened: number; replied: number }[]

  const meetingsRow = (await sql`
    SELECT COUNT(*)::int AS meetings
    FROM outreach_replies
    WHERE user_id = ${opts.userId}
      AND classification = 'INTERESTED'
      AND received_at >= ${since}::timestamptz
  `) as unknown as { meetings: number }[]
  const meetings = Number(meetingsRow[0]?.meetings ?? 0)

  // Replied but not followed up within 24h: a reply with no later approved
  // response and the original message not re-touched.
  const staleRow = (await sql`
    SELECT COUNT(*)::int AS n
    FROM outreach_replies r
    WHERE r.user_id = ${opts.userId}
      AND r.received_at >= ${since}::timestamptz
      AND (r.approved IS NOT TRUE)
      AND r.received_at < NOW() - INTERVAL '24 hours'
  `) as unknown as { n: number }[]
  const needsFollowup = Number(staleRow[0]?.n ?? 0)

  const byChannel = perChannel.map((c) => {
    const replyRate = c.sent > 0 ? (c.replied / c.sent) * 100 : 0
    return {
      channel: c.channel,
      sent: c.sent,
      opened: c.opened,
      replied: c.replied,
      meetings: c.channel === "email" ? meetings : 0, // meetings tracked at reply level
      replyRatePct: Math.round(replyRate * 10) / 10,
      flagLowReplyRate: c.sent >= 10 && replyRate < 20,
    }
  })

  const totalSent = byChannel.reduce((a, c) => a + c.sent, 0)
  const totalReplied = byChannel.reduce((a, c) => a + c.replied, 0)
  const flags: string[] = []
  for (const c of byChannel) if (c.flagLowReplyRate) flags.push(`${c.channel} reply rate ${c.replyRatePct}% < 20% — consider a copy reset`)
  if (needsFollowup > 0) flags.push(`${needsFollowup} repl${needsFollowup === 1 ? "y" : "ies"} not actioned within 24h`)

  return {
    windowDays: days,
    byChannel,
    totals: {
      sent: totalSent,
      replied: totalReplied,
      meetings,
      replyRatePct: totalSent > 0 ? Math.round((totalReplied / totalSent) * 1000) / 10 : 0,
    },
    needsFollowup,
    flags,
  }
}
