import "server-only"
import { randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/lib/db/secrets"
import type { LinkRow } from "./links"

/**
 * What a person sent by voice, held for an hour while they choose to ask Anker about it or discard it (docs/architecture/57 T3, 62 H0). A voice note is only ever a question: it
 * is never saved as a call note from Telegram; call notes come from Halyard or from Call notes in Anker.
 */
export const PENDING_TTL_MIN = 60

export async function stashPending(link: LinkRow, kind: "voice", title: string, text: string): Promise<string> {
  if (!process.env.SECRET_KEY) throw new Error("SECRET_KEY is required to hold a message")
  const id = randomUUID()
  await sql`INSERT INTO telegram_pending (id, link_id, org_id, kind, title, text_enc) VALUES (${id}, ${link.id}, ${link.org_id}, ${kind}, ${title.slice(0, 200)}, ${encryptSecret(text)})`
  return id
}

export interface Pending { id: string; kind: "voice"; title: string; text: string }
/** The held item, only for the device that sent it and only while it has not expired. */
export async function readPending(link: LinkRow, id: string): Promise<Pending | null> {
  const [r] = (await sql`SELECT id, kind, title, text_enc FROM telegram_pending WHERE id = ${id} AND link_id = ${link.id} AND expires_at > now()`) as any[]
  const text = r ? decryptSecret(r.text_enc) : null
  return r && text ? { id: r.id, kind: r.kind, title: r.title, text } : null
}
export async function dropPending(link: LinkRow, id: string): Promise<void> { await sql`DELETE FROM telegram_pending WHERE id = ${id} AND link_id = ${link.id}` }
export async function sweepPending(): Promise<number> { return ((await sql`DELETE FROM telegram_pending WHERE expires_at < now() RETURNING id`) as any[]).length }
