/**
 * Export and erasure of one workspace, from the registry. docs/architecture/41 §6.
 *
 * Nothing here decides WHETHER to erase: the request flow (SAIL, then lib/tenant/requests.ts) does that. This module counts, exports and deletes
 * what the registry says, scoped by the workspace id it derives itself, with every statement parameterised.
 */
import "server-only"
import { createHash } from "node:crypto"
import { sql } from "@/lib/db"
import { RULES, BLOB_QUERIES, blobPrefixes, type Rule } from "./registry"

export interface Scope { orgId: string; orgName: string; fundId: string | null; soleMembers: string[]; ownerEmails: string[]; memberEmails: string[] }

const q = (text: string, params: unknown[]) => sql.unsafe(text, params as any[]) as Promise<any[]>
const params = (s: Scope) => [s.orgId, s.fundId, s.soleMembers]

/**
 * A rule's WHERE clause uses some of $1 workspace, $2 fund, $3 members. Postgres refuses a parameter that is passed but never used, so the clause is renumbered
 * to the ones it references, and only those are sent. Pure string work on the registry's own text, never on user input.
 */
export function bind(where: string, s: Scope): { where: string; values: unknown[] } {
  const all = params(s)
  const used = [...new Set((where.match(/\$(\d)/g) ?? []).map((m) => Number(m.slice(1))))].sort()
  const map = new Map(used.map((n, i) => [n, i + 1]))
  return { where: where.replace(/\$(\d)/g, (_, d) => `$${map.get(Number(d))}`), values: used.map((n) => all[n - 1]) }
}
const missingTable = (e: unknown) => /does not exist|undefined_table|42P01/i.test(String((e as Error)?.message ?? e))

/** The workspace, its fund, who owns it, and the members who belong to no other workspace. Null when there is no such workspace. */
export async function resolveScope(orgId: string): Promise<Scope | null> {
  const org = (await q("SELECT id, name, fund_id FROM organizations WHERE id = $1", [orgId]))[0]
  if (!org) return null
  const members = await q(`SELECT m.user_id, m.org_role, p.email, (SELECT count(*)::int FROM memberships o WHERE o.user_id = m.user_id AND o.org_id <> m.org_id) AS others
    FROM memberships m LEFT JOIN profiles p ON p.id::text = m.user_id WHERE m.org_id = $1`, [orgId])
  return {
    orgId, orgName: String(org.name ?? ""), fundId: org.fund_id ? String(org.fund_id) : null,
    soleMembers: members.filter((m) => Number(m.others) === 0).map((m) => String(m.user_id)),
    ownerEmails: members.filter((m) => ["workspace_owner", "admin"].includes(m.org_role) && m.email).map((m) => String(m.email)),
    memberEmails: members.filter((m) => m.email).map((m) => String(m.email)),
  }
}

export interface Blocker { code: string; message: string }

/** Everything that must be true before an erasure may be scheduled or run. An empty list means it may proceed. */
export async function erasureBlockers(s: Scope, opts: { isPlatformAdmin: (email: string) => boolean; protectedOrgs?: string[] }): Promise<Blocker[]> {
  const out: Blocker[] = []
  const life = (await q("SELECT state FROM tenant_lifecycle WHERE org_id = $1", [s.orgId]))[0]
  if (life?.state !== "offboarding") out.push({ code: "not_offboarding", message: "The workspace must be in the offboarding state first, so its people have lost access and the customer has been told." })
  const org = (await q("SELECT settings FROM organizations WHERE id = $1", [s.orgId]))[0]
  const settings = typeof org?.settings === "string" ? (() => { try { return JSON.parse(org.settings) } catch { return {} } })() : org?.settings ?? {}
  if (settings?.legal_hold === true) out.push({ code: "legal_hold", message: "This workspace is on legal hold." })
  if ((opts.protectedOrgs ?? []).includes(s.orgId)) out.push({ code: "protected", message: "This workspace is on the protected list." })
  if (s.memberEmails.some((e) => opts.isPlatformAdmin(e))) out.push({ code: "platform_owner", message: "A platform owner belongs to this workspace. It is Anker's own and cannot be erased from here." })
  const sub = (await q("SELECT status FROM billing_subscriptions WHERE org_id = $1", [s.orgId]).catch(() => []))[0]
  if (sub && ["active", "trialing", "past_due"].includes(String(sub.status))) out.push({ code: "subscription", message: "There is a live subscription. Cancel it first." })
  return out
}

export interface TableCount { table: string; scope: Rule["scope"]; count: number; action: "delete" | "retain" | "anonymize"; note?: string }

export async function countRows(s: Scope): Promise<TableCount[]> {
  const out: TableCount[] = []
  for (const r of RULES) {
    if (r.scope === "fund" && !s.fundId) continue
    try {
      const b = bind(r.where, s)
      const n = Number((await q(`SELECT count(*)::int AS n FROM ${r.table} WHERE ${b.where}`, b.values))[0].n)
      out.push({ table: r.table, scope: r.scope, count: n, action: r.retain ? "retain" : r.anonymize ? "anonymize" : "delete", note: r.retain })
    } catch (e) { if (!missingTable(e)) throw e }
  }
  return out
}

export const totalRows = (c: TableCount[], action?: TableCount["action"]) => c.filter((x) => !action || x.action === action).reduce((n, x) => n + x.count, 0)

/** Blob references this workspace owns, found through its own rows, plus its named prefixes. Counts only, for the dry run. */
export async function blobRefs(s: Scope): Promise<{ label: string; refs: string[] }[]> {
  const out: { label: string; refs: string[] }[] = []
  for (const b of BLOB_QUERIES) {
    if (!s.fundId) continue
    try { out.push({ label: b.label, refs: (await q(b.sql.replace("$2", "$1"), [s.fundId])).map((r) => String(r.ref)).filter(Boolean) }) } catch (e) { if (!missingTable(e)) throw e }
  }
  return out
}

/** The deal-document prefixes of this fund's deals: `deal-documents/<dealId>/`. */
export async function dealDocPrefixes(s: Scope): Promise<string[]> {
  if (!s.fundId) return []
  try { return (await q("SELECT id FROM deal_opportunities WHERE fund_id = $1", [s.fundId])).map((r) => `deal-documents/${r.id}/`) } catch { return [] }
}

export interface DryRun { takenAt: string; counts: TableCount[]; blobs: { label: string; count: number }[]; toDelete: number; toAnonymize: number; retained: number; digest: string }

export async function dryRun(s: Scope): Promise<DryRun> {
  const counts = await countRows(s)
  const blobs = (await blobRefs(s)).map((b) => ({ label: b.label, count: b.refs.length }))
  const toDelete = totalRows(counts, "delete"), toAnonymize = totalRows(counts, "anonymize"), retained = totalRows(counts, "retain")
  const digest = createHash("sha256").update(JSON.stringify(counts.map((c) => [c.table, c.count]))).digest("hex").slice(0, 16)
  return { takenAt: new Date().toISOString(), counts, blobs, toDelete, toAnonymize, retained, digest }
}

/** The data may not have grown much since the dry run was approved, or the approval no longer describes what would be deleted. */
export function driftOk(before: TableCount[], now: TableCount[]): { ok: boolean; reason?: string } {
  const was = new Map(before.map((c) => [c.table, c.count]))
  let extra = 0
  for (const c of now) {
    const b = was.get(c.table) ?? 0
    if (c.count > b) extra += c.count - b
  }
  const total = totalRows(before, "delete") || 1
  if (extra > Math.max(100, Math.ceil(total * 0.05))) return { ok: false, reason: `${extra} more rows than the approved dry run. Take a new dry run and approve it again.` }
  return { ok: true }
}

export interface ErasureResult { counts: { table: string; deleted: number; action: string }[]; blobsDeleted: number; skippedTables: string[] }

async function deleteBlobs(refs: string[], prefixes: string[]): Promise<number> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return 0
  const blob = await import("@vercel/blob")
  let n = 0
  const ours = (u: string) => /^https:\/\/[a-z0-9-]+\.(public|private)\.blob\.vercel-storage\.com\//i.test(u) || !/^https?:/i.test(u)
  const single = refs.filter(ours)
  for (let i = 0; i < single.length; i += 100) { try { await blob.del(single.slice(i, i + 100), { token }); n += Math.min(100, single.length - i) } catch (e) { console.warn("[erasure] blob delete failed:", (e as Error).message) } }
  for (const prefix of prefixes) {
    let cursor: string | undefined
    do {
      const page = await blob.list({ prefix, cursor, limit: 500, token })
      if (page.blobs.length) { await blob.del(page.blobs.map((b) => b.url), { token }); n += page.blobs.length }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
  }
  return n
}

/**
 * Delete the workspace's data in registry order and remove its files. Idempotent: a second run finds nothing left. A failure partway stops the run
 * and throws; what was already deleted stays deleted, and the request can be run again.
 */
export async function eraseWorkspace(s: Scope, requestId: string, requestedBy: string | null): Promise<ErasureResult> {
  const refs = (await blobRefs(s)).flatMap((b) => b.refs)
  const prefixes = [...blobPrefixes(s.orgId), ...(await dealDocPrefixes(s))]
  const counts: ErasureResult["counts"] = []
  const skipped: string[] = []
  // The tombstone is written first: the fact of the erasure must exist even if the run is interrupted. It holds no customer content.
  await q(`INSERT INTO tenant_tombstones (org_id, org_name_hash, request_id, requested_by, status) VALUES ($1, $2, $3, $4, 'started')
    ON CONFLICT (request_id) DO UPDATE SET status = 'started'`, [s.orgId, createHash("sha256").update(s.orgName).digest("hex"), requestId, requestedBy])
  for (const r of RULES) {
    if (r.retain) continue
    if (r.scope === "fund" && !s.fundId) continue
    try {
      const b = bind(r.where, s)
      const text = r.anonymize
        ? `WITH d AS (UPDATE ${r.table} SET ${r.anonymize} WHERE ${b.where} RETURNING 1) SELECT count(*)::int AS n FROM d`
        : `WITH d AS (DELETE FROM ${r.table} WHERE ${b.where} RETURNING 1) SELECT count(*)::int AS n FROM d`
      const n = Number((await q(text, b.values))[0].n)
      counts.push({ table: r.table, deleted: n, action: r.anonymize ? "anonymized" : "deleted" })
    } catch (e) { if (missingTable(e)) skipped.push(r.table); else throw new Error(`${r.table}: ${(e as Error).message}`) }
  }
  const blobsDeleted = await deleteBlobs(refs, prefixes)
  // The control-plane rows for a workspace that no longer exists. The lifecycle events stay as the audit trail.
  await q("DELETE FROM tenant_entitlements WHERE org_id = $1", [s.orgId])
  await q("DELETE FROM tenant_lifecycle WHERE org_id = $1", [s.orgId])
  await q(`UPDATE tenant_tombstones SET status = 'done', executed_at = now(), counts = $2::jsonb WHERE request_id = $1`, [requestId, JSON.stringify({ rows: counts.filter((c) => c.deleted > 0), blobsDeleted })])
  return { counts, blobsDeleted, skippedTables: skipped }
}

// ── export ──────────────────────────────────────────────────────────────

export const EXPORT_ROW_CAP = 250_000
export const EXPORT_BYTES_CAP = 120 * 1024 * 1024

export interface ExportResult { zip: Uint8Array; manifest: any; bytes: number }

/** Every registry table for the workspace as JSON, minus secrets, with a manifest. Retained tables are included (they are the customer's records too). */
export async function buildExport(s: Scope): Promise<ExportResult> {
  const { zipSync, strToU8 } = await import("fflate")
  const files: Record<string, Uint8Array> = {}
  const tables: { table: string; rows: number; truncated: boolean; scope: string; note?: string }[] = []
  let bytes = 0
  for (const r of RULES) {
    if (r.scope === "fund" && !s.fundId) continue
    // The workspace's own record and its member list are exported as data; the secrets inside them never are.
    try {
      const b = bind(r.where, s)
      const rows = await q(`SELECT * FROM ${r.table} WHERE ${b.where} LIMIT ${EXPORT_ROW_CAP + 1}`, b.values)
      const truncated = rows.length > EXPORT_ROW_CAP
      const secret = new Set(r.secret ?? [])
      const clean = (truncated ? rows.slice(0, EXPORT_ROW_CAP) : rows).map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !secret.has(k))))
      if (!clean.length) continue
      const data = strToU8(JSON.stringify(clean, null, 1))
      bytes += data.length
      if (bytes > EXPORT_BYTES_CAP) throw new Error("The export is larger than the automatic limit. Contact support to arrange it by another route.")
      files[`data/${r.table}.json`] = data
      tables.push({ table: r.table, rows: clean.length, truncated, scope: r.scope, ...(r.retain ? { note: "Also kept by Anker for the statutory retention period." } : {}) })
    } catch (e) { if (!missingTable(e)) throw e }
  }
  const blobs = (await blobRefs(s)).map((b) => ({ label: b.label, files: b.refs.length }))
  const manifest = {
    workspace: { id: s.orgId, name: s.orgName }, generatedAt: new Date().toISOString(),
    contents: "One JSON file per table, secrets (tokens, API keys, password material) removed. Dates are UTC.",
    tables, files: blobs,
    notice: "Uploaded documents (decks, data room files, reports) are listed by count here; ask support for a bundle of the files themselves.",
  }
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2))
  files["README.txt"] = strToU8(`Export of the workspace "${s.orgName}" generated ${manifest.generatedAt}.\nOpen manifest.json first: it lists every table and how many rows it holds.\nEach file in data/ is a JSON array of rows.\n`)
  const zip = zipSync(files, { level: 6 })
  return { zip, manifest, bytes: zip.length }
}
