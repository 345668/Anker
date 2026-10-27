import "server-only"
import { sql } from "@/lib/db"
import { answerToParts, esc } from "./format"
import { consumeLinkCode, linkByTelegramUser, revokeByTelegramUser, touchLink, type LinkRow } from "./links"
import type { Markup } from "./api"
import { renderProposal, renderDecision, chatDecidable, parseCallback, parseNoteCallback, isRetiredNoteCallback, noteButtons, UNDO_WINDOW_MIN, type PView } from "./proposals"

/**
 * What the bot does with one update (docs/architecture/57, T1: link, and ask in read-only mode). Dependencies are injected, so the rules below are tested without Telegram or a model.
 * Rules that matter: only a Telegram user id with an ACTIVE link is served; everyone else gets one fixed message; groups are refused; nothing is stored here but the answer.
 */
export interface TgUser { id: number; username?: string; first_name?: string }
export interface TgFile { file_id: string; file_size?: number; file_name?: string; mime_type?: string; duration?: number }
export interface TgMessage { message_id: number; from?: TgUser; chat: { id: number; type: string }; text?: string; caption?: string; voice?: TgFile; audio?: TgFile; document?: TgFile; photo?: TgFile[]; video?: unknown; video_note?: unknown; contact?: unknown; location?: unknown; sticker?: unknown }
export interface TgCallback { id: string; from: TgUser; data?: string; message?: { message_id: number; chat: { id: number; type: string } } }
export interface TgUpdate { update_id: number; message?: TgMessage; edited_message?: TgMessage; callback_query?: TgCallback; my_chat_member?: { chat: { id: number; type: string } } }

export interface Api {
  sendMessage(chatId: number, html: string, markup?: Markup | null): Promise<unknown>
  editMessage(chatId: number, messageId: number, html: string, markup?: Markup | null): Promise<unknown>
  answerCallback(callbackId: string, text?: string, alert?: boolean): Promise<unknown>
  sendVoice(chatId: number, mp3: Buffer): Promise<unknown>
  sendChatAction(chatId: number): Promise<unknown>
  leaveChat(chatId: number): Promise<unknown>
}
export interface OutFile { name: string; url: string; kind: string }
export interface Attachments { text: string; refs: Array<{ id: string; name: string; base64: string }>; names: string[] }
export interface Media {
  /** Downloads and transcribes a voice note or audio file. Throws a plain-words Error when it cannot. */
  voice(link: LinkRow, f: { fileId: string; name: string }): Promise<string>
  /** Downloads and reads a document, spreadsheet or image. */
  file(link: LinkRow, f: { fileId: string; name: string; mime: string }): Promise<Attachments>
}
export interface TodayView { pending: number; tasksToday: number; overdue: number; replies24h: number }
export interface Deps {
  api: Api
  /** Why this workspace cannot use the channel right now, or null. */
  gate(link: LinkRow): Promise<string | null>
  /** Runs the assistant for the linked person and returns the answer text. Throws a plain-words Error for a refusal. */
  ask(link: LinkRow, text: string, history: Array<{ role: "user" | "assistant"; content: string }>, attachments?: Attachments): Promise<{ answer: string; runId?: string | null; artifacts?: OutFile[]; sensitive?: boolean }>
  /** Proposals the run just made (still waiting), newest last. */
  newProposals(link: LinkRow, runId: string): Promise<PView[]>
  /** Proposals waiting in the workspace. */
  pending(link: LinkRow, limit: number): Promise<PView[]>
  /** Approve, reject or undo one proposal for the linked person, with every guard. Throws a plain-words Error when it must not happen. */
  decide(link: LinkRow, proposalId: string, decision: "approve" | "reject" | "undo"): Promise<{ proposal: PView; message: string; undoable: boolean }>
  today(link: LinkRow): Promise<TodayView>
  /** An MP3 of the answer when this device wants spoken replies and is within its allowance; otherwise null. Never throws. */
  voiceReply(link: LinkRow, answer: string): Promise<Buffer | null>
  /** Sends a file the assistant generated, if it belongs to this workspace. Returns whether it was sent. */
  sendFile(link: LinkRow, chatId: number, file: OutFile): Promise<boolean>
  /** Deletes the chat's messages from the last 48 hours and clears the conversation in Anker. Returns how many messages were removed. */
  forget(link: LinkRow, chatId: number): Promise<number>
  /** Remembers the id of a message the person sent, so /forget can delete it. */
  remember(link: LinkRow, chatId: number, messageId: number): Promise<void>
  media: Media
  /** Daily limits per device for voice notes and files; a refusal in words, or null. */
  allow(link: LinkRow, kind: "voice" | "file", qty?: number): Promise<string | null>
  stash(link: LinkRow, kind: "voice", title: string, text: string): Promise<string>
  readPending(link: LinkRow, id: string): Promise<{ id: string; kind: "voice"; title: string; text: string } | null>
  dropPending(link: LinkRow, id: string): Promise<void>
  /** Remembers that a proposal was shown in the chat, so a notification does not repeat it. */
  shown(link: LinkRow, proposalIds: string[]): Promise<void>
  appUrl: string
  /** The bot this update arrived on: 'platform' (the shared bot) or a workspace's own bot. */
  botId?: string
  now?: () => number
}

export const MSG = {
  unknown: "I don't know this Telegram account yet. In Anker, open Connected channels, press Connect Telegram, and open the link it gives you on this phone.",
  pending: "Almost there. Open Anker, go to Connected channels and approve this device. Then message me again.",
  suspended: "This device has been idle for a long time, so I paused it. Open Anker, Connected channels, and approve it again.",
  group: "I only work in a private chat with me. Please message me directly.",
  voiceTooLong: "That recording is longer than I can listen to. A Telegram voice note can be up to 45 minutes; other audio files up to about five. Send it in shorter parts.",
  listening: "Listening to a long recording. This takes a minute or two.",
  sensitive: "This answer uses data room, LP or KYC records, so I'm not sending the detail through Telegram. The full answer is in Anker AI.",
  forgotten: (n: number) => `Done. I removed ${n} message${n === 1 ? "" : "s"} from the last 48 hours here, and cleared this conversation in Anker. Telegram only lets me delete messages from the last 48 hours; older ones you can delete yourself.`,
  noSpeech: "I couldn't hear any speech in that. Try recording again closer to the microphone.",
  fileTooBig: "Telegram only lets me download files up to 20 MB. Upload larger files in Anker.",
  fileType: "I can read PDF, Word and Excel files, text files and pictures. I can't open that kind of file.",
  expired: "That has expired. Send it again.",
  discarded: "Discarded. Nothing was saved.",
  slow: "One moment, I'm still working on your earlier messages.",
  codeBad: "That link has expired or was already used. In Anker, open Connected channels and press Connect Telegram for a new one.",
  alreadyLinked: "This Telegram account is already connected to a workspace. Send /unlink first if you want to connect it somewhere else.",
  unlinked: "Disconnected. I will not respond here until you connect again from Anker.",
  tooLong: "That took too long and I stopped. Please try a shorter or more specific question.",
  failed: "I couldn't answer that just now. Please try again in a moment.",
  help: "I'm Anker AI. Ask me about your workspace in plain language, for example: \"who did I contact last week?\" or \"move Katja to Contacted\".\n\nWhen I want to change something, I show you the change with Approve and Reject buttons. Nothing is changed until you tap Approve, and I never send email or messages to other people from here.\n\n/today what needs you today\n/inbox changes waiting for your approval\n/mode whether I may propose changes\n/whoami which workspace this is\n/forget delete this chat's recent messages\n/unlink disconnect this device",
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
    const r = await consumeLinkCode(start[1], { userId: tgId, chatId, username: m.from.username ?? null }, "read", deps.botId ?? "platform")
    if (r.ok) await reply(deps, chatId, MSG.pending)
    else await reply(deps, chatId, r.reason === "already_linked" ? MSG.alreadyLinked : MSG.codeBad)
    return
  }

  const link = await linkByTelegramUser(tgId, deps.botId ?? "platform")
  if (!link) { await reply(deps, chatId, MSG.unknown); return }
  if (/^\/unlink(?:@\w+)?$/i.test(text)) { await revokeByTelegramUser(tgId, deps.botId ?? "platform"); await reply(deps, chatId, MSG.unlinked); return }
  if (link.status === "pending") { await reply(deps, chatId, MSG.pending); return }
  if (link.status === "suspended") { await reply(deps, chatId, MSG.suspended); return }
  await deps.remember(link, chatId, m.message_id).catch(() => {})
  if (/^\/forget(?:@\w+)?$/i.test(text)) { await reply(deps, chatId, MSG.forgotten(await deps.forget(link, chatId))); return }

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
  if (!text && (m.voice || m.audio || m.document || m.photo)) { await handleMedia(m, link, deps); return }
  if (!text || text.startsWith("/")) { await reply(deps, chatId, MSG.help); return }

  const refusal = await deps.gate(link)
  if (refusal) { await reply(deps, chatId, refusal); return }
  const now = (deps.now ?? Date.now)()
  const [busy] = (await sql`SELECT count(*)::int AS n FROM telegram_updates WHERE chat_id = ${chatId} AND received_at > ${new Date(now - 60_000).toISOString()}::timestamptz AND status IN ('queued', 'running', 'done')`) as any[]
  if (Number(busy?.n ?? 0) > MAX_PER_MINUTE) { await reply(deps, chatId, MSG.slow); return }
  await answerQuestion(link, chatId, text, deps)
}

const failureText = (e: unknown) => ((e as Error)?.name === "TimeoutError" ? MSG.tooLong : (e as Error)?.message && (e as any).plain ? (e as Error).message : MSG.failed)

/** Runs the assistant on one question (typed, or heard, or about a file), sends the answer, keeps the exchange in the workspace's chat, and shows any change it proposed. */
async function answerQuestion(link: LinkRow, chatId: number, text: string, deps: Deps, attachments?: Attachments, label?: string): Promise<void> {
  await deps.api.sendChatAction(chatId)
  const history = await recentHistory(link)
  let r: Awaited<ReturnType<Deps["ask"]>>
  try { r = await deps.ask(link, text, history, attachments) }
  catch (e) { await reply(deps, chatId, failureText(e)); return }
  const answer = r.answer, runId = r.runId ?? null
  // The full answer always goes into the workspace's own chat in Anker. What goes through Telegram depends on what it was made from.
  await appendToChat(link, label ? `${label} ${text}` : text, answer)
  if (r.sensitive) {
    await deps.api.sendMessage(chatId, esc(MSG.sensitive), { inline_keyboard: [[{ text: "Open Anker AI", url: `${deps.appUrl}/dashboard/anker-ai` }]] })
    if (runId) { const ps = await deps.newProposals(link, runId); if (ps.length) await deps.api.sendMessage(chatId, esc(`${ps.length} change${ps.length === 1 ? " is" : "s are"} waiting for your approval in Anker.`), { inline_keyboard: [[{ text: "Open in Anker", url: `${deps.appUrl}/dashboard/actions` }]] }) }
    return
  }
  for (const part of answerToParts(answer, `${deps.appUrl}/dashboard/anker-ai`)) await deps.api.sendMessage(chatId, part)
  for (const f of (r.artifacts ?? []).slice(0, 3)) await deps.sendFile(link, chatId, f).catch(() => false)
  const mp3 = await deps.voiceReply(link, answer).catch(() => null)
  if (mp3) await deps.api.sendVoice(chatId, mp3).catch(() => {})
  // Changes the assistant proposed in this run, each with its own buttons. Nothing has been applied.
  if (runId) { const ps = await deps.newProposals(link, runId); if (ps.length) await sendProposals(deps, link, chatId, ps) }
}

// ───────────── voice notes and files (T3) ─────────────
const AUDIO_MAX_SECONDS = 300, AUDIO_MAX_BYTES = 7 * 1024 * 1024, FILE_MAX_BYTES = 20 * 1024 * 1024
/** A Telegram voice note is Ogg/Opus, which is cut into pieces (docs/architecture/57 T4): up to 45 minutes and the 20 MB the bot can download. Other audio stays at about five minutes. */
const VOICE_MAX_SECONDS = 45 * 60
const OGG_NAME = /\.(ogg|oga|opus)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|webm)$/i
const FILE_EXT = /\.(pdf|docx?|xlsx|png|jpe?g|webp|txt|md|csv|json|tsv)$/i
const DEFAULT_FILE_PROMPT = "Summarise this in a few short lines. Say what kind of document it is, and list any dates, amounts, and the names of people or firms."
const preview = (t: string, n = 700) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t)
const stamp = (now: number) => new Date(now).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

async function handleMedia(m: TgMessage, link: LinkRow, deps: Deps): Promise<void> {
  const chatId = m.chat.id
  const audio = m.voice ?? m.audio ?? (m.document && AUDIO_EXT.test(m.document.file_name ?? "") ? m.document : undefined)
  const doc = audio ? undefined : (m.document ?? (m.photo?.length ? m.photo[m.photo.length - 1] : undefined))
  if (!audio && !doc) { await reply(deps, chatId, MSG.help); return }
  const refusal = await deps.gate(link); if (refusal) { await reply(deps, chatId, refusal); return }

  if (audio) {
    const longOk = !!m.voice || OGG_NAME.test((m.audio?.file_name ?? m.document?.file_name) ?? "")
    const tooLong = longOk ? (audio.duration ?? 0) > VOICE_MAX_SECONDS || (audio.file_size ?? 0) > FILE_MAX_BYTES : (audio.duration ?? 0) > AUDIO_MAX_SECONDS || (audio.file_size ?? 0) > AUDIO_MAX_BYTES
    if (tooLong) { await reply(deps, chatId, MSG.voiceTooLong); return }
    const limit = await deps.allow(link, "voice", audio.duration); if (limit) { await reply(deps, chatId, limit); return }
    await deps.api.sendChatAction(chatId)
    if ((audio.duration ?? 0) > AUDIO_MAX_SECONDS) await reply(deps, chatId, MSG.listening)
    let text: string
    try { text = (await deps.media.voice(link, { fileId: audio.file_id, name: (m.audio?.file_name ?? m.document?.file_name) || (m.voice ? "voice.ogg" : `audio.${(audio.mime_type ?? "audio/mpeg").split("/")[1]?.replace("mpeg", "mp3") || "mp3"}`) })).trim() }
    catch (e) { await reply(deps, chatId, failureText(e)); return }
    if (!text) { await reply(deps, chatId, MSG.noSpeech); return }
    const id = await deps.stash(link, "voice", `Voice note, ${stamp((deps.now ?? Date.now)())}`, text)
    // The transcript is shown before anything is done with it: speech recognition is wrong exactly where it matters (names, amounts, dates).
    await deps.api.sendMessage(chatId, `<b>Heard:</b> ${esc(preview(text))}\n\nShall I answer it?`, noteButtons(id))
    return
  }

  const name = m.document?.file_name || `photo-${m.message_id}.jpg`, mime = m.document?.mime_type || "image/jpeg"
  if ((doc!.file_size ?? 0) > FILE_MAX_BYTES) { await reply(deps, chatId, MSG.fileTooBig); return }
  if (!FILE_EXT.test(name)) { await reply(deps, chatId, MSG.fileType); return }
  const limit = await deps.allow(link, "file"); if (limit) { await reply(deps, chatId, limit); return }
  await deps.api.sendChatAction(chatId)
  let att: Attachments
  try { att = await deps.media.file(link, { fileId: doc!.file_id, name, mime }) } catch (e) { await reply(deps, chatId, failureText(e)); return }
  const question = (m.caption ?? "").trim() || DEFAULT_FILE_PROMPT
  await answerQuestion(link, chatId, question, deps, att, `[attached: ${name}]`)
}

/** A tap under a held voice note: ask Anker about it, or discard it. */
async function handleNoteTap(cq: NonNullable<TgUpdate["callback_query"]>, link: LinkRow, note: { action: "ask" | "drop"; id: string }, deps: Deps): Promise<void> {
  const chat = cq.message!.chat, mid = cq.message!.message_id
  const answer = (t: string, alert = true) => deps.api.answerCallback(cq.id, t, alert)
  try {
    if (note.action === "drop") { await deps.dropPending(link, note.id); await deps.api.editMessage(chat.id, mid, esc(MSG.discarded), null); await answer("Discarded", false); return }
    const p = await deps.readPending(link, note.id)
    if (!p) { await answer(MSG.expired); return }
    await deps.dropPending(link, note.id)
    await deps.api.editMessage(chat.id, mid, `<b>Heard:</b> ${esc(preview(p.text))}`, null)
    await answer("On it", false)
    await answerQuestion(link, chat.id, p.text, deps, undefined, "(voice note)")
  } catch (e) { await answer((e as Error)?.message && (e as any).plain ? (e as Error).message : MSG.failed) }
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
  const link = await linkByTelegramUser(cq.from.id, deps.botId ?? "platform")
  if (!link || link.status !== "active") { await answer("This device is not connected. Connect it again from Anker."); return }
  if (isRetiredNoteCallback(cq.data)) { await answer("Saving notes from Telegram is no longer available. Record calls with Halyard, or add notes in Call notes in Anker."); return }
  const note = parseNoteCallback(cq.data)
  if (note && cq.message) { const g = await deps.gate(link); if (g) { await answer(g); return } await handleNoteTap(cq, link, note, deps); return }
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
