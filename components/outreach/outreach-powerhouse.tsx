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

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  Megaphone, Inbox as InboxIcon, BarChart3, PenLine, Check, Loader2,
  ExternalLink, MailOpen, MousePointerClick, Reply, CalendarClock,
} from "lucide-react"
import { OutreachCampaigns } from "@/components/tesseract/outreach-campaigns"

type CampaignsProps = React.ComponentProps<typeof OutreachCampaigns>

const fetcher = (u: string) => fetch(u).then((r) => r.json())

interface Stats {
  sentAll: number; sent30d: number; openRate: number | null; clickRate: number | null
  scheduled: number; followupsDue: number; replies30d: number; repliesAwaiting: number
  deliveredRate: number | null; bounced30d: number
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
}

interface CampaignStat {
  id: string; name: string; status: string | null
  members: number; drafted: number; sent: number; last_sent_at: string | null
  opened: number; clicked: number; replied: number
}

type Tab = "campaigns" | "inbox" | "analytics"

const ago = (iso: string | null) => {
  if (!iso) return ""
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return d <= 0 ? "today" : d === 1 ? "1d" : `${d}d`
}

export function OutreachPowerhouse(props: CampaignsProps) {
  const [tab, setTab] = useState<Tab>("campaigns")
  const { data: stats, mutate: mutateStats } = useSWR<Stats>("/api/outreach/stats", fetcher)
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
  const { data: inbox, mutate: mutateInbox } = useSWR<{ followups: FollowupRow[]; replies: ReplyRow[] }>(
    "/api/outreach/followups", fetcher)
  const { data: analytics } = useSWR<{ campaigns: CampaignStat[] }>(
    tab === "analytics" ? "/api/outreach/analytics" : null, fetcher)

  const inboxCount = (inbox?.followups?.length ?? 0) + (inbox?.replies?.filter((r) => !r.approved).length ?? 0)

  async function clearFollowup(id: string) {
    await fetch("/api/outreach/followups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: id, done: true }),
    })
    mutateInbox()
  }
  async function approveReply(id: string) {
    await fetch("/api/outreach/followups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyId: id, approved: true }),
    })
    mutateInbox()
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-6 lg:px-10 pt-6 pb-0 border-b border-foreground/10">
        <div className="flex items-end justify-between gap-6 flex-wrap pb-4">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-1.5">
              <span className="w-8 h-px bg-foreground/30" />
              Outreach · campaigns → drafts → replies
            </span>
            <h1 className="text-3xl lg:text-4xl font-display tracking-tight leading-[0.95]">Outreach engine.</h1>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <Kpi label="Sent · 30d" value={stats ? String(stats.sent30d) : "…"} />
            <Kpi label="Open rate" value={stats?.openRate != null ? `${stats.openRate}%` : "—"} />
            <Kpi label="Click rate" value={stats?.clickRate != null ? `${stats.clickRate}%` : "—"} />
            <Kpi label="Delivered" value={stats?.deliveredRate != null ? `${stats.deliveredRate}%` : "—"} />
            <Kpi label="Bounced" value={stats ? String(stats.bounced30d) : "…"} warn={(stats?.bounced30d ?? 0) > 0} />
            <Kpi label="Replies · 30d" value={stats ? String(stats.replies30d) : "…"} />
            <Kpi label="Scheduled" value={stats ? String(stats.scheduled) : "…"} />
            <Kpi label="Due" value={stats ? String(stats.followupsDue) : "…"} warn={(stats?.followupsDue ?? 0) > 0} />
            <button onClick={syncResend} disabled={syncing}
              title="Pull delivery / open / click / bounce telemetry from Resend"
              className="inline-flex items-center gap-2 rounded-full h-9 px-4 border border-foreground/15 hover:bg-foreground/5 text-sm disabled:opacity-50">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailOpen className="w-4 h-4" />}
              Sync Resend
            </button>
            <Link href="/dashboard/outreach/studio"
              className="inline-flex items-center gap-2 rounded-full h-9 px-4 bg-foreground text-background hover:bg-foreground/90 text-sm">
              <PenLine className="w-4 h-4" /> Studio
            </Link>
          </div>
        </div>

        {syncMsg && (
          <div className="pb-3 -mt-1 text-xs font-mono text-muted-foreground">{syncMsg}</div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {([
            ["campaigns", "Campaigns", Megaphone, null],
            ["inbox", "Inbox", InboxIcon, inboxCount || null],
            ["analytics", "Analytics", BarChart3, null],
          ] as const).map(([key, label, Icon, badge]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 px-4 h-10 text-sm border-b-2 -mb-px transition-colors ${
                tab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" />
              {label}
              {badge != null && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800">{badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {tab === "campaigns" && <OutreachCampaigns {...props} />}

      {tab === "inbox" && (
        <div className="px-6 lg:px-10 py-6 grid lg:grid-cols-2 gap-6 items-start">
          {/* Follow-ups due */}
          <section className="border border-foreground/10 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-foreground/10 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-700" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
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
              {!inbox && <div className="px-4 py-8 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
            </div>
          </section>

          {/* Replies */}
          <section className="border border-foreground/10 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-foreground/10 flex items-center gap-2">
              <Reply className="w-4 h-4 text-emerald-700" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Replies · 30d · {inbox?.replies?.length ?? 0}
              </span>
            </div>
            <div className="divide-y divide-foreground/5">
              {(inbox?.replies ?? []).map((r) => (
                <div key={r.id} className={`px-4 py-3 ${r.approved ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate flex-1">{r.display_name ?? "Unknown contact"}</span>
                    {r.classification && (
                      <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-foreground/15">
                        {r.classification}
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-muted-foreground">{ago(r.received_at)}</span>
                    {!r.approved && (
                      <button onClick={() => approveReply(r.id)} title="Mark handled"
                        className="h-6 w-6 rounded-full border border-foreground/15 hover:border-emerald-500/50 hover:text-emerald-700 flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {r.inbound_text && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.inbound_text}</p>
                  )}
                  {r.draft_response && !r.approved && (
                    <div className="mt-1.5 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-xs line-clamp-3">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-700 mr-1.5">AI draft</span>
                      {r.draft_response}
                    </div>
                  )}
                  {r.crm_entry_id && (
                    <Link href={`/dashboard/outreach/studio?entry=${encodeURIComponent(r.crm_entry_id)}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3 h-3" /> Open in studio
                    </Link>
                  )}
                </div>
              ))}
              {inbox && !inbox.replies?.length && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No replies in the last 30 days.</div>
              )}
              {!inbox && <div className="px-4 py-8 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
            </div>
          </section>
        </div>
      )}

      {tab === "analytics" && (
        <div className="px-6 lg:px-10 py-6">
          <div className="border border-foreground/10 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/10 bg-foreground/[0.02]">
                  {["Campaign", "Members", "Drafted", "Sent", "Opened", "Clicked", "Replied", "Reply rate", "Last send"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{h}</th>
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
                {!analytics && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center"><Loader2 className="w-4 h-4 animate-spin inline text-muted-foreground" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Engagement is attributed through campaign membership — a contact in two campaigns counts in both.
          </p>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl ${warn ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  )
}
