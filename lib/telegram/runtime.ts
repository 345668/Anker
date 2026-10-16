import "server-only"
import { sql } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/lib/db/secrets"
import { isFlagOn, getEffective } from "@/lib/entitlements"
import { presetFor } from "@/lib/ai/data-policy"
import { resolveAiPrincipal } from "@/lib/assistant/principal"
import { withAiContext, currentRunId } from "@/lib/assistant/context"
import { runAssistant } from "@/lib/assistant/agent"
import { readRouterConfig } from "@/lib/ai/runtime-config"
import { maxRunCostFor } from "@/lib/ai/model-router"
import * as bot from "./api"
import { handleUpdate, ensureChat, type Api, type Deps, type TgUpdate, type TodayView } from "./handler"
import { chatDecidable, UNDO_WINDOW_MIN, type PView } from "./proposals"
import { decide as decideProposal } from "@/lib/actions/store"
import { ActionError } from "@/lib/actions/capabilities"
import { logAudit } from "@/lib/audit/audit-log"
import { DEFAULT_QUIET, inQuietHours, localDay, localHour } from "@/lib/ops/alerts/quiet"
import { getMe } from "./api"
import type { LinkRow } from "./links"

/** The real dependencies of the channel: the Bot API, the workspace gate, and the assistant itself (docs/architecture/57). */
const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
export const RUN_BUDGET_MS = 240_000

export function realApi(b: bot.ProductBot): Api {
  return {
    sendMessage: (c, h, m) => bot.sendMessage(b, c, h, m), editMessage: (c, id, h, m) => bot.editMessage(b, c, id, h, m), answerCallback: (id, t, a) => bot.answerCallback(b, id, t, a),
    sendChatAction: (c) => bot.sendChatAction(b, c), leaveChat: (c) => bot.leaveChat(b, c),
  }
}

/** Whether this workspace may use the channel, in words. Null means yes. The data policy comes first: Telegram is an external processor. */
export async function gate(link: Pick<LinkRow, "org_id">): Promise<string | null> {
  if (!(await isFlagOn("telegram_channel", link.org_id))) return "Telegram access is not switched on for your workspace yet."
  const eff = await getEffective(link.org_id)
  if (!eff.features.channel_telegram) return "Your plan does not include the Telegram channel."
  if (eff.state === "paused" || eff.state === "offboarding") return "Your workspace is paused, so I can't answer right now."
  if ((await presetFor(link.org_id)) !== "standard") return "Your workspace's data policy does not allow content to pass through Telegram, so I can't answer here. Use Anker AI in the app."
  return null
}

export async function ask(link: LinkRow, text: string, history: Array<{ role: "user" | "assistant"; content: string }>): Promise<{ answer: string; runId: string | null }> {
  const principal = await resolveAiPrincipal(link.user_id, { orgId: link.org_id, readonly: link.mode !== "write" })
  const chatId = await ensureChat(link)
  const ctx = history.length ? `Conversation so far (for context only):\n${history.map((h) => `${h.role === "user" ? "Person" : "Anker"}: ${h.content}`).join("\n")}\n\n` : ""
  const task = `${ctx}The person is writing from their phone on Telegram, so keep the answer short and plain. Their message:\n${text}`
  const cfg = await readRouterConfig().catch(() => null)
  const deadlineAt = Date.now() + RUN_BUDGET_MS
  let runId: string | null = null
  const result = await withAiContext(principal, () => { runId = currentRunId(); return runAssistant(task, { maxSteps: 6, userId: principal.userId, chatId, surface: "assistant" }) }, AbortSignal.timeout(RUN_BUDGET_MS), maxRunCostFor("assistant", cfg), deadlineAt)
  if (result.provider === "no-ai") { const e: any = new Error(result.failure?.message ?? "I couldn't reach an AI provider just now. Please try again in a moment."); e.plain = true; throw e }
  return { answer: result.answer, runId }
}

const plain = (m: string) => Object.assign(new Error(m), { plain: true })
const COLS = "id, capability, summary, diff, evidence, risk_class, source_trust, status, applied_at, undo"

export async function newProposals(link: LinkRow, runId: string): Promise<PView[]> {
  return (await sql.unsafe(`SELECT ${COLS} FROM action_proposals WHERE org_id = $1 AND run_id = $2 AND status = 'pending' ORDER BY created_at`, [link.org_id, runId])) as any[]
}
export async function pending(link: LinkRow, limit: number): Promise<PView[]> {
  return (await sql.unsafe(`SELECT ${COLS} FROM action_proposals WHERE org_id = $1 AND status = 'pending' AND expires_at > now() ORDER BY created_at DESC LIMIT $2`, [link.org_id, limit])) as any[]
}

/** One decision from a tap. The person must still be able to write in the workspace; approving and undoing are limited to small, reversible changes; everything else is for the app. */
export async function decide(link: LinkRow, id: string, decision: "approve" | "reject" | "undo"): Promise<{ proposal: PView; message: string; undoable: boolean }> {
  const [p] = (await sql.unsafe(`SELECT ${COLS} FROM action_proposals WHERE id = $1 AND org_id = $2`, [id, link.org_id])) as any[]
  if (!p) throw plain("That proposal is no longer there.")
  const principal = await resolveAiPrincipal(link.user_id, { orgId: link.org_id }).catch(() => null)
  if (!principal?.canWrite) throw plain("You can't approve changes in this workspace.")
  if (decision === "approve") { const d = chatDecidable(p); if (!d.ok) throw plain(d.why) }
  if (decision === "undo") {
    const fresh = p.applied_at && Date.now() - new Date(p.applied_at).getTime() < UNDO_WINDOW_MIN * 60_000
    if (p.status !== "applied" || p.risk_class !== "R0" || !fresh) throw plain("This can only be undone in Anker.")
  }
  try {
    const r = await decideProposal(link.org_id, id, decision, { userId: link.user_id, email: null })
    await logAudit({ actorId: link.user_id, action: "telegram.decision", targetType: "action_proposal", targetId: id, metadata: { decision, via: "telegram", link: link.id } })
    const np = r.proposal as any
    return { proposal: { ...p, status: np.status, applied_at: np.applied_at }, message: r.message, undoable: np.status === "applied" && np.risk_class === "R0" && !!np.undo }
  } catch (e) { if (e instanceof ActionError) throw plain(e.message); throw e }
}

export async function today(link: LinkRow): Promise<TodayView> {
  const n = async (q: string, v: unknown[]) => { try { return Number(((await sql.unsafe(q, v)) as any[])[0]?.n ?? 0) } catch { return 0 } }
  const day = `(now() AT TIME ZONE 'Europe/Berlin')::date`
  return {
    pending: await n(`SELECT count(*)::int AS n FROM action_proposals WHERE org_id = $1 AND status = 'pending' AND expires_at > now()`, [link.org_id]),
    tasksToday: await n(`SELECT count(*)::int AS n FROM crm_tasks WHERE org_id = $1 AND user_id = $2 AND done_at IS NULL AND (due_at AT TIME ZONE 'Europe/Berlin')::date = ${day}`, [link.org_id, link.user_id]),
    overdue: await n(`SELECT count(*)::int AS n FROM crm_tasks WHERE org_id = $1 AND user_id = $2 AND done_at IS NULL AND (due_at AT TIME ZONE 'Europe/Berlin')::date < ${day}`, [link.org_id, link.user_id]),
    replies24h: await n(`SELECT count(*)::int AS n FROM outreach_replies WHERE user_id = $1 AND received_at > now() - interval '1 day'`, [link.user_id]),
  }
}
export async function shown(link: LinkRow, ids: string[]): Promise<void> {
  for (const id of ids) await sql`INSERT INTO telegram_shown (link_id, org_id, proposal_id) VALUES (${link.id}, ${link.org_id}, ${id}) ON CONFLICT DO NOTHING`
}

export function realDeps(b: bot.ProductBot): Deps { return { api: realApi(b), gate, ask, newProposals, pending, decide, today, shown, appUrl: appUrl() } }

// ───────────── the queue: received updates are stored, acknowledged, then processed ─────────────
const STALE_RUNNING_MS = 5 * 60_000
export const MAX_ATTEMPTS = 3

/** Stores a received update (once: the unique update id makes Telegram's retries harmless). Returns true when it is new. */
export async function enqueue(update: TgUpdate): Promise<boolean> {
  const key = process.env.SECRET_KEY
  if (!key) throw new Error("SECRET_KEY is required to queue a Telegram update")
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? update.my_chat_member?.chat.id ?? null
  const kind = update.message ? (update.message.text ? "text" : "other") : update.callback_query ? "callback" : update.my_chat_member ? "member" : "other"
  const fromId = update.message?.from?.id ?? update.callback_query?.from?.id ?? null
  const [l] = fromId == null ? [] : ((await sql`SELECT id, org_id FROM telegram_links WHERE telegram_user_id = ${fromId} AND status <> 'revoked' ORDER BY created_at DESC LIMIT 1`) as any[])
  const rows = (await sql`INSERT INTO telegram_updates (update_id, link_id, org_id, chat_id, kind, payload_enc) VALUES (${update.update_id}, ${l?.id ?? null}, ${l?.org_id ?? null}, ${chatId}, ${kind}, ${encryptSecret(JSON.stringify(update))}) ON CONFLICT (update_id) DO NOTHING RETURNING update_id`) as any[]
  return rows.length > 0
}

/** Claims an update for processing: not while an earlier update of the same chat is still being worked on, so a chat's messages are answered in order. */
async function claim(updateId: number): Promise<{ payload: TgUpdate; attempts: number } | null> {
  const [r] = (await sql`UPDATE telegram_updates u SET status = 'running', started_at = now(), attempts = attempts + 1
    WHERE u.update_id = ${updateId} AND (u.status = 'queued' OR (u.status = 'running' AND u.started_at < now() - make_interval(secs => ${STALE_RUNNING_MS / 1000})))
      AND u.attempts < ${MAX_ATTEMPTS}
      AND NOT EXISTS (SELECT 1 FROM telegram_updates e WHERE e.chat_id = u.chat_id AND e.update_id < u.update_id AND (e.status = 'queued' OR (e.status = 'running' AND e.started_at > now() - make_interval(secs => ${STALE_RUNNING_MS / 1000}))) AND e.attempts < ${MAX_ATTEMPTS})
    RETURNING payload_enc, attempts`) as any[]
  if (!r?.payload_enc) return null
  const plain = decryptSecret(r.payload_enc)
  if (!plain) return null
  return { payload: JSON.parse(plain) as TgUpdate, attempts: Number(r.attempts) }
}

export async function processUpdate(updateId: number, deps: Deps): Promise<"done" | "failed" | "skipped"> {
  const c = await claim(updateId)
  if (!c) return "skipped"
  try {
    await handleUpdate(c.payload, deps)
    await sql`UPDATE telegram_updates SET status = 'done', finished_at = now(), payload_enc = NULL, error = NULL WHERE update_id = ${updateId}`
    return "done"
  } catch (e) {
    const last = c.attempts >= MAX_ATTEMPTS
    const err = String((e as Error)?.message ?? e).slice(0, 200)
    if (last) await sql`UPDATE telegram_updates SET status = 'failed', error = ${err}, payload_enc = NULL, finished_at = now() WHERE update_id = ${updateId}`.catch(() => {})
    else await sql`UPDATE telegram_updates SET status = 'queued', error = ${err} WHERE update_id = ${updateId}`.catch(() => {})
    return "failed"
  }
}

/** Every update that is waiting: new ones the webhook could not start, or ones left behind by a killed function. Oldest first, one chat at a time (the claim enforces the order). */
export async function sweep(deps: Deps, limit = 10): Promise<{ processed: number; failed: number }> {
  const rows = (await sql`SELECT update_id FROM telegram_updates WHERE attempts < ${MAX_ATTEMPTS} AND (status = 'queued' OR (status = 'running' AND started_at < now() - make_interval(secs => ${STALE_RUNNING_MS / 1000}))) ORDER BY update_id LIMIT ${limit}`) as any[]
  let processed = 0, failed = 0
  for (const r of rows) { const o = await processUpdate(Number(r.update_id), deps); if (o === "done") processed++; else if (o === "failed") failed++ }
  return { processed, failed }
}

let me: { at: number; username: string | null } | null = null
/** The bot's @username for the deep link, read once from Telegram and remembered for ten minutes. */
export async function botUsername(b: bot.ProductBot): Promise<string | null> {
  if (me && Date.now() - me.at < 600_000) return me.username
  try { const r = await getMe(b); me = { at: Date.now(), username: r.username ?? null } } catch { me = { at: Date.now() - 540_000, username: null } }
  return me.username
}

// ───────────── proactive notifications (opt-in, counts only, quiet hours) ─────────────
export interface NotifyStats { links: number; sent: number; held: number; failed: number }

/**
 * Tells people what is waiting, only if they turned it on, never more than a count and a link, and never during their quiet hours. Watermarks mean a night's worth is one message in
 * the morning, and nothing old is repeated. Proposals already shown in the chat are not announced again.
 */
export async function notifyAll(api: Api, app: string, now = Date.now()): Promise<NotifyStats> {
  const st: NotifyStats = { links: 0, sent: 0, held: 0, failed: 0 }
  const rows = (await sql`SELECT l.id, l.org_id, l.user_id, l.chat_id, l.mode, l.status, p.approvals, p.replies, p.deadlines, p.quiet_start, p.quiet_end, p.tz, p.last_approvals_at, p.last_replies_at, p.last_deadlines_on::text AS last_deadlines_on
    FROM telegram_links l JOIN telegram_prefs p ON p.link_id = l.id WHERE l.status = 'active' AND (p.approvals OR p.replies OR p.deadlines)`) as any[]
  for (const r of rows) {
    st.links++
    const q = { start: Number(r.quiet_start), end: Number(r.quiet_end), tz: String(r.tz || DEFAULT_QUIET.tz) }
    if (inQuietHours(now, q)) { st.held++; continue }
    if (await gate({ org_id: r.org_id })) continue
    const send = async (html: string, url: string, label: string) => {
      try { await api.sendMessage(Number(r.chat_id), html, { inline_keyboard: [[{ text: label, url }]] }); st.sent++; return true } catch { st.failed++; return false }
    }
    if (r.approvals) {
      const [c] = (await sql`SELECT count(*)::int AS n FROM action_proposals ap WHERE ap.org_id = ${r.org_id} AND ap.status = 'pending' AND ap.expires_at > now() AND ap.created_at > ${new Date(r.last_approvals_at).toISOString()}::timestamptz
        AND NOT EXISTS (SELECT 1 FROM telegram_shown s WHERE s.link_id = ${r.id} AND s.proposal_id = ap.id)`) as any[]
      const n = Number(c?.n ?? 0)
      if (n > 0 && (await send(`${n} new change${n === 1 ? " is" : "s are"} waiting for your approval. /inbox shows them here.`, `${app}/dashboard/actions`, "Open in Anker"))) await sql`UPDATE telegram_prefs SET last_approvals_at = ${new Date(now).toISOString()}::timestamptz WHERE link_id = ${r.id}`
      else if (n === 0) await sql`UPDATE telegram_prefs SET last_approvals_at = ${new Date(now).toISOString()}::timestamptz WHERE link_id = ${r.id}`
    }
    if (r.replies) {
      let n = 0
      try { n = Number(((await sql`SELECT count(*)::int AS n FROM outreach_replies WHERE user_id = ${r.user_id} AND received_at > ${new Date(r.last_replies_at).toISOString()}::timestamptz`) as any[])[0]?.n ?? 0) } catch { /* no replies table */ }
      if (n > 0 && (await send(`${n} new repl${n === 1 ? "y" : "ies"} to your outreach.`, `${app}/dashboard/outreach`, "Open in Anker"))) await sql`UPDATE telegram_prefs SET last_replies_at = ${new Date(now).toISOString()}::timestamptz WHERE link_id = ${r.id}`
      else if (n === 0) await sql`UPDATE telegram_prefs SET last_replies_at = ${new Date(now).toISOString()}::timestamptz WHERE link_id = ${r.id}`
    }
    if (r.deadlines && r.last_deadlines_on !== localDay(now, q) && localHour(now, q) >= q.end) {
      let n = 0
      try { n = Number(((await sql.unsafe(`SELECT count(*)::int AS n FROM crm_tasks WHERE org_id = $1 AND user_id = $2 AND done_at IS NULL AND (due_at AT TIME ZONE $3)::date <= ($4::timestamptz AT TIME ZONE $3)::date`, [r.org_id, r.user_id, q.tz, new Date(now).toISOString()])) as any[])[0]?.n ?? 0) } catch { /* no tasks table */ }
      const ok = n > 0 ? await send(`${n} task${n === 1 ? " is" : "s are"} due today or overdue.`, `${app}/dashboard/crm`, "Open in Anker") : true
      if (ok) await sql`UPDATE telegram_prefs SET last_deadlines_on = ${localDay(now, q)}::date WHERE link_id = ${r.id}`
    }
  }
  return st
}
