/**
 * Key rotation (docs/architecture/74 section 3). Re-encrypts, with the current `SECRET_KEY`, everything that was written under an older key: the three tables of encrypted files and the
 * personal-data text columns below. Each file's stored SHA-256 is checked against its decrypted bytes before it is replaced, and the new ciphertext is read back before the old one is
 * overwritten; a row that fails either check is left alone and reported. Idempotent: a second run finds everything current.
 *
 * Other places that use `SECRET_KEY` (API keys saved in settings, the privacy-request store) keep working through `SECRET_KEY_PREVIOUS`; add them to TEXT_TARGETS or re-save them before retiring the old key.
 */
import { createHash } from "node:crypto"
import { sql } from "@/lib/db"
import { bytesKeyState, decryptBytes, decryptSecret, encryptBytes, encryptSecret, secretKeyState } from "@/lib/db/secrets"

interface BytesTarget { table: string; idCol: string; col: string; shaCol: string }
interface TextTarget { table: string; idCol: string; col: string }
export const BYTES_TARGETS: BytesTarget[] = [
  { table: "passport_documents", idCol: "id", col: "content_enc", shaCol: "sha256" },
  { table: "kyc_document_files", idCol: "id", col: "content_enc", shaCol: "sha256" },
  { table: "relationship_attachments", idCol: "id", col: "content_enc", shaCol: "sha256" },
]
export const TEXT_TARGETS: TextTarget[] = [
  { table: "lp_verification", idCol: "lp_id", col: "owners_enc" },
  { table: "lp_onboarding_details", idCol: "lp_id", col: "tax_id_enc" },
  { table: "telegram_pending", idCol: "id", col: "text_enc" },
  { table: "telegram_updates", idCol: "id", col: "payload_enc" },
  { table: "telegram_bots", idCol: "id", col: "token_enc" },
]

export interface TargetReport { target: string; rotated: number; alreadyCurrent: number; failed: Array<{ id: string; why: string }>; missing?: boolean }
const BATCH = 200
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex")
const ident = (s: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error("bad identifier"); return s }

async function* rows(table: string, idCol: string, cols: string): AsyncGenerator<any> {
  let last = ""
  for (;;) {
    const batch = (await sql.unsafe(`SELECT ${ident(idCol)}::text AS id_text, ${cols} FROM ${ident(table)} WHERE ${ident(idCol)}::text > $1 ORDER BY ${ident(idCol)}::text LIMIT ${BATCH}`, [last])) as any[]
    if (!batch.length) return
    for (const r of batch) yield r
    last = String(batch[batch.length - 1].id_text)
  }
}

async function rotateBytes(t: BytesTarget, dryRun: boolean): Promise<TargetReport> {
  const rep: TargetReport = { target: `${t.table}.${t.col}`, rotated: 0, alreadyCurrent: 0, failed: [] }
  try {
    for await (const r of rows(t.table, t.idCol, `${ident(t.col)} AS blob, ${ident(t.shaCol)} AS sha`)) {
      const stored = r.blob ? Buffer.from(r.blob) : Buffer.alloc(0)
      if (stored.length === 0) continue                                                   // wiped on purpose
      const state = bytesKeyState(stored)
      if (state === "current") { rep.alreadyCurrent++; continue }
      if (state === "unreadable") { rep.failed.push({ id: r.id_text, why: "cannot be read with any key held" }); continue }
      const plain = decryptBytes(stored)!
      if (r.sha && sha(plain) !== String(r.sha)) { rep.failed.push({ id: r.id_text, why: "decrypted bytes do not match the stored fingerprint" }); continue }
      if (dryRun) { rep.rotated++; continue }
      const next = encryptBytes(plain)
      const back = decryptBytes(next)
      if (!back || !back.equals(plain)) { rep.failed.push({ id: r.id_text, why: "the new ciphertext did not read back" }); continue }
      const done = (await sql.unsafe(`UPDATE ${ident(t.table)} SET ${ident(t.col)} = $1 WHERE ${ident(t.idCol)}::text = $2 AND ${ident(t.col)} = $3 RETURNING 1 AS ok`, [next, r.id_text, stored])) as any[]
      if (done.length) rep.rotated++; else rep.failed.push({ id: r.id_text, why: "changed while rotating; run again" })
    }
  } catch (e: any) { if (/does not exist/i.test(String(e?.message))) return { ...rep, missing: true }; throw e }
  return rep
}

async function rotateText(t: TextTarget, dryRun: boolean): Promise<TargetReport> {
  const rep: TargetReport = { target: `${t.table}.${t.col}`, rotated: 0, alreadyCurrent: 0, failed: [] }
  try {
    for await (const r of rows(t.table, t.idCol, `${ident(t.col)} AS val`)) {
      const stored = r.val == null ? "" : String(r.val)
      const state = secretKeyState(stored)
      if (state === "plain" || state === "current") { if (stored) rep.alreadyCurrent++; continue }
      if (state === "unreadable") { rep.failed.push({ id: r.id_text, why: "cannot be read with any key held" }); continue }
      const plain = decryptSecret(stored)
      if (plain == null) { rep.failed.push({ id: r.id_text, why: "could not be decrypted" }); continue }
      if (dryRun) { rep.rotated++; continue }
      const next = encryptSecret(plain)
      if (!next || decryptSecret(next) !== plain) { rep.failed.push({ id: r.id_text, why: "the new value did not read back" }); continue }
      const done = (await sql.unsafe(`UPDATE ${ident(t.table)} SET ${ident(t.col)} = $1 WHERE ${ident(t.idCol)}::text = $2 AND ${ident(t.col)} = $3 RETURNING 1 AS ok`, [next, r.id_text, stored])) as any[]
      if (done.length) rep.rotated++; else rep.failed.push({ id: r.id_text, why: "changed while rotating; run again" })
    }
  } catch (e: any) { if (/does not exist/i.test(String(e?.message))) return { ...rep, missing: true }; throw e }
  return rep
}

export async function rotateKeys(opts: { dryRun?: boolean } = {}): Promise<{ dryRun: boolean; reports: TargetReport[]; clean: boolean }> {
  if (!process.env.SECRET_KEY) throw new Error("SECRET_KEY is not set")
  const dryRun = opts.dryRun !== false
  const reports: TargetReport[] = []
  for (const t of BYTES_TARGETS) reports.push(await rotateBytes(t, dryRun))
  for (const t of TEXT_TARGETS) reports.push(await rotateText(t, dryRun))
  return { dryRun, reports, clean: reports.every((r) => r.failed.length === 0) }
}
