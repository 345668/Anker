"use client"

/**
 * OutreachPowerhouse — /dashboard/outreach, the command surface of the
 * outreach engine.
 *
 *   Header  : editorial title + live KPIs (sent 30d, open rate, click rate,
 *             replies, scheduled, follow-ups due)
 *   Tabs    :
 *     Campaigns : the existing campaigns + members + templates engine
 *     Inbox     : actionable queues — follow-ups due (sent, no answer) and
 *                 inbound replies with AI-classified intent + draft response;
 *                 items clear inline and deep-link to CRM / studio
 *     Analytics : per-campaign funnel (members → drafted → sent → opened →
 *                 clicked → replied) with response-rate bars
 *   Studio  : per-contact drafting lives at /dashboard/outreach/studio —
 *             linked from the header and from every inbox row.
 */

import { useState, useEffect } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  Megaphone, Inbox as InboxIcon, BarChart3, PenLine, Check, Loader2,
  ExternalLink, MailOpen, MousePointerClick, Reply, CalendarClock, Send, X,
} from "lucide-react"
import { OutreachCampaigns } from "@/components/tesseract/outreach-campaigns"
import { requestJson, errorMessage, swrFetcher } from "@/lib/http/client"
import { DataError, DataLoading } from "@/components/shell/data-state"

type CampaignsProps = React.ComponentProps<typeof OutreachCampaigns>

interface Stats {
  sentAll: number; sent30d: number; openRate: number | null; clickRate: number | null
  scheduled: number; followupsDue: number; replies30d: number; repliesAwaiting: number
  deliveredRate: number | null; bounced30d: number
  scheduleSent: number; callsBooked: number; callConversion: number | null
}

interface FollowupRow {
  id: string; crm_entry_id: string | null; kind: string | null; subject: string | null
  sent_at: string | null; opens: number | null; clicks: number | null
  followup_due_at: string | null; display_name: string | null; stage: string | null
}

interface ReplyRow {
  id: string; crm_entry_id: string | null; inbound_text: string | null
  classification: string | null; draft_response: string | null
  recommended_stage: string | null; approved: boolean | null
  received_at: string; display_name: string | null; stage: string | null
  notes?: string | null; meeting_intent?: boolean | null
}

interface CampaignStat {
  id: string; name: string; status: string | null
  members: number; drafted: number; sent: number; last_sent_at: string | null
  opened: number; clicked: number; replied: number
}

interface DeliveryStatusRow {
  outreachMessageId: string
  status: "sending" | "sent" | "queued" | "failed"
  firstAttemptAt: string
  updatedAt: string
  lastError: string | null
}

type Tab = "campaigns" | "inbox" | "analytics"

const ago = (iso: string | null) => {
  if (!iso) return ""
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return d <= 0 ? "today" : d === 1 ? "1d" : `${d}d`
}

export function OutreachPowerhouse(props: CampaignsProps) {
  const [tab, setTab] = useState<Tab>("campaigns")
  // Deep-link support: the "Ready for a call" card links to #inbox to jump the
  // founder straight to the replies queue. Honor the hash on mount + changes.
  useEffect(() => {
    const applyHash = () => {
      const h = typeof window !== "undefined" ? window.location.hash.replace("#", "") : ""
      if (h === "inbox" || h === "campaigns" || h === "analytics") setTab(h as Tab)
    }
    applyHash()
    window.addEventListener("hashchange", applyHash)
    return () => window.removeEventListener("hashchange", applyHash)
  }, [])
  const { data: stats, mutate: mutateStats, error: statsError } = useSWR<Stats>("/api/outreach/stats", swrFetcher)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  async function syncResend() {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch("/api/outreach/sync-resend", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Sync failed (${res.status})`)
      setSyncMsg(`Checked ${data.checked} emails${data.events ? " · " + Object.entries(data.events).map(([k, v]) => `${k}: ${v}`).join(", ") : ""}${data.remaining ? " · more pending, run again" : ""}`)
      mutateStats(); mutateInbox()
    } catch (e: any) { setSyncMsg(e?.message ?? "Sync failed") }
    finally { setSyncing(false) }
  }
  const { data: inbox, mutate: mutateInbox, error: inboxError, isLoading: inboxLoading } = useSWR<{ followups: FollowupRow[]; replies: ReplyRow[] }>(
    "/api/outreach/followups", swrFetcher)
  const { data: analytics, error: analyticsError, isLoading: analyticsLoading, mutate: mutateAnalytics } = useSWR<{ campaigns: CampaignStat[] }>(
    tab === "analytics" ? "/api/outreach/analytics" : null, swrFetcher)
  const { data: deliveryMonitor, error: deliveryMonitorError, mutate: mutateDeliveryMonitor } = useSWR<{ deliveries: DeliveryStatusRow[] }>(
    tab === "analytics" ? "/api/outreach/delivery-status" : null, swrFetcher)

  const inboxCount = (inbox?.followups?.length ?? 0) + (inbox?.replies?.filter((r) => !r.approved).length ?? 0)

  async function clearFollowup(id: string) {
    await fetch("/api/outreach/followups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: id, done: true }),
    })
    mutateInbox()
  }
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [deliveryErrors, setDeliveryErrors] = useState<Record<string, string>>({})
  async function approveReply(id: string, opts: { send: boolean; editedDraft?: string }) {
    setSending(id)
    try {
      const body = await requestJson<{ delivery?: { ok?: boolean; reason?: string } }>("/api/outreach/followups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: id, approved: true, send: opts.send, editedDraft: opts.editedDraft }),
      })
      if (body.delivery && body.delivery.ok === false) {
        setDeliveryErrors((prev) => ({ ...prev, [id]: body.delivery?.reason || "Delivery failed. Retry when ready." }))
      } else setDeliveryErrors((prev) => { const next = { ...prev }; delete next[id]; return next })
      mutateInbox(); mutateStats()
    } catch (e) { setDeliveryErrors((prev) => ({ ...prev, [id]: errorMessage(e) }))
    } finally { setSending(null) }
  }

  async function retryReply(id: string) {
    setSending(id)
    try {
      const body = await requestJson<{ delivery?: { ok?: boolean; reason?: string } }>("/api/outreach/followups", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replyId: id, approved: true, retry: true }),
      })
      if (body.delivery?.ok) setDeliveryErrors((prev) => { const next = { ...prev }; delete next[id]; return next })
      else setDeliveryErrors((prev) => ({ ...prev, [id]: body.delivery?.reason || "Delivery failed. Retry when ready." }))
      mutateInbox(); mutateStats()
    } catch (e) { setDeliveryErrors((prev) => ({ ...prev, [id]: errorMessage(e) })) } finally { setSending(null) }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="platform-page-header !pb-0">
        <div className="flex items-end justify-between gap-6 flex-wrap pb-4">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-1.5">
              <span className="w-8 h-px bg-foreground/30" />
              Outreach · campaigns → drafts → replies
            </span>
            <h1 className="text-3xl lg:text-4xl font-display tracking-tight leading-[0.95]">Outreach</h1>
            <p className="mt-2 text-sm">Review drafts, manage campaigns, and follow up on replies.</p>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <Kpi label="Sent · 30d" value={stats ? String(stats.sent30d) : "…"} />
            <Kpi label="Open rate" value={stats?.openRate != null ? `${stats.openRate}%` : "—"} />
            <Kpi label="Click rate" value={stats?.clickRate != null ? `${stats.clickRate}%` : "—"} />
            <Kpi label="Delivered" value={stats?.deliveredRate != null ? `${stats.deliveredRate}%` : "—"} />
            <Kpi label="Bounced" value={stats ? String(stats.bounced30d) : "…"} warn={(stats?.bounced30d ?? 0) > 0} />
            <Kpi label="Replies · 30d" value={stats ? String(stats.replies30d) : "…"} />
            <Kpi label="Scheduled" value={stats ? String(stats.scheduled) : "…"} />
            <Kpi
              label="Call conv."
              value={stats?.callConversion != null ? `${stats.callConversion}%` : "—"}
              title={stats ? `${stats.callsBooked}/${stats.scheduleSent} investors sent a scheduling email have a logged call` : undefined}
            />
            <Kpi label="Due" value={stats ? String(stats.followupsDue) : "…"} warn={(stats?.followupsDue ?? 0) > 0} />
            <button onClick={syncResend} disabled={syncing}
              title="Pull delivery / open / click / bounce telemetry from Resend"
              className="inline-flex items-center gap-2 rounded min-h-11 px-4 border border-foreground/15 hover:bg-foreground/5 text-sm disabled:opacity-50">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailOpen className="w-4 h-4" />}
              Sync Resend
            </button>
            <Link href="/dashboard/outreach/studio"
              className="inline-flex items-center gap-2 rounded min-h-11 px-4 bg-foreground text-background hover:bg-foreground/90 text-sm">
              <PenLine className="w-4 h-4" /> Studio
            </Link>
          </div>
        </div>

        {syncMsg && (
          <div className="pb-3 -mt-1 text-xs font-mono text-muted-foreground">{syncMsg}</div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {([
            ["campaigns", "Campaigns", Megaphone, null],
            ["inbox", "Inbox", InboxIcon, inboxCount || null],
            ["analytics", "Analytics", BarChart3, null],
          ] as const).map(([key, label, Icon, badge]) => (
            <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 px-3 sm:px-4 min-h-12 shrink-0 text-sm border-b-2 -mb-px transition-colors ${
                tab === key ? "border-[var(--platform-link)] text-[var(--platform-link)]" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" />
              {label}
              {badge != null && (
                <span className="font-mono text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-[var(--platform-warning)]">{badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {statsError && <div className="px-4 sm:px-6 lg:px-8 pt-4"><DataError label="Outreach metrics could not be loaded." onRetry={() => mutateStats()} /></div>}
      {tab === "campaigns" && <OutreachCampaigns {...props} />}

      {tab === "inbox" && (
        <div className="px-4 sm:px-6 lg:px-8 py-6 grid lg:grid-cols-2 gap-6 items-start">
          {inboxError && <div className="lg:col-span-2"><DataError label="The outreach inbox could not be loaded." onRetry={() => mutateInbox()} /></div>}
          {/* Follow-ups due */}
          <section className="platform-panel overflow-hidden">
            <div className="px-4 py-2.5 border-b border-foreground/10 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[var(--platform-warning)]" />
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Follow-ups due · {inbox?.followups?.length ?? 0}
              </span>
            </div>
            <div className="divide-y divide-foreground/5">
              {(inbox?.followups ?? []).map((f) => (
                <div key={f.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{f.display_name ?? "Unknown contact"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[f.kind === "dm_intro" ? "DM" : "Email", f.subject].filter(Boolean).join(" · ")}
                      {" · sent "}{ago(f.sent_at)} ago
                      {f.opens ? ` · ${f.opens} opens` : " · unopened"}
                    </div>
                  </div>
                  {f.crm_entry_id && (
                    <Link href={`/dashboard/outreach/studio?entry=${encodeURIComponent(f.crm_entry_id)}`}
                      className="h-7 px-2.5 rounded-full border border-foreground/15 hover:bg-foreground/5 text-xs inline-flex items-center gap-1">
                      <PenLine className="w-3 h-3" /> Nudge
                    </Link>
                  )}
                  <button onClick={() => clearFollowup(f.id)} title="Mark handled"
                    className="h-7 w-7 rounded-full border border-foreground/15 hover:border-emerald-500/50 hover:text-emerald-700 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {inbox && !inbox.followups?.length && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing due — clean slate.</div>
              )}
              {inboxLoading && <DataLoading label="Loading follow-ups" />}
            </div>
          </section>

          {/* Replies */}
          <section className="platform-panel overflow-hidden">
            <div className="px-4 py-2.5 border-b border-foreground/10 flex items-center gap-2">
              <Reply className="w-4 h-4 text-emerald-700" />
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Replies · 30d · {inbox?.replies?.length ?? 0}
              </span>
            </div>
            <div className="divide-y divide-foreground/5">
              {(inbox?.replies ?? []).map((r) => (
                <div key={r.id} className={`px-4 py-3 ${r.approved ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate flex-1">{r.display_name ?? "Unknown contact"}</span>
                    {r.meeting_intent && !r.approved && (
                      <span className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#e5380f] text-white">
                        <CalendarClock className="w-2.5 h-2.5" /> book me
                      </span>
                    )}
                    {r.classification && (
                      <span className="font-mono text-xs uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-foreground/15">
                        {r.classification}
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{ago(r.received_at)}</span>
                  </div>
                  {r.inbound_text && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.inbound_text}</p>
                  )}
                  {r.notes && !r.approved && (
                    <p className="mt-1 text-xs text-muted-foreground/80"><span className="font-mono uppercase tracking-wider text-xs mr-1">why</span>{r.notes}</p>
                  )}
                  {r.draft_response && !r.approved && (
                    <div className="mt-1.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-mono text-xs uppercase tracking-wider text-emerald-700">AI draft — edit &amp; send</span>
                      </div>
                      <textarea
                        value={drafts[r.id] ?? r.draft_response}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                        rows={3}
                        className="w-full resize-y rounded-md bg-emerald-500/5 border border-emerald-500/20 p-2 text-xs focus:outline-none focus:border-emerald-500/50"
                      />
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          onClick={() => approveReply(r.id, { send: true, editedDraft: drafts[r.id] ?? r.draft_response ?? undefined })}
                          disabled={sending === r.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 h-7 text-xs font-medium hover:bg-foreground/90 disabled:opacity-50"
                        >
                          {sending === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Approve &amp; send
                        </button>
                        <button
                          onClick={() => approveReply(r.id, { send: false })}
                          disabled={sending === r.id}
                          title="Mark handled without sending"
                          className="inline-flex items-center gap-1 rounded-full border border-foreground/15 px-3 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 disabled:opacity-50"
                        >
                          <X className="w-3 h-3" /> Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                  {r.approved && deliveryErrors[r.id] && <div role="alert" className="mt-2 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"><span>{deliveryErrors[r.id]}</span> <button onClick={() => retryReply(r.id)} disabled={sending === r.id} className="ml-2 underline">Retry delivery</button></div>}
                  {!r.draft_response && !r.approved && (
                    <button onClick={() => approveReply(r.id, { send: false })} disabled={sending === r.id}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-foreground/15 px-3 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5">
                      <Check className="w-3 h-3" /> Mark handled
                    </button>
                  )}
                  {r.crm_entry_id && (
                    <Link href={`/dashboard/outreach/studio?entry=${encodeURIComponent(r.crm_entry_id)}`}
                      className="mt-1.5 ml-2 inline-flex items-center gap-1 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3 h-3" /> Open in studio
                    </Link>
                  )}
                </div>
              ))}
              {inbox && !inbox.replies?.length && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No replies in the last 30 days.</div>
              )}
              {inboxLoading && <DataLoading label="Loading replies" />}
            </div>
          </section>
        </div>
      )}

      {tab === "analytics" && (
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {analyticsError && <div className="mb-4"><DataError label="Campaign analytics could not be loaded." onRetry={() => mutateAnalytics()} /></div>}
          {deliveryMonitorError && <div className="mb-4"><DataError label="Delivery monitoring is temporarily unavailable." onRetry={() => mutateDeliveryMonitor()} /></div>}
          {!!deliveryMonitor?.deliveries?.length && (
            <section className="platform-panel mb-4 overflow-hidden">
              <div className="border-b border-foreground/10 px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">Recent delivery attempts</div>
              <div className="divide-y divide-foreground/5">
                {deliveryMonitor.deliveries.slice(0, 5).map((delivery) => (
                  <div key={delivery.outreachMessageId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <span className="font-mono text-muted-foreground">{delivery.outreachMessageId.slice(0, 8)}…</span>
                    <span className={delivery.status === "failed" ? "text-destructive" : delivery.status === "sent" ? "text-emerald-700" : "text-muted-foreground"}>{delivery.status}</span>
                    {delivery.lastError && <span className="min-w-0 truncate text-destructive">{delivery.lastError}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="platform-panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/10 bg-foreground/[0.02]">
                  {["Campaign", "Members", "Drafted", "Sent", "Opened", "Clicked", "Replied", "Reply rate", "Last send"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {(analytics?.campaigns ?? []).map((c) => {
                  const rate = c.sent ? Math.round((c.replied / c.sent) * 100) : null
                  return (
                    <tr key={c.id} className="hover:bg-foreground/[0.02]">
                      <td className="px-3 py-2.5 font-medium">{c.name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.members}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.drafted}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.sent}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        <span className="inline-flex items-center gap-1"><MailOpen className="w-3 h-3 text-muted-foreground" />{c.opened}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        <span className="inline-flex items-center gap-1"><MousePointerClick className="w-3 h-3 text-muted-foreground" />{c.clicked}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.replied}</td>
                      <td className="px-3 py-2.5">
                        {rate != null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                              <div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, rate)}%` }} />
                            </div>
                            <span className="font-mono text-xs">{rate}%</span>
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{c.last_sent_at ? ago(c.last_sent_at) + " ago" : "—"}</td>
                    </tr>
                  )
                })}
                {analytics && !analytics.campaigns?.length && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No campaigns yet.</td></tr>
                )}
                {analyticsLoading && <tr><td colSpan={9}><DataLoading label="Loading analytics" /></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Engagement is attributed through campaign membership — a contact in two campaigns counts in both.
          </p>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, warn, title }: { label: string; value: string; warn?: boolean; title?: string }) {
  return (
    <div className="text-right" title={title}>
      <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl ${warn ? "text-[var(--platform-warning)]" : ""}`}>{value}</div>
    </div>
  )
}
