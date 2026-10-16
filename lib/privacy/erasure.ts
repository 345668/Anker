import "server-only"
import { sql } from "@/lib/db"
import { PERSON_REFS } from "@/lib/directory/person-registry"
import { eraseRows } from "@/lib/directory/maintenance"
import { allowedIds, loadHandled, tombstoneIdentity, DsarError, PRIVACY_ADDRESS } from "./dsar"

/**
 * Erasure of a directory person on request (docs/architecture/54, D4). Always previewed first. Order: count the workspace copies, stop all contact, write the tombstones, remove or
 * anonymise (the same routine the sweep and the purge use), tell each workspace once, close the request. Safe to repeat: tombstones and notices are not duplicated.
 * Workspace copies are not rewritten; the workspace is the controller of its own copy.
 */
const counts = async (table: string, column: string, ids: string[]) => Number(((await sql.unsafe(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}::text = ANY($1::text[])`, [ids])) as any[])[0]?.n ?? 0)

export async function previewErasure(id: string, ids: string[] = []) {
  const { r, d } = await loadHandled(id)
  if (r.kind !== "erasure") throw new DsarError("This is not an erasure request.")
  const use = await allowedIds(d, ids)
  const byTable = []
  for (const ref of PERSON_REFS) { const n = use.length ? await counts(ref.table, ref.column, use) : 0; if (n) byTable.push({ table: ref.table, column: ref.column, owner: ref.owner, fate: ref.fate, rows: n }) }
  const keepRefs = PERSON_REFS.filter((x) => x.fate === "keep")
  const kept = use.length ? (await sql.unsafe(`SELECT count(*)::int AS n FROM investors i WHERE i.id = ANY($1::text[]) AND (${keepRefs.map((x) => `EXISTS (SELECT 1 FROM ${x.table} x WHERE x.${x.column}::text = i.id)`).join(" OR ")})`, [use])) as any[] : [{ n: 0 }]
  const orgs = await workspaceCopies(use)
  return { people: use.length, wouldDelete: use.length - Number(kept[0].n), wouldAnonymise: Number(kept[0].n), workspacesToTell: orgs.size, byTable }
}

/** For each workspace, how many of its records point at these people. */
export async function workspaceCopies(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!ids.length) return out
  for (const ref of PERSON_REFS.filter((x) => x.orgColumn)) {
    const rows = (await sql.unsafe(`SELECT ${ref.orgColumn} AS org, count(*)::int AS n FROM ${ref.table} WHERE ${ref.column}::text = ANY($1::text[]) AND ${ref.orgColumn} IS NOT NULL GROUP BY 1`, [ids])) as any[]
    for (const x of rows) out.set(String(x.org), Math.max(out.get(String(x.org)) ?? 0, Number(x.n)))
  }
  return out
}

async function tellWorkspaces(requestId: string, copies: Map<string, number>): Promise<{ told: number; mailed: number }> {
  let told = 0, mailed = 0
  const { sendEmail } = await import("@/lib/email/resend")
  for (const [org, n] of copies) {
    const fresh = (await sql`INSERT INTO directory_erasure_notices (request_id, org_id, records) VALUES (${requestId}, ${org}, ${n}) ON CONFLICT DO NOTHING RETURNING org_id`) as any[]
    if (!fresh.length) continue
    told++
    const owners = (await sql`SELECT DISTINCT p.email FROM memberships m JOIN profiles p ON p.id::text = m.user_id WHERE m.org_id = ${org} AND m.org_role IN ('workspace_owner','admin') AND p.email IS NOT NULL`) as any[]
    let sent = 0
    for (const o of owners) {
      try {
        await sendEmail({ to: String(o.email), purpose: "transactional", noTracking: true, via: "privacy-erasure-notice", replyTo: PRIVACY_ADDRESS, subject: "A person in your CRM asked Anker to erase their data",
          text: `${n} record${n === 1 ? "" : "s"} in your workspace's CRM came from Anker's investor directory, and the person has asked Anker to erase their data and stop contacting them.\n\nWe have removed them from the directory and Anker will not contact them. Your own copy is yours: we have not changed it. Please review it and, if you hold no other lawful reason to keep it, delete it, and do not contact the person.\n\nWe do not name the person in this message. Questions: ${PRIVACY_ADDRESS}` })
        sent++
      } catch { /* the notice row is recorded; a failed mail is counted */ }
    }
    mailed += sent
    await sql`UPDATE directory_erasure_notices SET mailed = ${sent} WHERE request_id = ${requestId} AND org_id = ${org}`
  }
  return { told, mailed }
}

export async function carryOutErasure(id: string, op: string, ids: string[], confirm: boolean) {
  const { r, d } = await loadHandled(id)
  if (r.kind !== "erasure") throw new DsarError("This is not an erasure request.")
  if (!confirm) throw new DsarError("Review the preview and confirm before erasing.")
  const use = await allowedIds(d, ids)
  const rows = use.length ? ((await sql`SELECT linkedin_url, person_linkedin_url FROM investors WHERE id = ANY(${use}::text[])`) as any[]) : []
  const copies = await workspaceCopies(use)
  const { suppressEverywhere } = await import("@/lib/compliance/suppression")
  const sup = await suppressEverywhere({ email: d.email, reason: "erasure", source: "dsar" })
  const tombstones = await tombstoneIdentity(id, "erasure", d.email, rows)
  const er = await eraseRows(use)
  const told = await tellWorkspaces(id, copies)
  const outcome = { erased: { people: use.length, deleted: er.deleted, anonymised: er.anonymised, tombstones, suppressedEmails: sup.emails, suppressedLinkedIn: sup.linkedin, workspacesTold: told.told, noticesMailed: told.mailed } }
  await sql`UPDATE dsar_requests SET status = 'done', closed_at = now(), handled_by = ${op}, outcome = ${JSON.stringify(outcome)}::jsonb WHERE id = ${id}`
  try {
    const { sendEmail } = await import("@/lib/email/resend")
    await sendEmail({ to: d.email, purpose: "transactional", noTracking: true, via: "privacy-request", replyTo: PRIVACY_ADDRESS, subject: "Your data has been erased from Anker's directory",
      text: `We have erased the data we held about this address in our investor directory, and we will not contact you again. We keep only an irreversible code so you are not added again.\n\nCompanies that use Anker may keep their own records of you; we have told them of your request. Backups are overwritten in the normal rotation.\n\nQuestions: ${PRIVACY_ADDRESS}` })
  } catch { /* done either way */ }
  return outcome.erased
}
