/**
 * Proposals as Telegram messages (docs/architecture/57, T2). Pure. A proposal is shown with what would change, and can be approved or rejected with a tap only when it is small
 * and reversible (R0 or R1 with no typed count). Anything that reaches a third party (R2) or is bigger is shown with a link to the app and no approve button.
 */
import { esc } from "./format"
import type { Markup } from "./api"

export interface PView { id: string; capability: string; summary: string; diff: Array<{ label: string; before: string | null; after: string | null }> | null; evidence: any; risk_class: "R0" | "R1" | "R2" | "R3"; source_trust: string; status: string; applied_at?: string | null; undo?: unknown }
export const UNDO_WINDOW_MIN = 30

/** Whether a person may decide this proposal from the chat, and if not, why (shown to them). */
export function chatDecidable(p: Pick<PView, "risk_class" | "evidence" | "capability">): { ok: true } | { ok: false; why: string } {
  if (p.risk_class === "R2" || p.risk_class === "R3") return { ok: false, why: "This one reaches other people, so it is approved in Anker, not in the chat." }
  if (p.evidence?.requiresTypedCount) return { ok: false, why: "This is a large batch, so it is approved in Anker, where you can read it first." }
  return { ok: true }
}

const diffLine = (d: { label: string; before: string | null; after: string | null }) => `${esc(d.label)}: ${d.before == null ? "" : `${esc(d.before)} → `}<b>${esc(d.after ?? "")}</b>`

export function renderProposal(p: PView, appUrl: string, canTap: boolean): { html: string; markup: Markup } {
  const open = { text: "Open in Anker", url: `${appUrl}/dashboard/actions` }
  const lines = [`<b>${esc(p.summary)}</b>`, ...(p.diff ?? []).slice(0, 6).map(diffLine)]
  if (p.source_trust === "untrusted") lines.push("<i>Based partly on outside content (a web page or a document). Check it before approving.</i>")
  const dec = chatDecidable(p)
  if (!dec.ok) lines.push(esc(dec.why))
  else if (!canTap) lines.push("This device is read-only. Allow changes in Anker, Connected channels, to approve from here.")
  const buttons: Markup["inline_keyboard"] = dec.ok && canTap ? [[{ text: "Approve", callback_data: `a:${p.id}` }, { text: "Reject", callback_data: `r:${p.id}` }], [open]] : [[open]]
  return { html: lines.join("\n"), markup: { inline_keyboard: buttons } }
}

/** The message after a decision: no approve button again, and an Undo for a change that can be taken back soon after. */
export function renderDecision(p: PView, message: string, appUrl: string, undoable: boolean): { html: string; markup: Markup } {
  const head = p.status === "applied" ? "✅ Applied" : p.status === "rejected" ? "✖ Rejected" : p.status === "undone" ? "↩ Undone" : p.status === "failed" ? "⚠ Not applied" : "ℹ " + p.status
  return { html: `${head}: ${esc(p.summary)}\n${esc(message)}`, markup: { inline_keyboard: undoable && p.status === "applied" ? [[{ text: "Undo", callback_data: `u:${p.id}` }]] : [[{ text: "Open in Anker", url: `${appUrl}/dashboard/actions` }]] } }
}

export const parseCallback = (data: string | undefined): { decision: "approve" | "reject" | "undo"; id: string } | null => {
  const m = /^([aru]):([0-9a-f-]{36})$/i.exec(data ?? "")
  return m ? { decision: m[1] === "a" ? "approve" : m[1] === "r" ? "reject" : "undo", id: m[2] } : null
}

/** The buttons under a held voice note: ask Anker about it, or throw it away. (`n:` was "save as a call note": retired, docs/architecture/62 H0.) */
export const parseNoteCallback = (data: string | undefined): { action: "ask" | "drop"; id: string } | null => {
  const m = /^([qx]):([0-9a-f-]{36})$/i.exec(data ?? "")
  return m ? { action: m[1] === "q" ? "ask" : "drop", id: m[2] } : null
}
/** A tap on a button from before the retirement of saving notes from Telegram. */
export const isRetiredNoteCallback = (data: string | undefined) => /^n:[0-9a-f-]{36}$/i.test(data ?? "")
export function noteButtons(id: string): Markup {
  return { inline_keyboard: [[{ text: "Ask Anker", callback_data: `q:${id}` }, { text: "Discard", callback_data: `x:${id}` }]] }
}
