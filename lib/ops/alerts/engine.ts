import "server-only"
import { sql } from "@/lib/db"
import { evaluate, alerterStale, RULE_KEYS, type Finding, type RuleKey, type Snapshot } from "./rules"
import { RUNBOOKS } from "./runbooks"

/**
 * The alert engine (docs/architecture/56, A1). It turns the facts the platform already collects into incidents and tells a person once.
 *  - A new problem opens an incident after two consecutive sightings (severity 1 opens on the first); a problem seen once and gone leaves nothing.
 *  - A problem that goes on updates its incident and reminds every 4 hours (24 hours once acknowledged).
 *  - A problem that stays away for three evaluations resolves itself; one that returns within 24 hours reopens the same incident.
 * Delivery is one email per event, recorded in the incident's timeline; a failed delivery is retried on the next evaluation.
 */
export const OPEN_AFTER = 2, RESOLVE_AFTER = 3
export const REMIND_MS = 4 * 3600_000, REMIND_ACK_MS = 24 * 3600_000, REOPEN_WITHIN_MS = 24 * 3600_000

export type Kind = "opened" | "reopened" | "reminded" | "resolved"
export interface Message { to: string[]; subject: string; text: string }
export type Deliver = (m: Message) => Promise<void>

export const recipients = (env: Record<string, string | undefined> = process.env): string[] =>
  (env.ALERT_EMAIL_TO || "vc@an-ker.de").split(",").map((x) => x.trim()).filter(Boolean)

export async function defaultDeliver(m: Message): Promise<void> {
  const { sendEmail, isResendConfigured } = await import("@/lib/email/resend")
  if (!isResendConfigured()) throw new Error("email is not configured")
  for (const to of m.to) await sendEmail({ to, subject: m.subject, text: m.text, noTracking: true, purpose: "transactional", via: "alerts" })
}

export function buildMessage(kind: Kind, i: { id: number; rule_key: string; subject: string; severity: number; summary: string; evidence: Record<string, unknown>; opened_at?: Date | string | null; times_seen?: number }, env: Record<string, string | undefined> = process.env): Message {
  const rb = RUNBOOKS[i.rule_key as RuleKey]
  const tag = kind === "resolved" ? "resolved" : kind === "reminded" ? `SEV${i.severity} still open` : kind === "reopened" ? `SEV${i.severity} again` : `SEV${i.severity}`
  const since = i.opened_at ? new Date(i.opened_at).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "just now"
  const ev = Object.entries(i.evidence ?? {}).map(([k, v]) => `  ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join("\n")
  const sail = (env.SAIL_URL || "").replace(/\/$/, "")
  const lines = [i.summary, "", `Since: ${since}${i.times_seen && i.times_seen > 1 ? ` (seen ${i.times_seen} times)` : ""}`, ...(ev ? ["Evidence:", ev] : [])]
  if (kind !== "resolved" && rb) lines.push("", `What it means: ${rb.means}`, `Check: ${rb.check}`, `Fix: ${rb.fix}`)
  if (sail) lines.push("", `Incident: ${sail}/alerts#incident-${i.id}`)
  if (kind === "resolved") lines.unshift("This problem has cleared.", "")
  return { to: recipients(env), subject: `[Anker ${tag}] ${i.rule_key}: ${i.subject}`, text: lines.join("\n") }
}

// ───────────── gathering ─────────────
export async function gather(now = Date.now()): Promise<Snapshot> {
  const latest: Snapshot["latest"] = {}, lastOk: Snapshot["lastOk"] = {}, recent: Snapshot["recent"] = {}
  for (const r of (await sql`SELECT DISTINCT ON (job) job, started_at, status FROM cron_runs ORDER BY job, started_at DESC`) as any[]) latest[String(r.job)] = { startedAt: new Date(r.started_at).getTime(), status: String(r.status) }
  for (const r of (await sql`SELECT job, max(started_at) AS t FROM cron_runs WHERE status = 'ok' GROUP BY job`) as any[]) lastOk[String(r.job)] = r.t ? new Date(r.t).getTime() : null
  for (const r of (await sql`SELECT job, array_agg(status ORDER BY started_at DESC) AS s FROM (SELECT job, status, started_at, row_number() OVER (PARTITION BY job ORDER BY started_at DESC) AS rn FROM cron_runs WHERE started_at > now() - interval '3 days') x WHERE rn <= 5 GROUP BY job`) as any[]) recent[String(r.job)] = r.s as string[]
  const { runDependencyChecks } = await import("@/lib/ops/dependencies")
  return { now, latest, lastOk, recent, deps: (await runDependencyChecks({ now })).checks }
}

async function settings(): Promise<Map<string, { enabled: boolean; severity: number | null; muted: boolean }>> {
  const rows = (await sql`SELECT rule_key, enabled, severity_override, (muted_until IS NOT NULL AND muted_until > now()) AS muted FROM alert_rule_settings`) as any[]
  return new Map(rows.map((r) => [String(r.rule_key), { enabled: !!r.enabled, severity: r.severity_override == null ? null : Number(r.severity_override), muted: !!r.muted }]))
}

// ───────────── reconciling ─────────────
const event = (id: number, kind: string, o: { channel?: string; ok?: boolean; actor?: string; detail?: string } = {}) =>
  sql`INSERT INTO alert_events (incident_id, kind, channel, ok, actor, detail) VALUES (${id}, ${kind}, ${o.channel ?? null}, ${o.ok ?? null}, ${o.actor ?? null}, ${o.detail ?? null})`

async function notify(kind: Kind, inc: any, deliver: Deliver, now: number): Promise<boolean> {
  try {
    await deliver(buildMessage(kind, inc))
    if (kind === "reminded") await sql`UPDATE alert_incidents SET reminded_at = ${new Date(now).toISOString()}::timestamptz WHERE id = ${inc.id}`
    else if (kind !== "resolved") await sql`UPDATE alert_incidents SET notified_at = ${new Date(now).toISOString()}::timestamptz WHERE id = ${inc.id}`
    await event(inc.id, kind === "reminded" ? "reminded" : "notified", { channel: "email", ok: true })
    return true
  } catch (e) {
    await event(inc.id, "notified", { channel: "email", ok: false, detail: String((e as Error)?.message ?? e).slice(0, 200) })
    return false
  }
}

export interface Stats { opened: number; reopened: number; resolved: number; reminded: number; pending: number; retried: number }

export async function reconcile(findings: Finding[], evaluated: RuleKey[], opts: { now?: number; deliver?: Deliver } = {}): Promise<Stats> {
  const now = opts.now ?? Date.now(), deliver = opts.deliver ?? defaultDeliver, iso = new Date(now).toISOString()
  const st: Stats = { opened: 0, reopened: 0, resolved: 0, reminded: 0, pending: 0, retried: 0 }
  const seen = new Set(findings.map((f) => `${f.rule}\u0000${f.subject}`))

  for (const f of findings) {
    const ev = JSON.stringify(f.evidence), rb = RUNBOOKS[f.rule]
    const runbook = rb ? `What it means: ${rb.means}\nCheck: ${rb.check}\nFix: ${rb.fix}` : null
    const [inc] = (await sql`SELECT * FROM alert_incidents WHERE rule_key = ${f.rule} AND subject = ${f.subject} AND status <> 'resolved'`) as any[]
    if (!inc) {
      const [old] = (await sql`SELECT id FROM alert_incidents WHERE rule_key = ${f.rule} AND subject = ${f.subject} AND status = 'resolved' AND resolved_at > ${new Date(now - REOPEN_WITHIN_MS).toISOString()}::timestamptz ORDER BY resolved_at DESC LIMIT 1`) as any[]
      if (old) {
        const [r] = (await sql`UPDATE alert_incidents SET status = 'open', resolved_at = NULL, resolved_by = NULL, clear_count = 0, last_seen_at = ${iso}::timestamptz, times_seen = times_seen + 1, severity = ${f.severity}, summary = ${f.summary}, evidence = ${ev}::jsonb, notified_at = NULL, reminded_at = NULL WHERE id = ${old.id} RETURNING *`) as any[]
        await event(r.id, "reopened"); st.reopened++; await notify("reopened", r, deliver, now)
      } else if (f.severity === 1) {
        const [r] = (await sql`INSERT INTO alert_incidents (rule_key, subject, severity, status, summary, evidence, runbook, opened_at, first_seen_at, last_seen_at) VALUES (${f.rule}, ${f.subject}, ${f.severity}, 'open', ${f.summary}, ${ev}::jsonb, ${runbook}, ${iso}::timestamptz, ${iso}::timestamptz, ${iso}::timestamptz) RETURNING *`) as any[]
        await event(r.id, "opened"); st.opened++; await notify("opened", r, deliver, now)
      } else {
        await sql`INSERT INTO alert_incidents (rule_key, subject, severity, status, summary, evidence, runbook, first_seen_at, last_seen_at) VALUES (${f.rule}, ${f.subject}, ${f.severity}, 'pending', ${f.summary}, ${ev}::jsonb, ${runbook}, ${iso}::timestamptz, ${iso}::timestamptz)`
        st.pending++
      }
    } else if (inc.status === "pending") {
      if (Number(inc.times_seen) + 1 >= OPEN_AFTER) {
        const [r] = (await sql`UPDATE alert_incidents SET status = 'open', opened_at = ${iso}::timestamptz, last_seen_at = ${iso}::timestamptz, times_seen = times_seen + 1, severity = ${f.severity}, summary = ${f.summary}, evidence = ${ev}::jsonb WHERE id = ${inc.id} RETURNING *`) as any[]
        await event(r.id, "opened"); st.opened++; await notify("opened", r, deliver, now)
      } else { await sql`UPDATE alert_incidents SET times_seen = times_seen + 1, last_seen_at = ${iso}::timestamptz, summary = ${f.summary}, evidence = ${ev}::jsonb WHERE id = ${inc.id}`; st.pending++ }
    } else {
      const [r] = (await sql`UPDATE alert_incidents SET times_seen = times_seen + 1, last_seen_at = ${iso}::timestamptz, clear_count = 0, severity = ${f.severity}, summary = ${f.summary}, evidence = ${ev}::jsonb WHERE id = ${inc.id} RETURNING *`) as any[]
      if (!r.notified_at) { if (await notify("opened", r, deliver, now)) st.retried++ }                         // an earlier delivery failed: try again
      else {
        const due = now - new Date(r.reminded_at ?? r.notified_at).getTime() >= (r.status === "acknowledged" ? REMIND_ACK_MS : REMIND_MS)
        if (due && (await notify("reminded", r, deliver, now))) st.reminded++
      }
    }
  }

  // Live incidents of the evaluated rules whose problem is no longer present.
  const live = (await sql`SELECT * FROM alert_incidents WHERE status <> 'resolved' AND rule_key = ANY(${evaluated}::text[])`) as any[]
  for (const inc of live) {
    if (seen.has(`${inc.rule_key}\u0000${inc.subject}`)) continue
    if (inc.status === "pending") { await sql`DELETE FROM alert_incidents WHERE id = ${inc.id}`; continue }          // seen once, gone: a flap, leaves nothing
    if (Number(inc.clear_count) + 1 >= RESOLVE_AFTER) {
      const [r] = (await sql`UPDATE alert_incidents SET status = 'resolved', resolved_at = ${iso}::timestamptz, resolved_by = 'auto', clear_count = clear_count + 1 WHERE id = ${inc.id} RETURNING *`) as any[]
      await event(r.id, "resolved", { actor: "auto" }); st.resolved++; await notify("resolved", r, deliver, now)
    } else await sql`UPDATE alert_incidents SET clear_count = clear_count + 1 WHERE id = ${inc.id}`
  }
  return st
}

// ───────────── the two jobs ─────────────
export async function runEvaluation(opts: { now?: number; deliver?: Deliver; snapshot?: Snapshot } = {}): Promise<Stats & { findings: number }> {
  const now = opts.now ?? Date.now()
  try {
    const cfg = await settings()
    const active = RULE_KEYS.filter((k) => k !== "alerter_stale" && cfg.get(k)?.enabled !== false && !cfg.get(k)?.muted)
    const snap = opts.snapshot ?? (await gather(now))
    const findings = evaluate(snap).filter((f) => active.includes(f.rule)).map((f) => ({ ...f, severity: ((cfg.get(f.rule)?.severity ?? f.severity) as Finding["severity"]) }))
    const stats = await reconcile(findings, active, { now, deliver: opts.deliver })
    const [{ n }] = (await sql`SELECT count(*)::int AS n FROM alert_incidents WHERE status IN ('open', 'acknowledged')`) as any[]
    await sql`UPDATE alert_heartbeat SET last_run_at = ${new Date(now).toISOString()}::timestamptz, last_ok_at = ${new Date(now).toISOString()}::timestamptz, rules_evaluated = ${active.length}, open_incidents = ${Number(n)}, error = NULL WHERE id = 1`
    return { ...stats, findings: findings.length }
  } catch (e) {
    await sql`UPDATE alert_heartbeat SET last_run_at = ${new Date(now).toISOString()}::timestamptz, error = ${String((e as Error)?.message ?? e).slice(0, 300)} WHERE id = 1`.catch(() => {})
    throw e
  }
}

/** The separate cron that watches the evaluator: if the heartbeat is stale, raise a severity 1 incident. */
export async function runWatchdog(opts: { now?: number; deliver?: Deliver } = {}): Promise<Stats> {
  const now = opts.now ?? Date.now()
  const [hb] = (await sql`SELECT last_ok_at FROM alert_heartbeat WHERE id = 1`) as any[]
  const last = hb?.last_ok_at ? new Date(hb.last_ok_at).getTime() : null
  return reconcile(alerterStale(now, last), ["alerter_stale"], { now, deliver: opts.deliver })
}
