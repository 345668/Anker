import "server-only"
import { sql } from "@/lib/db"
import { decideForSources, PURPOSES, type Purpose, type SourceRow, type UseDecision } from "./use-gate"

export const GATE_FLAG = "directory_use_gate"
export class DirectoryUseError extends Error {
  readonly code = "directory_use_blocked"
  constructor(message: string, readonly source: string | null) { super(message); this.name = "DirectoryUseError" }
}

let cache: { at: number; on: boolean } | null = null
export const _resetGateCache = () => { cache = null }
export async function gateOn(now = Date.now()): Promise<boolean> {
  try {
    if (!cache || now - cache.at > 30_000) {
      const [r] = (await sql`SELECT enabled FROM platform_flags WHERE key = ${GATE_FLAG}`) as any[]
      cache = { at: now, on: !!r?.enabled }
    }
    return cache.on
  } catch { return false }
}

export const normSource = (s: string | null | undefined) => (s ?? "").trim() || "unknown"

export async function getSource(source: string): Promise<(SourceRow & Record<string, any>) | null> {
  const [r] = (await sql`SELECT * FROM directory_sources WHERE source = ${normSource(source)}`) as any[]
  return r ?? null
}

export interface RegisterInput {
  source: string; label?: string | null; kind: string; supplier?: string | null; acquiredAt?: string | null
  licenceSummary: string; permittedUse: string[]; forbiddenUse?: string | null; lawfulBasisNote?: string | null; reviewedBy: string
}
export const KINDS = ["vendor_purchase", "partner_list", "customer_upload", "public_web", "webinar_signup", "seed", "crm_sync", "unknown"] as const

/** Records (or updates) what a source may be used for, making it `recorded`. A restricted or withdrawn source is refused here: lifting a restriction is a deliberate review in SAIL, never a side effect of an import form. */
export async function registerSource(i: RegisterInput): Promise<void> {
  const src = normSource(i.source)
  if (!i.licenceSummary?.trim()) throw new Error("A licence summary is required.")
  if (!i.permittedUse.length || i.permittedUse.some((p) => !(PURPOSES as readonly string[]).includes(p))) throw new Error("Permitted use must list at least one valid use.")
  if (!(KINDS as readonly string[]).includes(i.kind)) throw new Error("Unknown source kind.")
  const existing = await getSource(src)
  if (existing && (existing.status === "restricted" || existing.status === "withdrawn")) throw new Error(`Source "${src}" is ${existing.status}. Change it in the review in SAIL, Directory sources.`)
  await sql`INSERT INTO directory_sources (source, label, kind, supplier, acquired_at, licence_summary, permitted_use, forbidden_use, lawful_basis_note, status, reviewed_by, reviewed_at)
    VALUES (${src}, ${i.label ?? src}, ${i.kind}, ${i.supplier ?? null}, ${i.acquiredAt ?? null}, ${i.licenceSummary.trim()}, ${i.permittedUse}, ${i.forbiddenUse ?? null}, ${i.lawfulBasisNote ?? null}, 'recorded', ${i.reviewedBy}, now())
    ON CONFLICT (source) DO UPDATE SET label = EXCLUDED.label, kind = EXCLUDED.kind, supplier = EXCLUDED.supplier, acquired_at = EXCLUDED.acquired_at, licence_summary = EXCLUDED.licence_summary,
      permitted_use = EXCLUDED.permitted_use, forbidden_use = EXCLUDED.forbidden_use, lawful_basis_note = EXCLUDED.lawful_basis_note, reviewed_by = EXCLUDED.reviewed_by, reviewed_at = now(), updated_at = now(),
      status = 'recorded'
      WHERE directory_sources.status IN ('unreviewed', 'recorded')`
}

/** The import gate: a batch may be applied only when its source has a register row that is not withdrawn. Returns a message when it may not. */
export async function importBlockedReason(source: string): Promise<string | null> {
  const row = await getSource(source)
  if (!row) return `Source "${normSource(source)}" is not in the directory source register. Record its licence and permitted use first (SAIL, Directory sources).`
  if (row.status === "withdrawn") return `Source "${row.source}" has been withdrawn and cannot receive new rows.`
  return null
}

/** Sources through which a person (by email) is in the directory. Empty when the address is not a directory person. */
async function sourcesForEmail(email: string): Promise<Array<SourceRow | null>> {
  const e = email.trim().toLowerCase()
  const rows = (await sql`SELECT DISTINCT COALESCE(NULLIF(TRIM(i.source), ''), 'unknown') AS source, s.status, s.permitted_use
    FROM investors i LEFT JOIN directory_sources s ON s.source = COALESCE(NULLIF(TRIM(i.source), ''), 'unknown') WHERE lower(i.email) = ${e}`) as any[]
  return rows.map((r) => (r.status ? { source: r.source, status: r.status, permitted_use: r.permitted_use ?? [] } : { source: r.source, status: "unreviewed" as const, permitted_use: [] }))
}

async function sourcesForLinkedIn(url: string): Promise<Array<SourceRow | null>> {
  const { profileSlug } = await import("@/lib/compliance/suppression")
  const slug = profileSlug(url)
  if (!slug) return []
  const like = `%linkedin.com/in/${slug.slice(3)}%`
  const rows = (await sql`SELECT DISTINCT COALESCE(NULLIF(TRIM(i.source), ''), 'unknown') AS source, s.status, s.permitted_use
    FROM investors i LEFT JOIN directory_sources s ON s.source = COALESCE(NULLIF(TRIM(i.source), ''), 'unknown')
    WHERE lower(i.linkedin_url) LIKE ${like} OR lower(i.person_linkedin_url) LIKE ${like}`) as any[]
  return rows.map((r) => (r.status ? { source: r.source, status: r.status, permitted_use: r.permitted_use ?? [] } : { source: r.source, status: "unreviewed" as const, permitted_use: [] }))
}

/** The same gate for a LinkedIn target, called when an outreach action is queued. */
export async function enforceLinkedInUse(url: string, purpose: Purpose = "outreach_linkedin"): Promise<void> {
  try {
    const { profileSlug } = await import("@/lib/compliance/suppression"); const slug = profileSlug(url)
    if (slug) { const like = `%linkedin.com/in/${slug.slice(3)}%`; const [r] = (await sql`SELECT 1 AS x FROM investors WHERE restricted_at IS NOT NULL AND (lower(linkedin_url) LIKE ${like} OR lower(person_linkedin_url) LIKE ${like}) LIMIT 1`) as any[]; if (r) throw new DirectoryUseError("Not queued: this person asked us to restrict the use of their data.", null) }
  } catch (e) { if (e instanceof DirectoryUseError) throw e }
  let rows: Array<SourceRow | null>, d: UseDecision
  try { rows = await sourcesForLinkedIn(url); d = decideForSources(rows, purpose, await gateOn()) } catch { return }
  if (d.ok) return
  const sources = rows.map((r) => r!.source)
  if (d.enforce) throw new DirectoryUseError(`Not queued: ${d.reason}`, sources[0] ?? null)
  try { const { logAudit } = await import("@/lib/audit/audit-log"); await logAudit({ action: "directory.use_gate_would_block", targetType: "directory_source", targetLabel: sources.join(","), metadata: { purpose, code: d.code, sources } }) } catch { /* warn-only */ }
}

export async function checkEmailUse(email: string, purpose: Purpose): Promise<UseDecision & { sources: string[] }> {
  const rows = await sourcesForEmail(email)
  const d = decideForSources(rows, purpose, await gateOn())
  return { ...d, sources: rows.map((r) => r!.source) }
}

/**
 * Called from the outreach send gate. A refusal that is enforced throws; a refusal that is only a warning writes one audit entry (source and purpose, never the address)
 * and lets the send continue. A failure of the check itself never blocks a send.
 */
export async function enforceEmailUse(email: string, purpose: Purpose = "outreach_email"): Promise<void> {
  // A person who asked for their data to be restricted is not contacted (docs/architecture/54 D3).
  try { const [r] = (await sql`SELECT 1 AS x FROM investors WHERE lower(email) = ${email.trim().toLowerCase()} AND restricted_at IS NOT NULL LIMIT 1`) as any[]; if (r) throw new DirectoryUseError("Not sent: this person asked us to restrict the use of their data.", null) } catch (e) { if (e instanceof DirectoryUseError) throw e }
  let d: Awaited<ReturnType<typeof checkEmailUse>>
  try { d = await checkEmailUse(email, purpose) } catch { return }
  if (d.ok) return
  if (d.enforce) throw new DirectoryUseError(`Not sent: ${d.reason}`, d.sources[0] ?? null)
  try { const { logAudit } = await import("@/lib/audit/audit-log"); await logAudit({ action: "directory.use_gate_would_block", targetType: "directory_source", targetLabel: d.sources.join(","), metadata: { purpose, code: d.code, sources: d.sources } }) } catch { /* warn-only logging never blocks */ }
}
