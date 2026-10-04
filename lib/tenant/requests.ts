/**
 * Export and erasure requests: the flow around the executor. docs/architecture/41 §6.
 *
 *   export:   request -> build -> private storage -> owners emailed a sign-in-protected link -> kept 14 days
 *   erasure:  dry run (counts, blockers) -> typed confirmation -> scheduled 7 days out, owners told -> cancellable -> executed by the cron
 *             after the guards and the drift check pass again -> tombstone, requester told
 *
 * The caller (SAIL) has already checked the staff role and a fresh two-factor code. This module re-checks everything that is about the DATA.
 */
import "server-only"
import { randomBytes } from "node:crypto"
import { sql } from "@/lib/db"
import { isAdmin as isPlatformAdmin } from "@/lib/auth/admin"
import { resolveScope, erasureBlockers, dryRun, driftOk, countRows, eraseWorkspace, buildExport, type Scope, type DryRun } from "./executor"

export const ERASURE_DELAY_DAYS = 7
export const DEADLINE_DAYS = 30
export const DRY_RUN_MAX_AGE_HOURS = 24
export const EXPORT_KEEP_DAYS = 14

export class RequestError extends Error { constructor(message: string, readonly status = 400) { super(message) } }

const rows = (text: string, params: unknown[] = []) => sql.unsafe(text, params) as Promise<any[]>
const protectedOrgs = () => (process.env.ERASURE_PROTECTED_ORGS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
const obj = (v: unknown): any => (typeof v === "string" ? (() => { try { return JSON.parse(v) } catch { return {} } })() : v ?? {})
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://www.an-ker.de").replace(/\/$/, "")

async function tellTenant(orgId: string, actor: string, action: string, details: Record<string, unknown>) {
  try { await rows("INSERT INTO workspace_access_events (org_id, actor_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)", [orgId, `staff:${actor}`, action, JSON.stringify(details)]) } catch { /* the org may be gone */ }
}

async function mail(to: string[], subject: string, text: string) {
  try {
    const { sendEmail, isResendConfigured } = await import("@/lib/email/resend")
    if (!isResendConfigured()) return
    for (const t of [...new Set(to)]) await sendEmail({ purpose: "transactional", noTracking: true, to: t, subject, text }).catch(() => {})
  } catch { /* never fail a request over an email */ }
}

export async function listRequests(orgId: string) {
  return (await rows("SELECT id, kind, status, requested_by, approved_by, deadline_at, execute_after, detail, created_at, updated_at FROM tenant_requests WHERE org_id = $1 ORDER BY created_at DESC LIMIT 30", [orgId]))
    .map((r) => ({ ...r, detail: obj(r.detail) }))
}

async function need(orgId: string): Promise<Scope> {
  const s = await resolveScope(orgId)
  if (!s) throw new RequestError("Unknown workspace.", 404)
  return s
}

// ── export ──────────────────────────────────────────────────────────────

export async function requestExport(orgId: string, requestedBy: string): Promise<{ id: string; tables: number; bytes: number }> {
  const s = await need(orgId)
  const id = (await rows("INSERT INTO tenant_requests (org_id, kind, status, requested_by, deadline_at) VALUES ($1, 'export', 'running', $2, now() + interval '30 days') RETURNING id", [orgId, requestedBy]))[0].id as string
  try {
    const out = await buildExport(s)
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) throw new RequestError("File storage is not configured, so the export cannot be stored.", 503)
    const { put } = await import("@vercel/blob")
    const blob = await put(`tenant-exports/${id}/${randomBytes(8).toString("hex")}.zip`, Buffer.from(out.zip), { access: "private", addRandomSuffix: false, token, contentType: "application/zip" })
    const expiresAt = new Date(Date.now() + EXPORT_KEEP_DAYS * 86_400_000).toISOString()
    await rows("UPDATE tenant_requests SET status = 'done', detail = $2::jsonb, updated_at = now() WHERE id = $1", [id, JSON.stringify({ blobUrl: blob.url, bytes: out.bytes, tables: out.manifest.tables.length, rows: out.manifest.tables.reduce((n: number, t: any) => n + t.rows, 0), expiresAt })])
    await tellTenant(orgId, requestedBy, "staff_export", { requestId: id })
    await mail(s.ownerEmails, `Your Anker workspace export is ready: ${s.orgName}`,
      `Your data export for "${s.orgName}" is ready.\n\nSign in to Anker and open this link to download it (it works only for the owners and admins of the workspace, and until ${expiresAt.slice(0, 10)}):\n${appUrl()}/api/tenant/export/${id}\n\nThe export contains your workspace's data as JSON files with a manifest. It does not contain passwords or API keys.`)
    return { id, tables: out.manifest.tables.length, bytes: out.bytes }
  } catch (e) {
    await rows("UPDATE tenant_requests SET status = 'failed', detail = $2::jsonb, updated_at = now() WHERE id = $1", [id, JSON.stringify({ error: String((e as Error).message).slice(0, 300) })])
    throw e
  }
}

// ── erasure ─────────────────────────────────────────────────────────────

export async function requestDryRun(orgId: string, requestedBy: string): Promise<{ id: string; dryRun: DryRun; blockers: { code: string; message: string }[] }> {
  const s = await need(orgId)
  const blockers = await erasureBlockers(s, { isPlatformAdmin, protectedOrgs: protectedOrgs() })
  const d = await dryRun(s)
  // One erasure request per workspace at a time: a new dry run replaces an earlier unapproved one, and refuses to replace an approved one.
  const live = (await rows("SELECT id, status FROM tenant_requests WHERE org_id = $1 AND kind = 'erasure' AND status IN ('dry_run','approved','running')", [orgId]))
  if (live.some((r) => r.status === "approved" || r.status === "running")) throw new RequestError("An erasure is already scheduled or running for this workspace. Cancel it first.", 409)
  for (const r of live) await rows("UPDATE tenant_requests SET status = 'cancelled', updated_at = now() WHERE id = $1", [r.id])
  const id = (await rows("INSERT INTO tenant_requests (org_id, kind, status, requested_by, deadline_at, detail) VALUES ($1, 'erasure', 'dry_run', $2, now() + interval '30 days', $3::jsonb) RETURNING id", [orgId, requestedBy, JSON.stringify({ dryRun: d, blockers, orgName: s.orgName })]))[0].id as string
  return { id, dryRun: d, blockers }
}

export async function scheduleErasure(requestId: string, input: { confirmName: string; approvedBy: string }): Promise<{ executeAfter: string }> {
  const req = (await rows("SELECT * FROM tenant_requests WHERE id = $1 AND kind = 'erasure'", [requestId]))[0]
  if (!req) throw new RequestError("Unknown request.", 404)
  if (req.status !== "dry_run") throw new RequestError("Only a request that has a dry run and is not yet approved can be scheduled.", 409)
  const detail = obj(req.detail)
  const age = Date.now() - new Date(detail?.dryRun?.takenAt ?? 0).getTime()
  if (!(age >= 0) || age > DRY_RUN_MAX_AGE_HOURS * 3_600_000) throw new RequestError(`The dry run is older than ${DRY_RUN_MAX_AGE_HOURS} hours. Take a new one.`)
  const s = await need(req.org_id)
  if (input.confirmName.trim() !== s.orgName.trim() || !s.orgName.trim()) throw new RequestError("The confirmation must be the workspace name, typed exactly.")
  const blockers = await erasureBlockers(s, { isPlatformAdmin, protectedOrgs: protectedOrgs() })
  if (blockers.length) throw new RequestError(blockers.map((b) => b.message).join(" "), 409)
  const executeAfter = new Date(Date.now() + ERASURE_DELAY_DAYS * 86_400_000).toISOString()
  await rows("UPDATE tenant_requests SET status = 'approved', approved_by = $2, execute_after = $3, detail = $4::jsonb, updated_at = now() WHERE id = $1",
    [requestId, input.approvedBy, executeAfter, JSON.stringify({ ...detail, ownerEmails: s.ownerEmails, scheduledAt: new Date().toISOString() })])
  await tellTenant(req.org_id, input.approvedBy, "staff_erasure_scheduled", { requestId, executeAfter })
  await mail(s.ownerEmails, `Your Anker workspace will be erased on ${executeAfter.slice(0, 10)}: ${s.orgName}`,
    `The workspace "${s.orgName}" is scheduled for permanent erasure on ${executeAfter.slice(0, 10)}.\n\nAll of its data will be deleted. Billing records we must keep by law are retained; nothing else is.\n\nIf you have not asked for this, or want to keep your data, reply to this email now: the erasure can be cancelled until it runs. You can also ask for an export of your data first.`)
  return { executeAfter }
}

export async function cancelRequest(requestId: string, by: string): Promise<void> {
  const req = (await rows("SELECT * FROM tenant_requests WHERE id = $1", [requestId]))[0]
  if (!req) throw new RequestError("Unknown request.", 404)
  if (!["dry_run", "approved"].includes(req.status)) throw new RequestError("Only a request that has not started can be cancelled.", 409)
  await rows("UPDATE tenant_requests SET status = 'cancelled', updated_at = now() WHERE id = $1", [requestId])
  await tellTenant(req.org_id, by, "staff_erasure_cancelled", { requestId })
  if (req.status === "approved") await mail(obj(req.detail).ownerEmails ?? [], "The scheduled erasure of your Anker workspace was cancelled", `The scheduled erasure of "${obj(req.detail).orgName ?? "your workspace"}" was cancelled. Nothing has been deleted.`)
}

/** Run every approved erasure whose waiting period has passed. Each is re-validated: the guards, the drift check, and that it has not been cancelled. */
export async function runDueErasures(): Promise<{ id: string; outcome: "done" | "failed" | "blocked"; detail?: string }[]> {
  const due = await rows("SELECT * FROM tenant_requests WHERE kind = 'erasure' AND status = 'approved' AND execute_after <= now() ORDER BY execute_after LIMIT 3")
  const out: { id: string; outcome: "done" | "failed" | "blocked"; detail?: string }[] = []
  for (const req of due) {
    // Claim it: only one runner may execute a request.
    const claimed = await rows("UPDATE tenant_requests SET status = 'running', updated_at = now() WHERE id = $1 AND status = 'approved' RETURNING id", [req.id])
    if (!claimed.length) continue
    const detail = obj(req.detail)
    try {
      const s = await resolveScope(req.org_id)
      if (!s) { await rows("UPDATE tenant_requests SET status = 'failed', detail = $2::jsonb WHERE id = $1", [req.id, JSON.stringify({ ...detail, error: "The workspace no longer exists." })]); out.push({ id: req.id, outcome: "failed", detail: "gone" }); continue }
      const blockers = await erasureBlockers(s, { isPlatformAdmin, protectedOrgs: protectedOrgs() })
      const drift = driftOk(detail?.dryRun?.counts ?? [], await countRows(s))
      if (blockers.length || !drift.ok) {
        const why = blockers.map((b) => b.message).join(" ") || drift.reason
        await rows("UPDATE tenant_requests SET status = 'rejected', detail = $2::jsonb, updated_at = now() WHERE id = $1", [req.id, JSON.stringify({ ...detail, blockedAt: new Date().toISOString(), blocked: why })])
        out.push({ id: req.id, outcome: "blocked", detail: why }); continue
      }
      const result = await eraseWorkspace(s, req.id, req.approved_by ?? req.requested_by)
      await rows("UPDATE tenant_requests SET status = 'done', detail = $2::jsonb, updated_at = now() WHERE id = $1", [req.id, JSON.stringify({ ...detail, executedAt: new Date().toISOString(), result: { tables: result.counts.filter((c) => c.deleted > 0).length, blobsDeleted: result.blobsDeleted, skipped: result.skippedTables } })])
      await mail(detail.ownerEmails ?? [], `Your Anker workspace has been erased: ${s.orgName}`, `The workspace "${s.orgName}" has been permanently erased, as scheduled. Billing records we must keep by law are retained.`)
      out.push({ id: req.id, outcome: "done" })
    } catch (e) {
      // A failure partway leaves what was deleted deleted and the request approved, so the next run finishes it; five failures in a row stop it for a person.
      const attempts = Number(detail.attempts ?? 0) + 1
      await rows("UPDATE tenant_requests SET status = $3, detail = $2::jsonb, updated_at = now() WHERE id = $1", [req.id, JSON.stringify({ ...detail, attempts, lastError: String((e as Error).message).slice(0, 300), lastErrorAt: new Date().toISOString() }), attempts >= 5 ? "failed" : "approved"])
      out.push({ id: req.id, outcome: "failed", detail: String((e as Error).message).slice(0, 200) })
    }
  }
  return out
}

/** Exports are kept for 14 days and then removed from storage. */
export async function expireExports(): Promise<number> {
  const old = await rows("SELECT id, detail FROM tenant_requests WHERE kind = 'export' AND status = 'done' AND (detail->>'expiresAt')::timestamptz < now()")
  let n = 0
  for (const r of old) {
    const url = obj(r.detail).blobUrl
    try { if (url && process.env.BLOB_READ_WRITE_TOKEN) await (await import("@vercel/blob")).del(url, { token: process.env.BLOB_READ_WRITE_TOKEN }) } catch { /* retry next run */ continue }
    await rows("UPDATE tenant_requests SET status = 'cancelled', detail = detail - 'blobUrl' || '{\"expired\": true}'::jsonb WHERE id = $1", [r.id]); n++
  }
  return n
}
