import "server-only"
import { randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/lib/db/secrets"
import { saveCall } from "@/lib/calls/records"
import { CallError, type CallScope } from "@/lib/calls/access"
import { MAX_TRANSCRIPT } from "@/lib/calls/contracts"
import { resolveAiPrincipal } from "@/lib/assistant/principal"
import type { LinkRow } from "./links"

/**
 * What a person sent, held while they choose (docs/architecture/57, T3), and saving it as a CALL NOTE: the same library Call Intelligence and the Halyard desktop app write to
 * (`investor_calls`), so a voice note from a phone and a call captured on a laptop sit side by side and are analysed the same way. Nothing here needs Halyard to be running.
 */
export const PENDING_TTL_MIN = 60
const plain = (m: string) => Object.assign(new Error(m), { plain: true })

export async function stashPending(link: LinkRow, kind: "voice" | "file", title: string, text: string): Promise<string> {
  if (!process.env.SECRET_KEY) throw new Error("SECRET_KEY is required to hold a message")
  const id = randomUUID()
  await sql`INSERT INTO telegram_pending (id, link_id, org_id, kind, title, text_enc) VALUES (${id}, ${link.id}, ${link.org_id}, ${kind}, ${title.slice(0, 200)}, ${encryptSecret(text)})`
  return id
}

export interface Pending { id: string; kind: "voice" | "file"; title: string; text: string }
/** The held item, only for the device that sent it and only while it has not expired. */
export async function readPending(link: LinkRow, id: string): Promise<Pending | null> {
  const [r] = (await sql`SELECT id, kind, title, text_enc FROM telegram_pending WHERE id = ${id} AND link_id = ${link.id} AND expires_at > now()`) as any[]
  const text = r ? decryptSecret(r.text_enc) : null
  return r && text ? { id: r.id, kind: r.kind, title: r.title, text } : null
}
export async function dropPending(link: LinkRow, id: string): Promise<void> { await sql`DELETE FROM telegram_pending WHERE id = ${id} AND link_id = ${link.id}` }
export async function sweepPending(): Promise<number> { return ((await sql`DELETE FROM telegram_pending WHERE expires_at < now() RETURNING id`) as any[]).length }

/** Saves a held voice note or document text as a call note. Needs a device that may make changes and a person who can write. Idempotent: a second tap saves nothing more. */
export async function saveAsCallNote(link: LinkRow, id: string): Promise<{ title: string; duplicate: boolean }> {
  if (link.mode !== "write") throw plain("This device is read-only. Allow changes in Anker, Connected channels, to save notes from here.")
  const p = await readPending(link, id)
  if (!p) throw plain("That has expired. Send it again.")
  const principal = await resolveAiPrincipal(link.user_id, { orgId: link.org_id }).catch(() => null)
  if (!principal?.canWrite || !principal.orgId) throw plain("You can't save notes in this workspace.")
  if (p.text.length > MAX_TRANSCRIPT) throw plain(`That is longer than a note can be (${MAX_TRANSCRIPT.toLocaleString("en")} characters). Ask me to summarise it, then save the summary.`)
  if (p.text.trim().length < 20) throw plain("That is too short to save as a note.")
  const [o] = (await sql`SELECT name FROM organizations WHERE id = ${link.org_id}`) as any[]
  const scope: CallScope = { userId: link.user_id, orgId: link.org_id, persona: principal.persona, writable: true, workspace: o?.name ?? "" }
  try {
    const r = await saveCall(scope, { title: p.title, transcript: p.text, externalId: p.id, occurredAt: new Date().toISOString(), consent: true }, "telegram")
    await dropPending(link, id)
    return { title: p.title, duplicate: r.duplicate }
  } catch (e) { if (e instanceof CallError) throw plain(e.message); throw e }
}
