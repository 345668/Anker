"use client"

/**
 * Distribution detail view — close cousin of capital-call-detail-client.
 *
 * Two tabs: Line items + Notice. Same Resend-backed send flow with
 * Preview-emails dry-run. The visual distinction is colour: capital
 * calls use the foreground/neutral palette; distributions get an
 * emerald accent on the per-LP card so a reader can immediately tell
 * "money coming out" vs "money going in."
 */

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Save, Loader2, AlertTriangle, CheckCircle2, Sparkles,
  Trash2, Send, Eye, Pencil, Mail, XCircle, AlertOctagon,
  Banknote, FileText, Building2,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import type {
  DistributionFull, DistributionLineWithLp, DistributionStatus,
  DistributionLineStatus,
} from "@/lib/portfolio/distributions"
import { renderArticleHtml } from "@/lib/newsroom/markdown"

interface Props {
  fund: FundFull
  initialDistribution: DistributionFull
  initialLineItems: DistributionLineWithLp[]
}

type Tab = "lines" | "notice"

const DIST_STATUS_LABEL: Record<DistributionStatus, string> = {
  draft: "Draft", notified: "Notified", paid: "Paid", cancelled: "Cancelled",
}
const LINE_STATUS_META: Record<DistributionLineStatus, { label: string; tone: string }> = {
  pending:  { label: "Pending",  tone: "text-foreground/70 bg-foreground/5 border-foreground/10" },
  notified: { label: "Notified", tone: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
  paid:     { label: "Paid",     tone: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
  waived:   { label: "Waived",   tone: "text-muted-foreground bg-foreground/5 border-foreground/10" },
}

export function DistributionDetailClient({ fund, initialDistribution, initialLineItems }: Props) {
  const router = useRouter()
  const [dist, setDist] = useState(initialDistribution)
  const [lines, setLines] = useState(initialLineItems)
  const [tab, setTab] = useState<Tab>("lines")
  const [noticeMd, setNoticeMd] = useState(initialDistribution.notice_md ?? "")
  const [noticeSubject, setNoticeSubject] = useState(initialDistribution.notice_subject ?? "")
  const [editingNotice, setEditingNotice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [sendReport, setSendReport] = useState<any | null>(null)

  const totals = useMemo(() => {
    const total = lines.reduce((s, l) => s + l.amount, 0)
    const paid = lines.filter((l) => l.status === "paid").reduce((s, l) => s + l.amount, 0)
    const notified = lines.filter((l) => l.status === "notified").reduce((s, l) => s + l.amount, 0)
    const waived = lines.filter((l) => l.status === "waived").reduce((s, l) => s + l.amount, 0)
    return { total, paid, notified, waived }
  }, [lines])

  const html = useMemo(() => renderArticleHtml(noticeMd || ""), [noticeMd])

  async function refreshAll() {
    const fresh = await fetch(`/api/portfolio/funds/${fund.id}/distributions/${dist.id}`)
    if (!fresh.ok) return
    const r = await fresh.json()
    setDist(r.distribution)
    setLines(r.lineItems)
  }

  async function patchDist(patch: any, successMsg?: string) {
    setBusy(true); setError(null); setSuccess(null); setSendReport(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/distributions/${dist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Update failed (${res.status})`)
      setDist(data.distribution)
      if (successMsg) setSuccess(successMsg)
    } catch (e: any) { setError(e?.message ?? "Update failed") }
    finally { setBusy(false) }
  }

  async function saveNotice() {
    await patchDist({ noticeMd, noticeSubject }, "Notice saved.")
  }

  async function draftNotice() {
    setDrafting(true); setError(null); setSuccess(null); setSendReport(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/distributions/${dist.id}/draft-notice`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Draft failed (${res.status})`)
      setDist(data.distribution)
      setNoticeMd(data.distribution.notice_md ?? "")
      setNoticeSubject(data.distribution.notice_subject ?? "")
      setEditingNotice(false)
      setSuccess(`Notice drafted in ${(data.generationMs / 1000).toFixed(1)}s — review before sending.`)
    } catch (e: any) { setError(e?.message ?? "Draft failed") }
    finally { setDrafting(false) }
  }

  async function sendNotice(opts: { lineItemIds?: string[]; dryRun?: boolean }) {
    setSending(true); setError(null); setSuccess(null); setSendReport(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/distributions/${dist.id}/send-notice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Send failed (${res.status})`)
      setSendReport(data)
      setSuccess(opts.dryRun
        ? `Preview: would send ${data.sent}, skip ${data.skipped}.`
        : `Sent to ${data.sent} LP${data.sent === 1 ? "" : "s"}; ${data.skipped} skipped.`)
      await refreshAll()
    } catch (e: any) { setError(e?.message ?? "Send failed") }
    finally { setSending(false) }
  }

  async function patchLine(lineId: string, patch: any) {
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/distributions/${dist.id}/line-items/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Line update failed (${res.status})`)
      }
      await refreshAll()
    } catch (e: any) { setError(e?.message ?? "Line update failed") }
  }

  async function remove() {
    if (!confirm(`Delete distribution #${dist.distribution_number}? Cascades line items; any paid amounts are decremented from each LP's distributed total.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/distributions/${dist.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Delete failed (${res.status})`)
      }
      router.push("/dashboard/portfolio/fund/distributions")
    } catch (e: any) { setError(e?.message ?? "Delete failed") }
    finally { setBusy(false) }
  }

  const ccy = fund.currency
  const noticeReady = !!dist.notice_md && !!dist.notice_subject

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/portfolio/fund/distributions" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Distributions
        </Link>
        <div className="mt-3 flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-3xl tracking-tight">
                <span className="font-mono text-lg text-muted-foreground mr-2">#{dist.distribution_number}</span>
                {dist.title}
              </h1>
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <span>{fund.name}</span>
              <span>· status {DIST_STATUS_LABEL[dist.status]}</span>
              {dist.payment_date && <span>· pay {dist.payment_date}</span>}
              {dist.source_company_id && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  <Link href={`/dashboard/portfolio/${dist.source_company_id}`} className="underline-offset-2 hover:underline">
                    source portco
                  </Link>
                </span>
              )}
            </div>
            {dist.source && <div className="mt-2 text-sm text-muted-foreground max-w-2xl">{dist.source}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={remove} disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-rose-500/30 text-rose-600 hover:bg-rose-500/5 disabled:opacity-50">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Waterfall summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden">
        <Cell label="Gross"    value={dist.gross_amount != null ? `${ccy} ${dist.gross_amount.toLocaleString("en-US")}` : "—"} />
        <Cell label="Mgmt fee" value={`${ccy} ${dist.mgmt_fee_deduction.toLocaleString("en-US")}`} />
        <Cell label="Carry"    value={`${ccy} ${dist.carry_deduction.toLocaleString("en-US")}`} />
        <Cell label="Net to LPs" value={`${ccy} ${dist.net_amount.toLocaleString("en-US")}`} valueClass="text-emerald-600" />
      </div>

      {/* Status strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden">
        <Cell label="Line items" value={`${lines.length}`} />
        <Cell label="Notified"   value={`${ccy} ${totals.notified.toLocaleString("en-US")}`} sub={`${lines.filter((l) => l.status === "notified").length} lines`} />
        <Cell label="Paid"       value={`${ccy} ${totals.paid.toLocaleString("en-US")}`} sub={`${lines.filter((l) => l.status === "paid").length} lines`} />
        <Cell label="Pending"    value={`${ccy} ${(totals.total - totals.paid - totals.waived).toLocaleString("en-US")}`} sub={`${lines.filter((l) => l.status === "pending").length} lines`} />
      </div>

      {error && <Banner tone="error" text={error} />}
      {success && <Banner tone="success" text={success} />}
      {sendReport && <SendReportPanel report={sendReport} />}

      <div className="flex items-center gap-1 border-b border-foreground/10">
        <TabBtn label="Line items" active={tab === "lines"} onClick={() => setTab("lines")} Icon={Banknote} />
        <TabBtn label="Notice"     active={tab === "notice"} onClick={() => setTab("notice")} Icon={FileText} />
      </div>

      {tab === "lines" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => sendNotice({ dryRun: true })}
              disabled={!noticeReady || sending || lines.filter((l) => l.status === "pending").length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50">
              <Eye className="w-4 h-4" /> Preview emails
            </button>
            <button type="button" onClick={() => sendNotice({})}
              disabled={!noticeReady || sending || lines.filter((l) => l.status === "pending").length === 0}
              className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send all pending
            </button>
            {!noticeReady && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <AlertOctagon className="w-3 h-3" /> No notice drafted — open the Notice tab.
              </span>
            )}
          </div>

          <div className="border border-foreground/10 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-foreground/[0.02] text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-normal">LP</th>
                  <th className="text-right px-3 py-2 font-normal">Ownership</th>
                  <th className="text-right px-3 py-2 font-normal">Amount</th>
                  <th className="text-left px-3 py-2 font-normal">Status</th>
                  <th className="text-left px-3 py-2 font-normal">Notified</th>
                  <th className="text-left px-3 py-2 font-normal">Paid</th>
                  <th className="text-left px-3 py-2 font-normal">Wire ref</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <LineRow
                    key={l.id}
                    line={l}
                    currency={ccy}
                    noticeReady={noticeReady}
                    onAmount={(amt) => patchLine(l.id, { amount: amt })}
                    onStatus={(s) => patchLine(l.id, { status: s })}
                    onPaid={(ref) => patchLine(l.id, { status: "paid", paymentRef: ref })}
                    onSendOne={() => sendNotice({ lineItemIds: [l.id] })}
                    sendingAny={sending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "notice" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={draftNotice} disabled={drafting || busy}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50">
              {drafting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Drafting… (20-60s)</>
                : <><Sparkles className="w-4 h-4" /> {noticeReady ? "Re-draft with AI" : "Draft with AI"}</>}
            </button>
            <button type="button" onClick={() => setEditingNotice((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
              {editingNotice ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              {editingNotice ? "Preview" : "Edit"}
            </button>
            <button type="button" onClick={saveNotice} disabled={busy}
              className="ml-auto inline-flex items-center gap-2 h-9 px-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save notice
            </button>
          </div>

          <div className="border border-foreground/10 rounded-md p-4 bg-foreground/[0.02]">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              Email subject
            </label>
            <input type="text" value={noticeSubject} onChange={(e) => setNoticeSubject(e.target.value)}
              placeholder="e.g. Summit Venture Studio Fund II — Distribution #2"
              className="w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background" />
          </div>

          {editingNotice ? (
            <textarea
              value={noticeMd}
              onChange={(e) => setNoticeMd(e.target.value)}
              rows={24}
              className="w-full text-sm font-mono p-4 border border-foreground/15 rounded-md bg-background leading-relaxed"
              placeholder="Markdown body of the LP-facing distribution notice."
            />
          ) : noticeMd ? (
            <article
              className="article-body prose max-w-none border border-foreground/10 rounded-md p-6 bg-background"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div className="border border-dashed border-foreground/20 rounded-md p-10 text-center text-sm text-muted-foreground">
              No notice yet. Click "Draft with AI" or open Edit to write one by hand.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TabBtn({ label, active, onClick, Icon }: { label: string; active: boolean; onClick: () => void; Icon: any }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
        active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}>
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function Cell({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-background p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`font-display text-xl mt-1 tracking-tight ${valueClass ?? ""}`}>{value}</div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function Banner({ tone, text }: { tone: "error" | "success"; text: string }) {
  return tone === "error" ? (
    <div className="px-3 py-2 text-xs font-mono text-rose-600 border border-rose-500/30 bg-rose-500/5 rounded-md inline-flex items-center gap-2">
      <AlertTriangle className="w-3 h-3" /> {text}
    </div>
  ) : (
    <div className="px-3 py-2 text-xs font-mono text-emerald-700 border border-emerald-500/30 bg-emerald-500/5 rounded-md inline-flex items-center gap-2">
      <CheckCircle2 className="w-3 h-3" /> {text}
    </div>
  )
}

function SendReportPanel({ report }: { report: any }) {
  return (
    <div className="border border-foreground/15 rounded-md p-4 bg-foreground/[0.02]">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
        {report.dryRun ? "Preview — emails not sent" : "Send report"}
      </div>
      <ul className="text-xs space-y-1 max-h-64 overflow-y-auto">
        {report.results.map((r: any) => (
          <li key={r.lineItemId} className={`flex items-center gap-2 ${r.status === "skipped" ? "text-rose-600" : "text-foreground"}`}>
            {r.status === "skipped"
              ? <XCircle className="w-3 h-3 shrink-0" />
              : <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-600" />}
            <span className="font-mono">{r.lpName}</span>
            {r.to && <span className="text-muted-foreground">· {r.to}</span>}
            {r.amount != null && <span className="text-muted-foreground font-mono">· {r.amount.toLocaleString("en-US")}</span>}
            {r.reason && <span className="text-muted-foreground italic">· {r.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function LineRow({
  line, currency, noticeReady, onAmount, onStatus, onPaid, onSendOne, sendingAny,
}: {
  line: DistributionLineWithLp
  currency: string
  noticeReady: boolean
  onAmount: (amount: number) => Promise<void>
  onStatus: (status: DistributionLineStatus) => Promise<void>
  onPaid: (paymentRef: string | null) => Promise<void>
  onSendOne: () => Promise<void>
  sendingAny: boolean
}) {
  const [editingAmount, setEditingAmount] = useState(false)
  const [draftAmount, setDraftAmount] = useState(line.amount.toString())
  const [showPaid, setShowPaid] = useState(false)
  const [ref, setRef] = useState(line.payment_ref ?? "")

  const meta = LINE_STATUS_META[line.status]

  return (
    <>
      <tr className="border-t border-foreground/5 hover:bg-foreground/[0.02]">
        <td className="px-4 py-2 align-top">
          <div className="font-medium">{line.lp_name}</div>
          <div className="text-[10px] font-mono uppercase text-muted-foreground">
            {(line.lp_type ?? "—").replace(/_/g, " ")}
            {!line.lp_contact_id && <span className="text-rose-500"> · no contact</span>}
          </div>
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs">
          {line.lp_ownership_pct != null ? `${(line.lp_ownership_pct * 100).toFixed(2)}%` : "—"}
        </td>
        <td className="px-3 py-2 text-right">
          {editingAmount ? (
            <div className="inline-flex items-center gap-1">
              <input type="number" step="1000" value={draftAmount} onChange={(e) => setDraftAmount(e.target.value)}
                className="w-28 h-7 px-2 text-xs border border-foreground/15 rounded bg-background text-right font-mono" />
              <button onClick={async () => { await onAmount(Number(draftAmount)); setEditingAmount(false) }}
                className="text-[10px] px-2 py-1 rounded bg-foreground text-background">Save</button>
            </div>
          ) : (
            <button onClick={() => setEditingAmount(true)}
              className="font-mono text-xs hover:underline text-emerald-700" disabled={line.status === "paid"}>
              {currency} {line.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </button>
          )}
        </td>
        <td className="px-3 py-2">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${meta.tone}`}>
            {meta.label}
          </span>
        </td>
        <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground">
          {line.notified_at ? new Date(line.notified_at).toLocaleDateString() : "—"}
        </td>
        <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground">
          {line.paid_at ? new Date(line.paid_at).toLocaleDateString() : "—"}
        </td>
        <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground truncate max-w-[140px]">
          {line.payment_ref ?? "—"}
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {line.status === "pending" && (
            <button onClick={onSendOne} disabled={!noticeReady || sendingAny || !line.lp_contact_id}
              className="text-[11px] px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 inline-flex items-center gap-1">
              <Mail className="w-3 h-3" /> Send
            </button>
          )}
          {(line.status === "pending" || line.status === "notified") && (
            <button onClick={() => setShowPaid((v) => !v)}
              className="ml-1 text-[11px] px-2 py-1 rounded border border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/5">
              Mark paid
            </button>
          )}
          {(line.status === "pending" || line.status === "notified") && (
            <button onClick={() => onStatus("waived")}
              className="ml-1 text-[11px] px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5">
              Waive
            </button>
          )}
          {(line.status === "paid" || line.status === "waived") && (
            <button onClick={() => onStatus("pending")}
              className="text-[11px] px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5">
              Reopen
            </button>
          )}
        </td>
      </tr>
      {showPaid && (
        <tr className="bg-emerald-500/[0.03] border-t border-foreground/5">
          <td colSpan={8} className="px-4 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Wire ref:</span>
              <input type="text" value={ref} onChange={(e) => setRef(e.target.value)}
                placeholder="bank wire reference / memo"
                className="flex-1 min-w-[200px] h-7 px-2 text-xs border border-foreground/15 rounded bg-background" />
              <button onClick={async () => { await onPaid(ref || null); setShowPaid(false) }}
                className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">
                Confirm paid
              </button>
              <button onClick={() => setShowPaid(false)}
                className="text-xs px-2 py-1 rounded border border-foreground/15">
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
