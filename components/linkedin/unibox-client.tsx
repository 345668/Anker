"use client"

import { useState } from "react"
import { Loader2, Send, Inbox, RefreshCw, Check } from "lucide-react"
import type { LiConversation, LiMessage } from "@/lib/linkedin/types"

const fmtTime = (s: string | null) => (s ? new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "")

export function UniboxClient({
  initial,
  counts,
}: {
  initial: LiConversation[]
  counts: { total: number; unread: number }
}) {
  const [conversations, setConversations] = useState<LiConversation[]>(initial)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<LiMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [sentNote, setSentNote] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const active = conversations.find((c) => c.id === activeId) || null
  const shown = unreadOnly ? conversations.filter((c) => c.unread) : conversations

  async function openThread(id: string) {
    setActiveId(id); setMessages([]); setSentNote(null); setLoadingThread(true)
    try {
      const d = await (await fetch(`/api/linkedin/inbox/${id}`)).json()
      if (d.messages) setMessages(d.messages)
      // Mark read locally.
      const conv = conversations.find((c) => c.id === id)
      if (conv?.unread) {
        fetch(`/api/linkedin/inbox/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ unread: false }) })
        setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, unread: false } : c)))
      }
    } finally { setLoadingThread(false) }
  }

  async function refresh() {
    setRefreshing(true)
    try {
      const d = await (await fetch(`/api/linkedin/inbox`)).json()
      if (d.conversations) setConversations(d.conversations)
    } finally { setRefreshing(false) }
  }

  async function sendReply() {
    if (!active?.id || !reply.trim()) return
    setSending(true); setSentNote(null)
    try {
      const d = await (await fetch(`/api/linkedin/inbox/${active.id}/reply`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: reply }),
      })).json()
      if (d.ok) {
        setReply("")
        setSentNote(d.queued === "queued" ? "Queued to send." : "Sent to Review Queue for approval.")
      } else {
        setSentNote(d.error || "Failed to queue reply.")
      }
    } finally { setSending(false) }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{counts.total} conversations · {counts.unread} unread</span>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only
          </label>
        </div>
        <button onClick={refresh} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs">
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </button>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No conversations yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Open the extension → <b>Outreach</b> tab → <b>Sync inbox now</b> to pull your LinkedIn conversations in.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          {/* Conversation list */}
          <div className="overflow-hidden rounded-lg border divide-y max-h-[70vh] overflow-y-auto">
            {shown.map((c) => (
              <button key={c.id} onClick={() => openThread(c.id)}
                className={`block w-full text-left p-3 hover:bg-muted/40 ${activeId === c.id ? "bg-muted/60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>{c.participantName || "Unknown"}</span>
                  {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#0a66c2]" />}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {c.lastDirection === "outbound" ? "You: " : ""}{c.lastMessageText || "—"}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{fmtTime(c.lastMessageAt)}</span>
                  {c.campaignId && <span className="rounded-full bg-[#0a66c2]/10 px-1.5 text-[10px] text-[#0a66c2]">campaign</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Thread */}
          <div className="rounded-lg border flex flex-col max-h-[70vh]">
            {!active ? (
              <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">Select a conversation</div>
            ) : (
              <>
                <div className="border-b p-3">
                  <div className="font-medium">{active.participantName || "Unknown"}</div>
                  {active.participantUrl && (
                    <a href={active.participantUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">
                      {active.participantUrl.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  )}
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  {loadingThread ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground">No messages captured. The list snippet is shown on the left; deeper history syncs as the extension improves.</p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.direction === "outbound" ? "bg-[#0a66c2] text-white" : "bg-muted"}`}>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <div className={`mt-1 text-[10px] ${m.direction === "outbound" ? "text-white/70" : "text-muted-foreground"}`}>{fmtTime(m.sentAt)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t p-3">
                  <textarea className="w-full rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-[#0a66c2]/30"
                    rows={2} placeholder="Write a reply… (queues through the approval gate)" value={reply} onChange={(e) => setReply(e.target.value)} />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{sentNote && <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="h-3.5 w-3.5" /> {sentNote}</span>}</span>
                    <button onClick={sendReply} disabled={sending || !reply.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Queue reply
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
