import "server-only"
import { sql } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/db/secrets"
import { assertCan } from "@/lib/metering/allowance"
import { generateDetailed } from "@/lib/ai/provider"
import { extractNoteFigures, generateNotes, generateEmail, splitTranscript, NoteGenerationError, type ModelFn, type Notes, bodyFor } from "./core"
import { HalyardError, listTurns, type SessionRow } from "./sessions"
import { skillFor, prepFor } from "./brain"

/** Notes and the drafts (docs/architecture/62 section 9). Notes are versioned rows; a person's edit is never overwritten by a later AI draft: the draft is returned beside it. */
export interface Figure { value: string; context: string; who: string }
export interface NotesBody extends Notes { figures: Figure[]; email: string }
export interface StoredNotes { version: number; by: "user" | "ai"; createdAt: string; body: NotesBody }
const MAX_ITEMS = 200, MAX_ITEM = 2000

const list = (v: unknown): string[] => (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim().slice(0, MAX_ITEM)).filter(Boolean).slice(0, MAX_ITEMS)
export function cleanBody(raw: any): NotesBody {
  const figures: Figure[] = (Array.isArray(raw?.figures) ? raw.figures : []).slice(0, 100).map((f: any) => ({ value: String(f?.value ?? "").slice(0, 80), context: String(f?.context ?? "").slice(0, 600), who: String(f?.who ?? "").slice(0, 20) })).filter((f: Figure) => f.value)
  return { summary: String(raw?.summary ?? "").trim().slice(0, 4000), keyPoints: list(raw?.keyPoints), decisions: list(raw?.decisions), actionItems: list(raw?.actionItems), followUp: list(raw?.followUp), figures, email: String(raw?.email ?? "").slice(0, 8000) }
}

export async function latestNotes(sessionId: string): Promise<StoredNotes | null> {
  const [r] = (await sql`SELECT version, edited_by, created_at, body_enc FROM halyard_notes WHERE session_id = ${sessionId} ORDER BY version DESC LIMIT 1`) as any[]
  if (!r) return null
  try { return { version: r.version, by: r.edited_by === "ai" ? "ai" : "user", createdAt: r.created_at, body: cleanBody(JSON.parse(decryptSecret(r.body_enc) ?? "{}")) } } catch { return null }
}
export async function saveNotes(s: Pick<SessionRow, "id">, body: unknown, by: "user" | "ai"): Promise<StoredNotes> {
  const clean = cleanBody(body)
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await latestNotes(s.id), version = (cur?.version ?? 0) + 1
    const done = (await sql`INSERT INTO halyard_notes (session_id, version, body_enc, edited_by) VALUES (${s.id}, ${version}, ${encryptSecret(JSON.stringify(clean))}, ${by}) ON CONFLICT (session_id, version) DO NOTHING RETURNING version`) as any[]
    if (done.length) return { version, by, createdAt: new Date().toISOString(), body: clean }
  }
  throw new HalyardError("The notes changed while saving. Try again.", 409, "conflict")
}

const stamp = (ms: number | null) => (ms == null ? "" : `[${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}] `)
/** The whole transcript as the notetaker reads it: one line per turn, "You" and "Them" (a single-microphone room has no speaker label), with the time said. */
export async function compileTranscript(sessionId: string): Promise<string> {
  const turns = await listTurns(sessionId, { limit: 20000 })
  return turns.map((t) => `${stamp(t.startedMs)}${t.channel === "you" ? "You: " : t.channel === "them" ? "Them: " : "Speaker: "}${t.text}`).join("\n")
}

const GENERAL_NOTES_FOCUS = "decisions, commitments, figures, dates and who owns what"
const GENERAL_EMAIL_GUIDE = "A short, friendly follow-up from the user to the other side: thank them, restate what was agreed in one or two lines, list the next steps with owners and dates exactly as in the notes, and anything the user promised to send. Under 150 words."
const sectionFor = (skill: ReturnType<typeof skillFor>, action: string) => (skill?.sections ?? []).filter((x) => x.actions.includes(action) && x.text).map((x) => x.text).join("\n\n")
export async function notesContext(s: SessionRow): Promise<string> {
  const skill = skillFor(s.mode), label = skill ? skill.mode || skill.title : "General", prep = await prepFor(s), guide = sectionFor(skill, "notes")
  return `Call type: ${label}.\nIn this kind of call, pay particular attention to: ${skill?.notesFocus || GENERAL_NOTES_FOCUS}` + (guide ? `\n\n=== How to take notes on this kind of call ===\n${guide}` : "") +
    (prep ? `\n\n=== Pre-call notes (spelling and name reference only) ===\nUse these only to spell names, companies and terms correctly. Never add a fact, figure or commitment to the notes unless it appears in the transcript.\n${prep}` : "")
}
export async function emailContext(s: SessionRow): Promise<string> {
  const skill = skillFor(s.mode); return `Call type: ${skill ? skill.mode || skill.title : "General"}.\n\n=== The email to write ===\n${sectionFor(skill, "email") || GENERAL_EMAIL_GUIDE}`
}

/** The real model, through the workspace's own routing, policy and allowance. */
export const defaultNotesModel: ModelFn = async ({ system, text, maxTokens }) => {
  const r = await generateDetailed(system + "\n\n" + text, { task: "halyard_notes", maxTokens })
  if (!r.text) throw new NoteGenerationError(r.error ? "The assistant could not write that just now. Try again in a moment." : "The assistant returned nothing. Try again.")
  return r.text
}
const asHalyard = (e: unknown): never => { if (e instanceof NoteGenerationError) throw new HalyardError(e.message, /timed out/.test(e.message) ? 504 : 422, "draft"); throw e }

export type DraftResult = { saved: true; notes: StoredNotes } | { saved: false; draft: NotesBody; current: StoredNotes }
/**
 * Drafts notes from the whole transcript (chunked when long) and puts the figures in by code. If the person has edited the notes, the draft is NOT saved over them: it is returned
 * beside the current version for them to compare and apply.
 */
export async function draftNotes(s: SessionRow, model: ModelFn = defaultNotesModel, onProgress?: (p: number, of: number) => void): Promise<DraftResult> {
  const transcript = await compileTranscript(s.id)
  if (!transcript.trim()) throw new HalyardError("There is no transcript to draft notes from yet.", 422, "no_transcript")
  await assertCan(s.org_id, "chat", splitTranscript(transcript).length + 1).catch((e) => { throw new HalyardError(e.message, 402, "allowance") })
  const notes = await generateNotes(model, transcript, await notesContext(s), { onProgress }).catch(asHalyard)
  const draft = cleanBody({ ...notes, figures: extractNoteFigures(transcript), email: "" })
  const cur = await latestNotes(s.id)
  if (cur && cur.by === "user") return { saved: false, draft: { ...draft, email: cur.body.email }, current: cur }
  return { saved: true, notes: await saveNotes(s, { ...draft, email: cur?.body.email ?? "" }, "ai") }
}
/** A follow-up email from the saved notes only. It is a draft: sending is a person's act under the existing send rules. */
export async function draftEmailFromNotes(s: SessionRow, model: ModelFn = defaultNotesModel): Promise<StoredNotes> {
  const cur = await latestNotes(s.id)
  if (!cur || !(cur.body.summary || cur.body.keyPoints.length || cur.body.decisions.length || cur.body.actionItems.length || cur.body.followUp.length)) throw new HalyardError("Write or draft the notes first; the email is written from them.", 422, "no_notes")
  await assertCan(s.org_id, "chat").catch((e) => { throw new HalyardError(e.message, 402, "allowance") })
  const { email } = await generateEmail(model, { title: s.title || "Call", ...cur.body }, await emailContext(s)).catch(asHalyard)
  return saveNotes(s, { ...cur.body, email }, cur.by)
}
