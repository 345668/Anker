import "server-only"
import { sql } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/db/secrets"
import { isFlagOn, getEffective, limitOf } from "@/lib/entitlements"
import { assertCan } from "@/lib/metering/allowance"
import { assertProviderAllowed } from "@/lib/ai/data-policy"
import { createRepeatFilter, createEchoFilter, type Turn } from "./core"

/** Halyard sessions (docs/architecture/62 sections 10, 11, 13, 14). Text is encrypted by the application; audio is never stored. */
export class HalyardError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "halyard") { super(message); this.name = "HalyardError" }
}

export const MODES = ["general", "sales-call", "founder-investor-call", "vc-investor-call"] as const
export const MAX_SESSION_HOURS = 4
export const MAX_TRANSCRIPT_CHARS = 1_000_000
export const MAX_SEGMENT_CHARS = 4_000
export const DEFAULT_RETENTION_MONTHS = 12
export const DEFAULT_MINUTES_MONTH = 600

export interface SessionRow {
  id: string; org_id: string; user_id: string; source: "web" | "desktop"; mode: string; title: string | null; language: string | null
  state: "live" | "paused" | "ended" | "abandoned"; started_at: string; ended_at: string | null; consent_attested_at: string; participants_informed: boolean
  crm_entry_id: string | null; call_id: string | null; stt: "server" | "local" | "wasm"; audio_seconds: number; chars: number; folded_upto: number; delete_after: string | null
}

/** The kill switch (docs/architecture/62 section 15): the platform flag, or the workspace's own feature turned off by an operator, stops every live action at once. Reading, exporting and deleting your own calls are never stopped. */
export async function assertOn(orgId: string): Promise<void> {
  if (!(await isFlagOn("halyard_web", orgId))) throw new HalyardError("Halyard has been switched off. Your calls are still yours: you can read, export and delete them.", 403, "off")
  if (!(await getEffective(orgId)).features.halyard) throw new HalyardError("Halyard is not available on your plan right now. Your calls are still yours: you can read, export and delete them.", 403, "plan")
}
export const CONSENT_VERSION = "v1"

export interface Settings { retentionMonths: number; requireInformed: boolean }
export async function getSettings(orgId: string): Promise<Settings> {
  const [r] = (await sql`SELECT retention_months, require_informed FROM halyard_settings WHERE org_id = ${orgId}`) as any[]
  return { retentionMonths: r?.retention_months ?? DEFAULT_RETENTION_MONTHS, requireInformed: !!r?.require_informed }
}
/** A workspace owner or admin's choice. Changing the retention period applies to calls already finished (their deletion date moves to end + months), so shortening it takes effect at once. */
export async function saveSettings(orgId: string, input: { retentionMonths?: unknown; requireInformed?: unknown }): Promise<Settings> {
  const cur = await getSettings(orgId)
  const months = input.retentionMonths === undefined ? cur.retentionMonths : Number(input.retentionMonths)
  if (!Number.isInteger(months) || months < 1 || months > 120) throw new HalyardError("Retention is a whole number of months from 1 to 120.", 400, "bad_retention")
  const req = input.requireInformed === undefined ? cur.requireInformed : input.requireInformed === true
  await sql`INSERT INTO halyard_settings (org_id, retention_months, require_informed, updated_at) VALUES (${orgId}, ${months}, ${req}, now())
    ON CONFLICT (org_id) DO UPDATE SET retention_months = EXCLUDED.retention_months, require_informed = EXCLUDED.require_informed, updated_at = now()`
  if (months !== cur.retentionMonths) await sql`UPDATE halyard_sessions SET delete_after = (ended_at + make_interval(months => ${months})) WHERE org_id = ${orgId} AND ended_at IS NOT NULL`
  return { retentionMonths: months, requireInformed: req }
}

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max)

export interface CreateInput {
  orgId: string; userId: string; source?: "web" | "desktop"; mode?: string; title?: string; language?: string; crmEntryId?: string | null
  /** The person confirms they have the permission they need to transcribe this conversation. Required, every session. */
  consentAttested: unknown; participantsInformed?: boolean; stt?: "server" | "local" | "wasm"; deviceId?: string | null
}

/** Every refusal here is a plain sentence the start screen shows as it is. */
export async function createSession(i: CreateInput, now = new Date()): Promise<SessionRow> {
  if (i.consentAttested !== true) throw new HalyardError("Confirm you have the permission you need to transcribe this conversation before you start.", 400, "consent_required")
  if (!(await isFlagOn("halyard_web", i.orgId))) throw new HalyardError("Halyard is not switched on yet.", 403, "off")
  const eff = await getEffective(i.orgId)
  if (!(eff.features as any).halyard) throw new HalyardError("Your plan does not include Halyard.", 402, "plan")
  if ((await getSettings(i.orgId)).requireInformed && i.participantsInformed !== true) throw new HalyardError("Your workspace requires you to tell the other participants the call is being transcribed. Confirm that you have.", 400, "inform_required")
  const mode = (MODES as readonly string[]).includes(String(i.mode)) ? String(i.mode) : "general"
  const stt = i.stt ?? "server"
  // Server transcription sends speech to the transcription provider; a workspace policy that forbids it refuses here with its own words, not later mid-call.
  if (stt === "server") await assertProviderAllowed("qwen", i.orgId).catch((e) => { throw new HalyardError(e.message, 403, "data_policy") })
  const minutes = await limitOf(i.orgId, "halyard_minutes_month" as any)
  const allowedMinutes = minutes === null || minutes === undefined ? DEFAULT_MINUTES_MONTH : minutes
  if (allowedMinutes >= 0 && (await minutesUsed(i.orgId)) >= allowedMinutes) throw new HalyardError("Your workspace has used this month's Halyard listening time. An owner can ask support to raise it.", 402, "minutes")
  await assertCan(i.orgId, "chat").catch((e) => { throw new HalyardError(e.message, 402, "allowance") })
  const live = (await limitOf(i.orgId, "halyard_sessions_live" as any)) ?? 1
  const [{ n }] = (await sql`SELECT count(*)::int AS n FROM halyard_sessions WHERE user_id = ${i.userId} AND state IN ('live','paused')`) as any[]
  if (n >= Math.max(1, live)) throw new HalyardError("You already have a Halyard session open. End it before starting another.", 409, "one_live")
  const [row] = (await sql`INSERT INTO halyard_sessions (org_id, user_id, source, mode, title, language, consent_version, consent_attested_at, participants_informed, crm_entry_id, stt, device_id, started_at)
    VALUES (${i.orgId}, ${i.userId}, ${i.source ?? "web"}, ${mode}, ${clean(i.title, 200) || null}, ${clean(i.language, 12) || null}, ${CONSENT_VERSION}, ${now.toISOString()}, ${i.participantsInformed === true}, ${i.crmEntryId ? clean(i.crmEntryId, 80) : null}, ${stt}, ${i.deviceId ? clean(i.deviceId, 80) : null}, ${now.toISOString()})
    RETURNING *`) as any[]
  return row
}

export async function retentionMonths(orgId: string): Promise<number> {
  const [r] = (await sql`SELECT retention_months FROM halyard_settings WHERE org_id = ${orgId}`) as any[]
  return r?.retention_months ?? DEFAULT_RETENTION_MONTHS
}

/** Whole audio minutes used this month, from the sessions that started this month. */
export async function minutesUsed(orgId: string): Promise<number> {
  const [r] = (await sql`SELECT COALESCE(sum(audio_seconds), 0)::int AS s FROM halyard_sessions WHERE org_id = ${orgId} AND started_at >= date_trunc('month', now())`) as any[]
  return Math.ceil((r?.s ?? 0) / 60)
}

/** The session, only if it belongs to this person in this workspace (owner access; viewers use their own route). */
export async function ownedSession(id: string, orgId: string, userId: string): Promise<SessionRow> {
  const [r] = (await sql`SELECT * FROM halyard_sessions WHERE id = ${id} AND org_id = ${orgId} AND user_id = ${userId}`) as any[]
  if (!r) throw new HalyardError("That session was not found.", 404, "not_found")
  return r
}

export async function setState(s: SessionRow, state: "live" | "paused"): Promise<SessionRow> {
  if (s.state === "ended" || s.state === "abandoned") throw new HalyardError("That session has ended.", 409, "ended")
  const [r] = (await sql`UPDATE halyard_sessions SET state = ${state} WHERE id = ${s.id} RETURNING *`) as any[]
  return r
}

const expired = (s: SessionRow, now: number) => now - new Date(s.started_at).getTime() > MAX_SESSION_HOURS * 3_600_000

export interface SegmentInput { seq: number; channel: "you" | "them" | "room"; text: string; startedMs?: number; endedMs?: number; confidence?: number; audioSeconds?: number }

/** Stores one segment. Idempotent on seq; near-duplicates of overlapping utterances are dropped; the session's size and length caps hold. */
export async function addSegment(s: SessionRow, g: SegmentInput, now = Date.now()): Promise<{ stored: boolean; reason?: "duplicate_seq" | "repeat" | "empty" | "echo" }> {
  if (s.state !== "live") throw new HalyardError(s.state === "paused" ? "The session is paused." : "That session has ended.", 409, s.state)
  await assertOn(s.org_id)
  if (expired(s, now)) throw new HalyardError("A session lasts at most four hours. Start a new one.", 409, "too_long")
  if (!Number.isInteger(g.seq) || g.seq < 0) throw new HalyardError("Segment numbers are whole numbers from 0.", 400, "bad_seq")
  if (!["you", "them", "room"].includes(g.channel)) throw new HalyardError("Unknown channel.", 400, "bad_channel")
  const text = clean(g.text, MAX_SEGMENT_CHARS)
  if (!text) return { stored: false, reason: "empty" }
  if (s.chars + text.length > MAX_TRANSCRIPT_CHARS) throw new HalyardError("This session has reached the length limit for one transcript.", 413, "too_long_text")
  const [seen] = (await sql`SELECT 1 FROM halyard_segments WHERE session_id = ${s.id} AND seq = ${g.seq}`) as any[]
  if (seen) return { stored: false, reason: "duplicate_seq" }
  const filter = createRepeatFilter()
  const recent = (await sql`SELECT channel, text_enc, started_ms FROM halyard_segments WHERE session_id = ${s.id} ORDER BY seq DESC LIMIT 6`) as any[]
  for (const r of recent.reverse()) filter.isRepeat(r.channel, decryptSecret(r.text_enc) ?? "", r.started_ms ?? 0)
  if (filter.isRepeat(g.channel, text, g.startedMs ?? 0)) return { stored: false, reason: "repeat" }
  // Without headphones the microphone hears the other side. A "you" utterance whose words are a degraded copy of a "them" utterance that just ended is that echo (the desktop's
  // echo-filter, run on text). The channels upload in order, so the "them" turn is stored before its echo arrives.
  if (g.channel === "you") {
    const echo = createEchoFilter()
    const them = (await sql`SELECT text_enc, started_ms, ended_ms FROM halyard_segments WHERE session_id = ${s.id} AND channel = 'them' ORDER BY seq DESC LIMIT 12`) as any[]
    for (const r of them.reverse()) echo.noteRemote(decryptSecret(r.text_enc) ?? "", r.ended_ms ?? r.started_ms ?? 0)
    if (echo.isEcho(text, g.startedMs ?? 0)) return { stored: false, reason: "echo" }
  }
  const inserted = (await sql`INSERT INTO halyard_segments (session_id, seq, channel, started_ms, ended_ms, text_enc, confidence)
    VALUES (${s.id}, ${g.seq}, ${g.channel}, ${g.startedMs ?? null}, ${g.endedMs ?? null}, ${encryptSecret(text)}, ${g.confidence ?? null})
    ON CONFLICT (session_id, seq) DO NOTHING RETURNING seq`) as any[]
  if (!inserted.length) return { stored: false, reason: "duplicate_seq" }
  const secs = Math.max(0, Math.round(g.audioSeconds ?? 0))
  await sql`UPDATE halyard_sessions SET chars = chars + ${text.length}, audio_seconds = audio_seconds + ${secs} WHERE id = ${s.id}`
  s.chars += text.length; s.audio_seconds += secs
  return { stored: true }
}

export interface StoredTurn extends Turn { seq: number; channel: "you" | "them" | "room"; text: string; startedMs: number | null }
export async function listTurns(sessionId: string, opts: { afterSeq?: number; limit?: number } = {}): Promise<StoredTurn[]> {
  const rows = (await sql`SELECT seq, channel, text_enc, started_ms FROM halyard_segments WHERE session_id = ${sessionId} AND seq > ${opts.afterSeq ?? -1} ORDER BY seq LIMIT ${Math.min(opts.limit ?? 5000, 20000)}`) as any[]
  return rows.map((r) => ({ seq: r.seq, channel: r.channel, text: decryptSecret(r.text_enc) ?? "", startedMs: r.started_ms })) as StoredTurn[]
}

export async function latestBrief(sessionId: string): Promise<{ version: number; uptoSeq: number; brief: string; figures: string[] } | null> {
  const [r] = (await sql`SELECT version, upto_seq, brief_enc, figures_enc FROM halyard_briefs WHERE session_id = ${sessionId} ORDER BY version DESC LIMIT 1`) as any[]
  if (!r) return null
  let figures: string[] = []
  try { figures = JSON.parse(decryptSecret(r.figures_enc) ?? "[]") } catch { /* an unreadable figure list is treated as empty */ }
  return { version: r.version, uptoSeq: r.upto_seq, brief: decryptSecret(r.brief_enc) ?? "", figures }
}

/** Ends the session: the compiled transcript's size and the call row are H5; here the state, the end time and the retention date are set. */
export async function endSession(s: SessionRow, now = new Date()): Promise<SessionRow> {
  if (s.state === "ended") return s
  const months = await retentionMonths(s.org_id)
  const del = new Date(now); del.setUTCMonth(del.getUTCMonth() + months)
  const [r] = (await sql`UPDATE halyard_sessions SET state = 'ended', ended_at = ${now.toISOString()}, delete_after = ${del.toISOString()} WHERE id = ${s.id} RETURNING *`) as any[]
  return r
}

/**
 * Deletes everything of the session and what was made from it (docs/architecture/62 section 13). The text, brief, notes, suggestions and shares go with the session (cascade); the call record
 * goes; a follow-up draft made from the call goes if it is still an unsent draft (a message already sent is a record of what went out: it stays, unlinked); proposals made from the call are
 * removed while pending, and where already decided their content is blanked (the audit line stays, saying only that a decision was made). Usage and cost rows carry no content and stay.
 */
export async function deleteSession(s: SessionRow): Promise<void> {
  const runs = [`halyard:${s.id}`, `halyard-email:${s.id}:%`]
  if (s.call_id) {
    await sql`DELETE FROM outreach_messages WHERE call_id = ${s.call_id} AND status = 'draft'`.catch(() => {})
    await sql`UPDATE outreach_messages SET call_id = NULL WHERE call_id = ${s.call_id}`.catch(() => {})
    await sql`DELETE FROM investor_calls WHERE id = ${s.call_id} AND org_id = ${s.org_id}`
  }
  await sql`DELETE FROM action_proposals WHERE org_id = ${s.org_id} AND status = 'pending' AND (run_id = ${runs[0]} OR run_id LIKE ${runs[1]})`.catch(() => {})
  await sql`UPDATE action_proposals SET input = '{}'::jsonb, diff = '[]'::jsonb, evidence = '{}'::jsonb, summary = 'Removed with the call it came from' WHERE org_id = ${s.org_id} AND (run_id = ${runs[0]} OR run_id LIKE ${runs[1]})`.catch(() => {})
  await sql`DELETE FROM halyard_sessions WHERE id = ${s.id} AND org_id = ${s.org_id}`
}

/** Marks sessions left open past the limit as abandoned (their text is kept for the person to finish), and deletes ended ones past their retention date. */
export async function sweepSessions(now = new Date()): Promise<{ abandoned: number; deleted: number }> {
  const cutoff = new Date(now.getTime() - MAX_SESSION_HOURS * 3_600_000).toISOString()
  const a = (await sql`UPDATE halyard_sessions SET state = 'abandoned', ended_at = ${now.toISOString()} WHERE state IN ('live','paused') AND started_at < ${cutoff} RETURNING id, org_id`) as any[]
  for (const r of a) {
    const months = await retentionMonths(r.org_id), del = new Date(now); del.setUTCMonth(del.getUTCMonth() + months)
    await sql`UPDATE halyard_sessions SET delete_after = ${del.toISOString()} WHERE id = ${r.id}`
  }
  const d = (await sql`DELETE FROM halyard_sessions WHERE delete_after IS NOT NULL AND delete_after < ${now.toISOString()} RETURNING id`) as any[]
  await sql`DELETE FROM halyard_uploads WHERE created_at < ${new Date(now.getTime() - 90 * 86_400_000).toISOString()}`.catch(() => {})   // health counts are kept for 90 days
  return { abandoned: a.length, deleted: d.length }
}
