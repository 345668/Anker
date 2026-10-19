/**
 * Telling the person a run has finished when it finished after they stopped waiting (docs/architecture/63 section 4.1, 6.3).
 * Counts and a link only. A run started from Telegram is answered on Telegram; every hand-off also leaves a notification in the app.
 * The message is a reply to something the person asked for a moment ago, so it is not held for quiet hours; the workspace's channel gate still applies.
 */
import { sql } from "@/lib/db"
import { describeExclusions } from "./rules"

const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-US")
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export interface Delivery { title: string; body: string; ok: boolean }

/** The words for a finished or failed run. Pure. */
export function wordsFor(s: any): Delivery {
  const fund = String(s.fund_name || "your fund")
  if (s.status === "failed") return { ok: false, title: `LP matching for ${fund} did not finish`, body: "It could not be completed after several tries. Open the Matchmaking page and run it again; if it keeps failing, tell us." }
  const ex = typeof s.exclusion_counts === "string" ? (() => { try { return JSON.parse(s.exclusion_counts) } catch { return null } })() : s.exclusion_counts
  const left = ex?.total ? ` ${n(ex.total)} were left out by your rules (${describeExclusions(ex)}).` : ""
  return { ok: true, title: `LP matching for ${fund} is ready`, body: `${n(s.qualified_firms)} firms and ${n(s.qualified_contacts)} people qualified.${left} Open the Matchmaking page for the ranked list.` }
}

export interface DeliverDeps {
  inApp: (o: { userId: string; orgId: string; title: string; body: string; href: string; key: string; severity: "info" | "warning" }) => Promise<unknown>
  telegram: (o: { orgId: string; userId: string; html: string; url: string }) => Promise<number>
}

async function realInApp(o: Parameters<DeliverDeps["inApp"]>[0]) {
  const { createNotification } = await import("@/lib/notifications/store")
  return createNotification({ userId: o.userId, orgId: o.orgId, kind: "lp_match", severity: o.severity, title: o.title, body: o.body, href: o.href, dedupeKey: o.key })
}

/** Sends to the person's active Telegram devices in this workspace. Returns how many messages went out. */
async function realTelegram(o: Parameters<DeliverDeps["telegram"]>[0]): Promise<number> {
  const [{ gate, realApi }, { productBot }, { loadBot }] = await Promise.all([import("@/lib/telegram/runtime"), import("@/lib/telegram/api"), import("@/lib/telegram/bots")])
  const links = (await sql`SELECT id, org_id, user_id, chat_id, bot_id FROM telegram_links WHERE org_id = ${o.orgId} AND user_id = ${o.userId} AND status = 'active'`) as any[]
  let sent = 0
  for (const l of links) {
    if (await gate({ org_id: l.org_id, user_id: l.user_id })) continue
    const b = l.bot_id === "platform" ? productBot() : (await loadBot(String(l.bot_id)))?.bot ?? null
    if (!b) continue
    try { await realApi(b).sendMessage(Number(l.chat_id), o.html, { inline_keyboard: [[{ text: "Open in Anker", url: o.url }]] }); sent++ } catch { /* a device that cannot be reached is skipped */ }
  }
  return sent
}

/** Deliver one finished or failed run that was handed off. Safe to call twice: the notification is keyed, the Telegram message is guarded by `delivered_at`. */
export async function deliverRun(sessionId: string, deps: DeliverDeps = { inApp: realInApp, telegram: realTelegram }): Promise<boolean> {
  const [s] = (await sql`UPDATE lp_match_sessions SET delivered_at = now() WHERE id::text = ${sessionId} AND handed_off AND delivered_at IS NULL AND status IN ('completed', 'failed') RETURNING *`) as any[]
  if (!s) return false
  const w = wordsFor(s), href = "/dashboard/matchmaking", orgId = String(s.org_id), userId = String(s.user_id)
  try { await deps.inApp({ userId, orgId, title: w.title, body: w.body, href, key: `lpm:${sessionId}`, severity: w.ok ? "info" : "warning" }) } catch { /* the bell is a convenience */ }
  const notify = typeof s.notify === "string" ? (() => { try { return JSON.parse(s.notify) } catch { return null } })() : s.notify
  if (notify?.channel === "telegram") {
    try { await deps.telegram({ orgId, userId, html: `<b>${esc(w.title)}</b>\n${esc(w.body)}`, url: appUrl() + href }) } catch { /* the in-app notification stands */ }
  }
  return true
}
