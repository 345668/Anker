import "server-only"
import { sql } from "@/lib/db"
import { decryptSecret } from "@/lib/db/secrets"
import { latestBrief, listTurns } from "./sessions"

/**
 * Everything Halyard holds about a person's own calls, in one JSON document (docs/architecture/62 section 13). The workspace export and erasure leave the encrypted columns out on purpose
 * (a colleague's call is not the workspace's to export); this is the person's own route to them: every session with its consent record, transcript, brief, figures, every version of the
 * notes, the suggestions shown, who it was shared with, and their saved preparation notes.
 */
export async function exportPersonalData(orgId: string, userId: string, onlyId?: string) {
  const sessions = (onlyId
    ? await sql`SELECT * FROM halyard_sessions WHERE org_id = ${orgId} AND user_id = ${userId} AND id = ${onlyId}`
    : await sql`SELECT * FROM halyard_sessions WHERE org_id = ${orgId} AND user_id = ${userId} ORDER BY started_at DESC LIMIT 500`) as any[]
  const out = []
  for (const s of sessions) {
    const [turns, brief] = [await listTurns(s.id, { limit: 20000 }), await latestBrief(s.id)]
    const notes = ((await sql`SELECT version, edited_by, created_at, body_enc FROM halyard_notes WHERE session_id = ${s.id} ORDER BY version`) as any[]).map((n) => { let body: unknown = null; try { body = JSON.parse(decryptSecret(n.body_enc) ?? "null") } catch { /* unreadable version */ } return { version: n.version, by: n.edited_by, at: n.created_at, body } })
    const suggestions = ((await sql`SELECT action, requested_at, total_ms, model, text_enc, used, rating FROM halyard_suggestions WHERE session_id = ${s.id} ORDER BY requested_at`) as any[]).map((r) => ({ action: r.action, at: r.requested_at, ms: r.total_ms, model: r.model, text: decryptSecret(r.text_enc), used: r.used, rating: r.rating }))
    const shared = ((await sql`SELECT viewer_user_id, revoked_at FROM halyard_viewers WHERE session_id = ${s.id}`) as any[]).map((v) => ({ userId: v.viewer_user_id, withdrawn: !!v.revoked_at }))
    out.push({
      id: s.id, title: s.title, mode: s.mode, language: s.language, source: s.source, state: s.state, startedAt: s.started_at, endedAt: s.ended_at, deleteAfter: s.delete_after, audioSeconds: s.audio_seconds, callId: s.call_id, crmEntryId: s.crm_entry_id,
      consent: { attestedAt: s.consent_attested_at, participantsInformed: s.participants_informed, version: s.consent_version },
      transcript: turns.map((t) => ({ seq: t.seq, channel: t.channel, atMs: t.startedMs, text: t.text })), brief: brief ? { text: brief.brief, figures: brief.figures } : null, notes, suggestions, sharedWith: shared,
    })
  }
  const prep = ((await sql`SELECT mode, context_enc, updated_at FROM halyard_prep WHERE org_id = ${orgId} AND user_id = ${userId}`) as any[]).map((p) => ({ mode: p.mode, text: decryptSecret(p.context_enc), updatedAt: p.updated_at }))
  return { exportedAt: new Date().toISOString(), note: "Audio is never stored, so there is none to export.", sessions: out, preparation: prep }
}
