"use client"

/**
 * OutreachComposer — opens for a single CRM entry.
 *
 *   1. Calls /api/outreach/generate to produce the 4-step DM sequence
 *   2. Shows the day-0 / day-3 / day-7 / day-14 drafts side by side
 *   3. Each draft is editable inline; PATCH back to the message id
 *   4. The day-0 message has an "Approve & queue" button — once
 *      approved the rate-limiter has already scheduled it (returned
 *      in the generate response)
 *
 * Local-AI first.  No auto-send anywhere.  Approval gate per the
 * playbook hard rule.
 */

import { useEffect, useRef, useState, useTransition } from "react"
import { Loader2, X, Send, Save, Trash2, Sparkles, AlertTriangle, CheckCircle2, MessageSquareReply } from "lucide-react"
import type { FounderCtx } from "./founder-context-card"

interface Message {
  id: string
  kind: "connection_request" | "follow_up" | "different_angle" | "close_loop"
  step_number: number
  body: string
  char_count: number
  status: string
  scheduled_for: string | null
}

interface Reply {
  id: string
  inbound_text: string
  classification: string | null
  draft_response: string | null
  recommended_stage: string | null
  reengage_on: string | null
  generated_by: string | null
  notes: string | null
  received_at: string
}

interface CrmEntry {
  id: string
  displayName: string
  displayTitle: string | null
  displayLinkedin: string | null
  displayEmail: string | null
  displayType: string | null
  stage: string
}

const KIND_LABEL: Record<Message["kind"], { label: string; day: string; max: number }> = {
  connection_request: { label: "Connection request", day: "Day 0",  max: 280 },
  follow_up:          { label: "Follow-up",          day: "Day 3",  max: 320 },
  different_angle:    { label: "Different angle",    day: "Day 7",  max: 320 },
  close_loop:         { label: "Close the loop",     day: "Day 14", max: 320 },
}

interface Props {
  entry: CrmEntry
  founder: FounderCtx
  onClose: () => void
  onAfterChange?: () => void
}

export function OutreachComposer({ entry, founder, onClose, onAfterChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [replies, setReplies] = useState<Reply[]>([])
  const [generating, startGenerate] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const [day0Scheduled, setDay0Scheduled] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [classifyPending, startClassify] = useTransition()

  // Load existing messages + replies on open
  useEffect(() => {
    void fetchExisting()
    void fetchReplies()
  }, [entry.id])

  async function fetchExisting() {
    try {
      const res = await fetch(`/api/outreach/messages?crmEntryId=${entry.id}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data?.messages)) setMessages(data.messages)
      }
    } catch {/* swallow */}
  }
  async function fetchReplies() {
    try {
      const res = await fetch(`/api/outreach/replies?crmEntryId=${entry.id}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data?.replies)) setReplies(data.replies)
      }
    } catch {/* swallow */}
  }

  function generate() {
    if (!founder.companyName || !founder.oneLiner) {
      setError("Fill in your company + one-liner in 'Your context for outreach' first.")
      return
    }
    setError(null)
    startGenerate(async () => {
      try {
        const res = await fetch("/api/outreach/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crmEntryIds: [entry.id], founder }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Generate failed (${res.status})`)
        setProvider(data.provider ?? null)
        const g = (data.generated ?? [])[0]
        if (g) {
          setMessages(g.messages ?? [])
          setDay0Scheduled(g.day0Scheduled ?? null)
        }
        onAfterChange?.()
      } catch (e: any) {
        setError(e?.message ?? "Generate failed")
      }
    })
  }

  async function patchMessage(id: string, patch: Record<string, any>) {
    try {
      const res = await fetch(`/api/outreach/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      // Re-load
      await fetchExisting()
      onAfterChange?.()
    } catch (e: any) {
      setError(e?.message ?? "Save failed")
    }
  }

  async function deleteMessage(id: string) {
    if (!confirm("Delete this draft?")) return
    try {
      const res = await fetch(`/api/outreach/messages/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Delete failed (${res.status})`)
      }
      await fetchExisting()
    } catch (e: any) {
      setError(e?.message ?? "Delete failed")
    }
  }

  function classifyReply() {
    if (!replyText.trim()) {
      setError("Paste the partner's reply text first.")
      return
    }
    setError(null)
    startClassify(async () => {
      try {
        const res = await fetch("/api/outreach/replies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            crmEntryId: entry.id,
            replyText,
            founder,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Classify failed (${res.status})`)
        setReplyText("")
        await fetchReplies()
        onAfterChange?.()
      } catch (e: any) {
        setError(e?.message ?? "Classify failed")
      }
    })
  }

  const hasMessages = messages.length > 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30" />
      <div
        className="relative w-[640px] max-w-full bg-background border-l border-foreground/10 h-full overflow-y-auto z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-foreground/10 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl leading-tight">Outreach: {entry.displayName}</h2>
            {entry.displayTitle && <p className="text-sm text-muted-foreground mt-0.5">{entry.displayTitle}</p>}
            {entry.displayType && <p className="text-[11px] font-mono text-muted-foreground mt-1">{entry.displayType}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm hover:bg-foreground/90 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {hasMessages ? "Regenerate sequence" : "Generate 4-step sequence"}
            </button>
            {provider && (
              <span className="text-[10px] font-mono text-muted-foreground">via {provider}</span>
            )}
            {day0Scheduled && (
              <span className="text-[10px] font-mono text-emerald-600">
                day-0 scheduled for {new Date(day0Scheduled).toLocaleString()}
              </span>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="text-rose-700 dark:text-rose-400">{error}</span>
            </div>
          )}

          {/* 4-step sequence */}
          <div className="space-y-3">
            {messages
              .slice()
              .sort((a, b) => a.step_number - b.step_number)
              .map((m) => (
                <MessageCard
                  key={m.id}
                  m={m}
                  onPatch={(p) => patchMessage(m.id, p)}
                  onDelete={() => deleteMessage(m.id)}
                />
              ))}
            {!hasMessages && !generating && (
              <div className="text-center text-xs text-muted-foreground py-8 border border-dashed border-foreground/15 rounded-md">
                No drafts yet. Click "Generate" to produce a 4-step LinkedIn sequence.
              </div>
            )}
          </div>

          {/* Reply handler */}
          <div className="border-t border-foreground/10 pt-5">
            <h3 className="font-display text-base mb-2 flex items-center gap-2">
              <MessageSquareReply className="w-4 h-4" /> Reply received?
            </h3>
            <p className="text-[11px] text-muted-foreground mb-2">
              Paste the partner's reply. Local-AI classifies (INTERESTED / WRONG-FIT / …) and drafts a response under 320 chars.
            </p>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={4}
              placeholder={"Paste their LinkedIn / email reply here…"}
              className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={classifyReply}
                disabled={classifyPending || !replyText.trim()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-foreground/15 text-sm hover:bg-foreground/5 disabled:opacity-50"
              >
                {classifyPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Classify + draft response
              </button>
            </div>

            {replies.length > 0 && (
              <div className="mt-4 space-y-3">
                {replies.map((r) => (
                  <div key={r.id} className="border border-foreground/10 rounded-md p-3">
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider mb-1">
                      <span className={`px-1.5 py-0.5 rounded ${classColor(r.classification)}`}>
                        {r.classification ?? "—"}
                      </span>
                      {r.recommended_stage && (
                        <span className="text-muted-foreground">→ stage: {r.recommended_stage}</span>
                      )}
                      {r.reengage_on && (
                        <span className="text-muted-foreground">re-ping {r.reengage_on}</span>
                      )}
                      <span className="ml-auto text-muted-foreground">
                        {new Date(r.received_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] italic text-muted-foreground line-clamp-3 mb-2">
                      "{r.inbound_text}"
                    </div>
                    {r.draft_response && (
                      <div className="text-xs leading-relaxed bg-foreground/[0.03] p-2 rounded">
                        {r.draft_response}
                      </div>
                    )}
                    {r.notes && (
                      <div className="text-[10px] font-mono text-muted-foreground mt-1">{r.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageCard({
  m,
  onPatch,
  onDelete,
}: {
  m: Message
  onPatch: (p: Record<string, any>) => void
  onDelete: () => void
}) {
  const meta = KIND_LABEL[m.kind]
  const [body, setBody] = useState(m.body)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const dirty = body !== m.body
  const tooLong = body.length > meta.max
  const isLocked = ["sent", "delivered", "replied"].includes(m.status)

  return (
    <div className="border border-foreground/10 rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider">
          <span className="text-muted-foreground">{meta.day}</span>
          <span>{meta.label}</span>
          <span className={`px-1.5 py-0.5 rounded ${statusColor(m.status)}`}>{m.status}</span>
          {m.scheduled_for && (
            <span className="text-muted-foreground">scheduled {new Date(m.scheduled_for).toLocaleString()}</span>
          )}
        </div>
        <div className={`text-[10px] font-mono ${tooLong ? "text-rose-600" : "text-muted-foreground"}`}>
          {body.length} / {meta.max}
        </div>
      </div>
      <textarea
        ref={taRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        disabled={isLocked}
        className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background leading-relaxed disabled:opacity-60"
      />
      <div className="flex items-center justify-end gap-2 mt-2">
        {!isLocked && dirty && (
          <button
            type="button"
            onClick={() => onPatch({ body })}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-foreground/15 hover:bg-foreground/5"
          >
            <Save className="w-3 h-3" /> Save edits
          </button>
        )}
        {!isLocked && m.status === "draft" && !dirty && (
          <button
            type="button"
            onClick={() => onPatch({ status: "approved" })}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <CheckCircle2 className="w-3 h-3" /> Approve
          </button>
        )}
        {!isLocked && m.status === "approved" && (
          <button
            type="button"
            onClick={() => onPatch({ status: "sent" })}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-foreground text-background hover:bg-foreground/90"
            title="Mark as sent (use after copying the body into LinkedIn / HeyReach)"
          >
            <Send className="w-3 h-3" /> Mark as sent
          </button>
        )}
        {!isLocked && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

function classColor(c: string | null): string {
  if (c === "INTERESTED") return "bg-emerald-100 text-emerald-700"
  if (c === "INTERESTED_LATER") return "bg-amber-100 text-amber-700"
  if (c === "QUESTION") return "bg-blue-100 text-blue-700"
  if (c === "WRONG_NOW") return "bg-orange-100 text-orange-700"
  if (c === "WRONG_FIT") return "bg-rose-100 text-rose-700"
  return "bg-foreground/5 text-foreground/60"
}
function statusColor(s: string): string {
  if (s === "draft") return "bg-foreground/5 text-foreground/60"
  if (s === "approved") return "bg-amber-100 text-amber-700"
  if (s === "queued") return "bg-blue-100 text-blue-700"
  if (s === "sent" || s === "delivered") return "bg-emerald-100 text-emerald-700"
  if (s === "replied" || s === "accepted") return "bg-violet-100 text-violet-700"
  if (s === "failed" || s === "cancelled") return "bg-rose-100 text-rose-700"
  return "bg-foreground/5 text-foreground/60"
}
