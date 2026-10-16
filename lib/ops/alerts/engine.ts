import "server-only"
import { sql } from "@/lib/db"
import { evaluate, alerterStale, RULE_KEYS, AI_DEFAULTS, type Finding, type RuleKey, type Snapshot, type Thresholds } from "./rules"
import { DEFAULT_QUIET, inQuietHours, localDay, localHour, type Quiet } from "./quiet"
import { RUNBOOKS } from "./runbooks"
import { sendTelegram, telegramConfigs, telegramProblems, telegramText } from "./telegram"

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
export interface Message { to: string[]; subject: string; text: string; /** A digest is sent whole to Telegram; everything else as a short summary. */ kind?: "digest" }
export type Deliver = (m: Message) => Promise<void>
export interface Channel { name: string; send: Deliver }

export const recipients = (env: Record<string, string | undefined> = process.env): string[] =>
  (env.ALERT_EMAIL_TO || "vc@an-ker.de").split(",").map((x) => x.trim()).filter(Boolean)

export async function defaultDeliver(m: Message): Promise<void> {
  const { sendEmail, isResendConfigured } = await import("@/lib/email/resend")
  if (!isResendConfigured()) throw new Error("email is not configured")
  for (const to of m.to) await sendEmail({ to, subject: m.subject, text: m.text, noTracking: true, purpose: "transactional", via: "alerts" })
}

/** The channels that are switched on: email always, Telegram when its two variables are set. */
export function defaultChannels(env: Record<string, string | undefined> = process.env): Channel[] {
  const out: Channel[] = [{ name: "email", send: defaultDeliver }]
  telegramConfigs(env).forEach((tg, i) => out.push({ name: i === 0 ? "telegram" : `telegram ${i + 1}`, send: async (m) => sendTelegram(tg, m.kind === "digest" ? `${m.subject}\n\n${m.text}`.slice(0, 4000) : telegramText(m.subject, m.text)) }))
  return out
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
  const snap: Snapshot = { now, latest, lastOk, recent, deps: (await runDependencyChecks({ now })).checks }
  return snap
}

/** The facts the A2 rules need. Each source is optional: a table that is not there yet leaves its rule quiet rather than breaking the others. */
export async function gatherMore(snap: Snapshot, thresholds: Thresholds): Promise<Snapshot> {
  const windowMin = Math.max(1, Math.min(240, Number(thresholds.ai_failure_rate?.windowMin ?? AI_DEFAULTS.windowMin)))
  try {
    const rows = (await sql`SELECT provider, count(*)::int AS calls, count(*) FILTER (WHERE NOT ok)::int AS failed FROM ai_calls WHERE created_at > now() - make_interval(mins => ${windowMin}) AND provider NOT IN ('disabled', 'rejected', 'none') GROUP BY provider`) as any[]
    snap.ai = Object.fromEntries(rows.map((r) => [String(r.provider), { calls: Number(r.calls), failed: Number(r.failed) }]))
  } catch { /* no ai_calls yet */ }
  try {
    const rows = (await sql`SELECT id, kind, COALESCE(extended_to, due_at) AS due FROM dsar_requests WHERE closed_at IS NULL AND status <> 'verifying'`) as any[]
    snap.privacy = rows.map((r) => ({ id: String(r.id), kind: String(r.kind), dueAt: new Date(r.due).getTime() }))
  } catch { /* no privacy requests table */ }
  try {
    const [t] = (await sql`SELECT count(*) FILTER (WHERE status IN ('queued', 'running') AND received_at < now() - interval '10 minutes')::int AS stuck, count(*) FILTER (WHERE status = 'failed' AND finished_at > now() - interval '1 hour')::int AS failed FROM telegram_updates`) as any[]
    snap.telegram = { stuck: Number(t?.stuck ?? 0), failed1h: Number(t?.failed ?? 0) }
  } catch { /* the channel's tables are not there yet */ }
  try {
    const [c] = (await sql`SELECT count(*) FILTER (WHERE cost_state IN ('exact', 'estimated'))::int AS costed, count(*) FILTER (WHERE cost_state = 'unpriced')::int AS unpriced FROM ai_calls WHERE created_at > now() - interval '24 hours'`) as any[]
    const models = (await sql`SELECT COALESCE(model, '(unknown model)') AS model, count(*)::int AS n FROM ai_calls WHERE created_at > now() - interval '24 hours' AND cost_state = 'unpriced' AND model IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 10`) as any[]
    const units = (await sql`SELECT unit, count(*)::int AS n FROM usage_events WHERE created_at > now() - interval '24 hours' AND cost_state = 'unpriced' GROUP BY unit`.catch(() => [])) as any[]
    snap.metering = { costed: Number(c?.costed ?? 0), unpriced: Number(c?.unpriced ?? 0), unpricedModels: [...models.map((m) => ({ model: String(m.model), calls: Number(m.n) })), ...units.map((u) => ({ model: `unit:${u.unit}`, calls: Number(u.n) }))] }
  } catch { /* cost columns not there yet */ }
  try {
    const rows = (await sql`SELECT results FROM dependency_checks ORDER BY id DESC LIMIT 3`) as any[]
    const hist: Record<string, string[]> = {}
    for (const r of rows) for (const c of (typeof r.results === "string" ? JSON.parse(r.results) : r.results) ?? []) (hist[c.name] ??= []).push(String(c.status))
    snap.depHistory = hist
  } catch { /* no history yet */ }
  return snap
}

export interface RuleSetting { enabled: boolean; severity: number | null; muted: boolean; threshold: Record<string, unknown> }
async function settings(): Promise<Map<string, RuleSetting>> {
  const rows = (await sql`SELECT rule_key, enabled, severity_override, (muted_until IS NOT NULL AND muted_until > now()) AS muted, threshold FROM alert_rule_settings`) as any[]
  return new Map(rows.map((r) => [String(r.rule_key), { enabled: !!r.enabled, severity: r.severity_override == null ? null : Number(r.severity_override), muted: !!r.muted, threshold: (typeof r.threshold === "string" ? JSON.parse(r.threshold) : r.threshold) ?? {} }]))
}
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined)
export function thresholdsOf(cfg: Map<string, RuleSetting>): Thresholds {
  const t = cfg.get("ai_failure_rate")?.threshold ?? {}
  return { ai_failure_rate: { rate: num(t.rate, 0.01, 1), minCalls: num(t.minCalls, 1, 1000), windowMin: num(t.windowMin, 1, 240) } }
}
export function quietOf(cfg: Map<string, RuleSetting>): Quiet {
  const t = cfg.get("quiet_hours")?.threshold ?? {}
  return { start: num(t.start, 0, 23) ?? DEFAULT_QUIET.start, end: num(t.end, 0, 23) ?? DEFAULT_QUIET.end, tz: DEFAULT_QUIET.tz }
}

// ───────────── reconciling ─────────────
const event = (id: number, kind: string, o: { channel?: string; ok?: boolean; actor?: string; detail?: string } = {}) =>
  sql`INSERT INTO alert_events (incident_id, kind, channel, ok, actor, detail) VALUES (${id}, ${kind}, ${o.channel ?? null}, ${o.ok ?? null}, ${o.actor ?? null}, ${o.detail ?? null})`

/** Sends one event on every channel, each recorded in the timeline. It counts as delivered if at least one channel got it; a channel that fails never stops the others. */
async function notify(kind: Kind, inc: any, channels: Channel[], now: number): Promise<boolean> {
  const msg = buildMessage(kind, inc)
  let any = false
  for (const ch of channels) {
    try {
      await ch.send(msg)
      any = true
      await event(inc.id, kind === "reminded" ? "reminded" : "notified", { channel: ch.name, ok: true })
    } catch (e) {
      await event(inc.id, "notified", { channel: ch.name, ok: false, detail: String((e as Error)?.message ?? e).slice(0, 200) })
    }
  }
  if (any) {
    if (kind === "reminded") await sql`UPDATE alert_incidents SET reminded_at = ${new Date(now).toISOString()}::timestamptz WHERE id = ${inc.id}`
    else if (kind !== "resolved") await sql`UPDATE alert_incidents SET notified_at = ${new Date(now).toISOString()}::timestamptz WHERE id = ${inc.id}`
  }
  return any
}

/**
 * What to do with an event given its severity and the hour (docs/architecture/56 A2). Severity 1 always goes out. Severity 2 goes out by day and is HELD overnight for the
 * morning digest. Severity 3 is never sent on its own: it is only in the digest. A held incident is marked, so the retry does not send it by itself.
 */
async function deliver(kind: Kind, inc: any, channels: Channel[], now: number, quiet: boolean): Promise<"sent" | "held" | "skipped" | "failed"> {
  const sev = Number(inc.severity)
  const withheld = sev === 3 || (sev === 2 && quiet)
  if (withheld && (kind === "opened" || kind === "reopened")) {
    await sql`UPDATE alert_incidents SET held_at = COALESCE(held_at, ${new Date(now).toISOString()}::timestamptz) WHERE id = ${inc.id}`
    await event(inc.id, "held", { detail: sev === 3 ? "severity 3: digest only" : "quiet hours: held for the morning digest" })
    return "held"
  }
  if (withheld) return "skipped"
  return (await notify(kind, inc, channels, now)) ? "sent" : "failed"
}

export interface Stats { opened: number; reopened: number; resolved: number; reminded: number; pending: number; retried: number }

export async function reconcile(findings: Finding[], evaluated: RuleKey[], opts: { now?: number; deliver?: Deliver; channels?: Channel[]; quiet?: Quiet } = {}): Promise<Stats> {
  const now = opts.now ?? Date.now(), channels = opts.channels ?? (opts.deliver ? [{ name: "email", send: opts.deliver }] : defaultChannels()), iso = new Date(now).toISOString(), isQuiet = inQuietHours(now, opts.quiet ?? DEFAULT_QUIET)
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
        await event(r.id, "reopened"); st.reopened++; await deliver("reopened", r, channels, now, isQuiet)
      } else if (f.severity === 1) {
        const [r] = (await sql`INSERT INTO alert_incidents (rule_key, subject, severity, status, summary, evidence, runbook, opened_at, first_seen_at, last_seen_at) VALUES (${f.rule}, ${f.subject}, ${f.severity}, 'open', ${f.summary}, ${ev}::jsonb, ${runbook}, ${iso}::timestamptz, ${iso}::timestamptz, ${iso}::timestamptz) RETURNING *`) as any[]
        await event(r.id, "opened"); st.opened++; await deliver("opened", r, channels, now, isQuiet)
      } else {
        await sql`INSERT INTO alert_incidents (rule_key, subject, severity, status, summary, evidence, runbook, first_seen_at, last_seen_at) VALUES (${f.rule}, ${f.subject}, ${f.severity}, 'pending', ${f.summary}, ${ev}::jsonb, ${runbook}, ${iso}::timestamptz, ${iso}::timestamptz)`
        st.pending++
      }
    } else if (inc.status === "pending") {
      if (Number(inc.times_seen) + 1 >= OPEN_AFTER) {
        const [r] = (await sql`UPDATE alert_incidents SET status = 'open', opened_at = ${iso}::timestamptz, last_seen_at = ${iso}::timestamptz, times_seen = times_seen + 1, severity = ${f.severity}, summary = ${f.summary}, evidence = ${ev}::jsonb WHERE id = ${inc.id} RETURNING *`) as any[]
        await event(r.id, "opened"); st.opened++; await deliver("opened", r, channels, now, isQuiet)
      } else { await sql`UPDATE alert_incidents SET times_seen = times_seen + 1, last_seen_at = ${iso}::timestamptz, summary = ${f.summary}, evidence = ${ev}::jsonb WHERE id = ${inc.id}`; st.pending++ }
    } else {
      const [r] = (await sql`UPDATE alert_incidents SET times_seen = times_seen + 1, last_seen_at = ${iso}::timestamptz, clear_count = 0, severity = ${f.severity}, summary = ${f.summary}, evidence = ${ev}::jsonb WHERE id = ${inc.id} RETURNING *`) as any[]
      if (!r.notified_at) { if (!r.held_at && (await deliver("opened", r, channels, now, isQuiet)) === "sent") st.retried++ }   // an earlier delivery failed: try again (a held one waits for the digest)
      else {
        const due = now - new Date(r.reminded_at ?? r.notified_at).getTime() >= (r.status === "acknowledged" ? REMIND_ACK_MS : REMIND_MS)
        if (due && (await deliver("reminded", r, channels, now, isQuiet)) === "sent") st.reminded++
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
      await event(r.id, "resolved", { actor: "auto" }); st.resolved++; await deliver("resolved", r, channels, now, isQuiet)
    } else await sql`UPDATE alert_incidents SET clear_count = clear_count + 1 WHERE id = ${inc.id}`
  }
  return st
}

// ───────────── the two jobs ─────────────
const ago = (iso: string | Date | null, now: number) => { if (!iso) return ""; const m = Math.round((now - new Date(iso).getTime()) / 60000); return m < 90 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days` }

/** The morning message: every open incident in one list, so a night of held alerts is one read. */
export function buildDigest(incidents: Array<{ rule_key: string; subject: string; severity: number; status: string; summary: string; opened_at: Date | string | null; held_at?: Date | string | null }>, now: number, env: Record<string, string | undefined> = process.env): Message {
  const by = [1, 2, 3].map((s) => `${incidents.filter((i) => Number(i.severity) === s).length} SEV${s}`).filter((x) => !x.startsWith("0 "))
  const sorted = [...incidents].sort((x, y) => Number(x.severity) - Number(y.severity))
  const lines = sorted.map((i) => `SEV${i.severity} ${i.rule_key}: ${i.subject}\n  ${i.summary}\n  open ${ago(i.opened_at, now)}${i.status === "acknowledged" ? ", acknowledged" : ", not acknowledged"}${i.held_at ? ", held overnight" : ""}`)
  const sail = (env.SAIL_URL || "").replace(/\/$/, "")
  return { to: recipients(env), kind: "digest", subject: `[Anker] Morning digest: ${incidents.length} open`, text: [`${incidents.length} open incident${incidents.length === 1 ? "" : "s"}: ${by.join(", ")}`, "", ...lines.flatMap((l) => [l, ""]), ...(sail ? [`All incidents: ${sail}/alerts`] : [])].join("\n").trimEnd() }
}

/** Sends the morning digest once per local day, after quiet hours end, if anything is open. Held incidents count as notified by it. */
export async function sendDigestIfDue(now: number, channels: Channel[], quiet: Quiet): Promise<boolean> {
  if (inQuietHours(now, quiet)) return false
  const day = localDay(now, quiet)
  const [hb] = (await sql`SELECT digest_on::text AS d FROM alert_heartbeat WHERE id = 1`) as any[]
  if (hb?.d === day) return false
  const open = (await sql`SELECT id, rule_key, subject, severity, status, summary, opened_at, held_at FROM alert_incidents WHERE status IN ('open', 'acknowledged') ORDER BY severity, opened_at`) as any[]
  await sql`UPDATE alert_heartbeat SET digest_on = ${day}::date WHERE id = 1`
  if (!open.length) return false
  const msg = buildDigest(open, now)
  let any = false
  for (const ch of channels) {
    try { await ch.send(msg); any = true } catch (e) { await event(open[0].id, "notified", { channel: ch.name, ok: false, detail: `digest: ${String((e as Error)?.message ?? e).slice(0, 180)}` }) }
  }
  if (!any) { await sql`UPDATE alert_heartbeat SET digest_on = NULL WHERE id = 1`; return false }       // nothing got through: try again next evaluation
  for (const i of open) await event(i.id, "digest", { ok: true })
  await sql`UPDATE alert_incidents SET notified_at = COALESCE(notified_at, ${new Date(now).toISOString()}::timestamptz), held_at = NULL WHERE status IN ('open', 'acknowledged') AND held_at IS NOT NULL`
  return true
}

export async function runEvaluation(opts: { now?: number; deliver?: Deliver; channels?: Channel[]; snapshot?: Snapshot } = {}): Promise<Stats & { findings: number; digest: boolean }> {
  const now = opts.now ?? Date.now()
  try {
    const cfg = await settings()
    const thresholds = thresholdsOf(cfg), quiet = quietOf(cfg)
    const channels = opts.channels ?? (opts.deliver ? [{ name: "email", send: opts.deliver }] : defaultChannels())
    const active = RULE_KEYS.filter((k) => k !== "alerter_stale" && cfg.get(k)?.enabled !== false && !cfg.get(k)?.muted)
    const snap = opts.snapshot ?? (await gatherMore(await gather(now), thresholds))
    const findings = evaluate(snap, thresholds).filter((f) => active.includes(f.rule)).map((f) => ({ ...f, severity: ((cfg.get(f.rule)?.severity ?? f.severity) as Finding["severity"]) }))
    const stats = await reconcile(findings, active, { now, channels, quiet })
    const digest = await sendDigestIfDue(now, channels, quiet)
    const [{ n }] = (await sql`SELECT count(*)::int AS n FROM alert_incidents WHERE status IN ('open', 'acknowledged')`) as any[]
    await sql`UPDATE alert_heartbeat SET last_run_at = ${new Date(now).toISOString()}::timestamptz, last_ok_at = ${new Date(now).toISOString()}::timestamptz, rules_evaluated = ${active.length}, open_incidents = ${Number(n)}, error = NULL WHERE id = 1`
    return { ...stats, findings: findings.length, digest }
  } catch (e) {
    await sql`UPDATE alert_heartbeat SET last_run_at = ${new Date(now).toISOString()}::timestamptz, error = ${String((e as Error)?.message ?? e).slice(0, 300)} WHERE id = 1`.catch(() => {})
    throw e
  }
}

/** The separate cron that watches the evaluator: if the heartbeat is stale, raise a severity 1 incident. */
export async function runWatchdog(opts: { now?: number; deliver?: Deliver; channels?: Channel[] } = {}): Promise<Stats> {
  const now = opts.now ?? Date.now()
  const [hb] = (await sql`SELECT last_ok_at FROM alert_heartbeat WHERE id = 1`) as any[]
  const last = hb?.last_ok_at ? new Date(hb.last_ok_at).getTime() : null
  return reconcile(alerterStale(now, last), ["alerter_stale"], { now, deliver: opts.deliver, channels: opts.channels })
}

/** A test message on every switched-on channel, so a person can see the setup works before a real alert needs it. Returns each channel's result. */
export async function sendTestNotification(channels: Channel[] = defaultChannels(), problems: string[] = telegramProblems()): Promise<Array<{ channel: string; ok: boolean; error?: string }>> {
  const msg: Message = { to: recipients(), subject: "[Anker test] alert delivery", text: "This is a test of Anker's alert delivery. Nothing is wrong.\n\nFix: nothing to do." }
  const out: Array<{ channel: string; ok: boolean; error?: string }> = []
  // A channel that is off because of a configuration problem is reported, not silently absent.
  if (!channels.some((c) => c.name.startsWith("telegram")) && problems.length) out.push({ channel: "telegram", ok: false, error: `not switched on: ${problems.join("; ")}` })
  for (const ch of channels) { try { await ch.send(msg); out.push({ channel: ch.name, ok: true }) } catch (e) { out.push({ channel: ch.name, ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) }) } }
  return out
}
