import "server-only"
import { sql } from "@/lib/db"
import { answerToParts, esc } from "./format"
import { consumeLinkCode, linkByTelegramUser, revokeByTelegramUser, touchLink, type LinkRow } from "./links"
import type { Markup } from "./api"
import { renderProposal, renderDecision, chatDecidable, parseCallback, UNDO_WINDOW_MIN, type PView } from "./proposals"

/**
 * What the bot does with one update (docs/architecture/57, T1: link, and ask in read-only mode). Dependencies are injected, so the rules below are tested without Telegram or a model.
 * Rules that matter: only a Telegram user id with an ACTIVE link is served; everyone else gets one fixed message; groups are refused; nothing is stored here but the answer.
 */
export interface TgUser { id: number; username?: string; first_name?: string }
export interface TgMessage { message_id: number; from?: TgUser; chat: { id: number; type: string }; text?: string; voice?: unknown; audio?: unknown; document?: unknown; photo?: unknown; video?: unknown; video_note?: unknown; contact?: unknown; location?: unknown; sticker?: unknown }
export interface TgCallback { id: string; from: TgUser; data?: string; message?: { message_id: number; chat: { id: number; type: string } } }
export interface TgUpdate { update_id: number; message?: TgMessage; edited_message?: TgMessage; callback_query?: TgCallback; my_chat_member?: { chat: { id: number; type: string } } }

export interface Api {
  sendMessage(chatId: number, html: string, markup?: Markup | null): Promise<unknown>
  editMessage(chatId: number, messageId: number, html: string, markup?: Markup | null): Promise<unknown>
  answerCallback(callbackId: string, text?: string, alert?: boolean): Promise<unknown>
  sendChatAction(chatId: number): Promise<unknown>
  leaveChat(chatId: number): Promise<unknown>
}
export interface TodayView { pending: number; tasksToday: number; overdue: number; replies24h: number }
export interface Deps {
  api: Api
  /** Why this workspace cannot use the channel right now, or null. */
  gate(link: LinkRow): Promise<string | null>
  /** Runs the assistant for the linked person and returns the answer text. Throws a plain-words Error for a refusal. */
  ask(link: LinkRow, text: string, history: Array<{ role: "user" | "assistant"; content: string }>): Promise<{ answer: string; runId?: string | null }>
  /** Proposals the run just made (still waiting), newest last. */
  newProposals(link: LinkRow, runId: string): Promise<PView[]>
  /** Proposals waiting in the workspace. */
  pending(link: LinkRow, limit: number): Promise<PView[]>
  /** Approve, reject or undo one proposal for the linked person, with every guard. Throws a plain-words Error when it must not happen. */
  decide(link: LinkRow, proposalId: string, decision: "approve" | "reject" | "undo"): Promise<{ proposal: PView; message: string; undoable: boolean }>
  today(link: LinkRow): Promise<TodayView>
  /** Remembers that a proposal was shown in the chat, so a notification does not repeat it. */
  shown(link: LinkRow, proposalIds: string[]): Promise<void>
  appUrl: string
  now?: () => number
}

export const MSG = {
  unknown: "I don't know this Telegram account yet. In Anker, open Connected channels, press Connect Telegram, and open the link it gives you on this phone.",
  pending: "Almost there. Open Anker, go to Connected channels and approve this device. Then message me again.",
  suspended: "This device has been idle for a long time, so I paused it. Open Anker, Connected channels, and approve it again.",
  group: "I only work in a private chat with me. Please message me directly.",
  notYet: "Voice notes, photos and files are coming in the next release. For now, send me text.",
  slow: "One moment, I'm still working on your earlier messages.",
  codeBad: "That link has expired or was already used. In Anker, open Connected channels and press Connect Telegram for a new one.",
  alreadyLinked: "This Telegram account is already connected to a workspace. Send /unlink first if you want to connect it somewhere else.",
  unlinked: "Disconnected. I will not respond here until you connect again from Anker.",
  tooLong: "That took too long and I stopped. Please try a shorter or more specific question.",
  failed: "I couldn't answer that just now. Please try again in a moment.",
  help: "I'm Anker AI. Ask me about your workspace in plain language, for example: \"who did I contact last week?\" or \"move Katja to Contacted\".\n\nWhen I want to change something, I show you the change with Approve and Reject buttons. Nothing is changed until you tap Approve, and I never send email or messages to other people from here.\n\n/today what needs you today\n/inbox changes waiting for your approval\n/mode whether I may propose changes\n/whoami which workspace this is\n/unlink disconnect this device",
  readOnly: "This device is read-only: I can answer but not propose changes. To allow changes, open Anker, Connected channels, and switch on \"Allow changes\" for this device.",
  noPending: "Nothing is waiting for your approval.",
  stale: "That proposal is no longer waiting.",
}
const MAX_PER_MINUTE = 8
const HISTORY = 6

async function reply(deps: Deps, chatId: number, text: string) { await deps.api.sendMessage(chatId, esc(text)) }

export async function handleUpdate(update: TgUpdate, deps: Deps): Promise<void> {
  // The bot was added to a group: leave it.
  if (update.my_chat_member && update.my_chat_member.chat.type !== "private") { await deps.api.leaveChat(update.my_chat_member.chat.id); return }
  if (update.callback_query) { await handleCallback(update.callback_query, deps); return }
  const m = update.message
  if (!m || !m.from || m.from.id === undefined) return                     // edits and channel posts do nothing
  const chatId = m.chat.id, tgId = m.from.id
  if (m.chat.type !== "private") { await reply(deps, chatId, MSG.group); await deps.api.leaveChat(chatId); return }

  const text = (m.text ?? "").trim()
  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?$/i.exec(text)
  if (start?.[1]) {
    const r = await consumeLinkCode(start[1], { userId: tgId, chatId, username: m.from.username ?? null })
    if (r.ok) await reply(deps, chatId, MSG.pending)
    else await reply(deps, chatId, r.reason === "already_linked" ? MSG.alreadyLinked : MSG.codeBad)
    return
  }

  const link = await linkByTelegramUser(tgId)
  if (!link) { await reply(deps, chatId, MSG.unknown); return }
  if (/^\/unlink(?:@\w+)?$/i.test(text)) { await revokeByTelegramUser(tgId); await reply(deps, chatId, MSG.unlinked); return }
  if (link.status === "pending") { await reply(deps, chatId, MSG.pending); return }
  if (link.status === "suspended") { await reply(deps, chatId, MSG.suspended); return }

  if ((await touchLink(link)) === "suspended") { await reply(deps, chatId, MSG.suspended); return }
  if (/^\/(help|start)(?:@\w+)?$/i.test(text)) { await reply(deps, chatId, MSG.help); return }
  if (/^\/whoami(?:@\w+)?$/i.test(text)) {
    const [o] = (await sql`SELECT name FROM organizations WHERE id = ${link.org_id}`) as any[]
    await reply(deps, chatId, `Connected to ${o?.name ?? "your workspace"} in ${link.mode === "write" ? "read and write" : "read-only"} mode.`); return
  }
  if (/^\/mode(?:@\w+)?$/i.test(text)) { await reply(deps, chatId, link.mode === "write" ? "I may propose changes. You approve each one with a tap, and I never send anything to other people from here. You can switch this off in Anker, Connected channels." : MSG.readOnly); return }
  if (/^\/inbox(?:@\w+)?$/i.test(text)) {
    const refusal = await deps.gate(link); if (refusal) { await reply(deps, chatId, refusal); return }
    const ps = await deps.pending(link, 5)
    if (!ps.length) { await reply(deps, chatId, MSG.noPending); return }
    await sendProposals(deps, link, chatId, ps); return
  }
  if (/^\/today(?:@\w+)?$/i.test(text)) {
    const refusal = await deps.gate(link); if (refusal) { await reply(deps, chatId, refusal); return }
    const t = await deps.today(link)
    const bits = [`${t.pending} waiting for your approval`, `${t.tasksToday} task${t.tasksToday === 1 ? "" : "s"} due today`, ...(t.overdue ? [`${t.overdue} overdue`] : []), `${t.replies24h} new repl${t.replies24h === 1 ? "y" : "ies"} to your outreach in the last day`]
    await reply(deps, chatId, `Today: ${bits.join(", ")}.`); return
  }
  if (!text && (m.voice || m.audio || m.document || m.photo || m.video || m.video_note || m.contact || m.location || m.sticker)) { await reply(deps, chatId, MSG.notYet); return }
  if (!text || text.startsWith("/")) { await reply(deps, chatId, MSG.help); return }

  const refusal = await deps.gate(link)
  if (refusal) { await reply(deps, chatId, refusal); return }
  const now = (deps.now ?? Date.now)()
  const [busy] = (await sql`SELECT count(*)::int AS n FROM telegram_updates WHERE chat_id = ${chatId} AND received_at > ${new Date(now - 60_000).toISOString()}::timestamptz AND status IN ('queued', 'running', 'done')`) as any[]
  if (Number(busy?.n ?? 0) > MAX_PER_MINUTE) { await reply(deps, chatId, MSG.slow); return }

  await deps.api.sendChatAction(chatId)
  const history = await recentHistory(link)
  let answer: string, runId: string | null = null
  try { const r = await deps.ask(link, text, history); answer = r.answer; runId = r.runId ?? null }
  catch (e) { await reply(deps, chatId, (e as Error)?.name === "TimeoutError" ? MSG.tooLong : (e as Error)?.message && (e as any).plain ? (e as Error).message : MSG.failed); return }
  for (const part of answerToParts(answer, `${deps.appUrl}/dashboard/anker-ai`)) await deps.api.sendMessage(chatId, part)
  await appendToChat(link, text, answer)
  // Changes the assistant proposed in this run, each with its own buttons. Nothing has been applied.
  if (runId) { const ps = await deps.newProposals(link, runId); if (ps.length) await sendProposals(deps, link, chatId, ps) }
}

const MAX_SHOWN = 5
async function sendProposals(deps: Deps, link: LinkRow, chatId: number, ps: PView[]) {
  const canTap = link.mode === "write"
  for (const p of ps.slice(0, MAX_SHOWN)) { const v = renderProposal(p, deps.appUrl, canTap); await deps.api.sendMessage(chatId, v.html, v.markup) }
  await deps.shown(link, ps.map((p) => p.id))
  if (ps.length > MAX_SHOWN) await deps.api.sendMessage(chatId, esc(`${ps.length - MAX_SHOWN} more are waiting in Anker: ${deps.appUrl}/dashboard/actions`))
}

/** A tap on Approve, Reject or Undo. Every guard is checked again here: the buttons are only a convenience, never the authority. */
async function handleCallback(cq: NonNullable<TgUpdate["callback_query"]>, deps: Deps): Promise<void> {
  const answer = (t: string, alert = true) => deps.api.answerCallback(cq.id, t, alert)
  const chat = cq.message?.chat
  if (!chat || chat.type !== "private" || !cq.from) { await answer("This only works in a private chat."); return }
  const link = await linkByTelegramUser(cq.from.id)
  if (!link || link.status !== "active") { await answer("This device is not connected. Connect it again from Anker."); return }
  if (link.mode !== "write") { await answer(MSG.readOnly); return }
  const refusal = await deps.gate(link); if (refusal) { await answer(refusal); return }
  const parsed = parseCallback(cq.data)
  if (!parsed) { await answer(MSG.stale); return }
  try {
    const r = await deps.decide(link, parsed.id, parsed.decision)
    const v = renderDecision(r.proposal, r.message, deps.appUrl, r.undoable)
    if (cq.message) await deps.api.editMessage(chat.id, cq.message.message_id, v.html, v.markup)
    await answer(r.proposal.status === "applied" ? "Done" : r.proposal.status === "rejected" ? "Rejected" : r.proposal.status === "undone" ? "Undone" : "Not applied", false)
  } catch (e) { await answer((e as Error)?.message && (e as any).plain ? (e as Error).message : MSG.failed) }
}

// ───────────── the conversation, kept once, in the workspace's own chat ─────────────
async function recentHistory(link: LinkRow): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  if (!link.anker_chat_id) return []
  const [c] = (await sql`SELECT messages FROM anker_chats WHERE id = ${link.anker_chat_id} AND user_id = ${link.user_id}`) as any[]
  const msgs = Array.isArray(c?.messages) ? c.messages : (typeof c?.messages === "string" ? JSON.parse(c.messages) : [])
  return msgs.filter((x: any) => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string").slice(-HISTORY).map((x: any) => ({ role: x.role, content: String(x.content).slice(0, 2000) }))
}

/** Makes sure the link has a chat in Anker AI (source: Telegram), so the conversation appears in the app, and returns its id. */
export async function ensureChat(link: LinkRow): Promise<string> {
  if (link.anker_chat_id) return link.anker_chat_id
  const [row] = (await sql`INSERT INTO anker_chats (user_id, scope_key, title, model, messages) VALUES (${link.user_id}, ${`org:${link.org_id}`}, 'Telegram', NULL, '[]'::jsonb) RETURNING id`) as any[]
  await sql`UPDATE telegram_links SET anker_chat_id = ${row.id} WHERE id = ${link.id}`
  link.anker_chat_id = row.id
  return row.id as string
}

async function appendToChat(link: LinkRow, question: string, answer: string): Promise<void> {
  try {
    const id = await ensureChat(link)
    const [c] = (await sql`SELECT messages FROM anker_chats WHERE id = ${id}`) as any[]
    const msgs = Array.isArray(c?.messages) ? c.messages : typeof c?.messages === "string" ? JSON.parse(c.messages) : []
    const next = [...msgs, { role: "user", content: question }, { role: "assistant", content: answer }].slice(-40)
    await sql`UPDATE anker_chats SET messages = ${JSON.stringify(next)}::jsonb, updated_at = now() WHERE id = ${id}`
  } catch (e) { console.error("[telegram] could not save the conversation:", (e as Error)?.message) }
}
