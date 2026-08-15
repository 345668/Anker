"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ShieldCheck, Loader2, ScanSearch, Check, X, AlertTriangle } from "lucide-react"
import type { KycCase, KycHit, KycDocument } from "@/lib/modules/kyc"

const fmtDT = (s: string | null) => (s ? new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "never")
const STATUS: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-foreground/[0.06] text-muted-foreground" },
  in_progress: { label: "In progress", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  cleared: { label: "Cleared", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  escalated: { label: "Escalated", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  rejected: { label: "Rejected", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
}
const RISK: Record<string, string> = { unknown: "text-muted-foreground", low: "text-emerald-600 dark:text-emerald-400", medium: "text-amber-600 dark:text-amber-400", high: "text-rose-600 dark:text-rose-400" }
const LIST_LABEL: Record<string, string> = { sanctions: "Sanctions", pep: "PEP", adverse_media: "Adverse media" }
const DOC_STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "Requested", cls: "text-muted-foreground" },
  received: { label: "Received", cls: "text-amber-600 dark:text-amber-400" },
  verified: { label: "Verified", cls: "text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Rejected", cls: "text-rose-600 dark:text-rose-400" },
}

export function KycCaseClient({
  initialCase, initialHits, initialDocs, requiredDocs,
}: {
  initialCase: KycCase
  initialHits: KycHit[]
  initialDocs: KycDocument[]
  requiredDocs: { type: string; label: string }[]
}) {
  const [kase, setKase] = useState(initialCase)
  const [hits, setHits] = useState(initialHits)
  const [docs, setDocs] = useState(initialDocs)
  const [screening, setScreening] = useState(false)

  function apply(d: any) {
    if (d?.case) setKase(d.case)
    if (d?.hits) setHits(d.hits)
    if (d?.documents) setDocs(d.documents)
  }

  async function screen() {
    setScreening(true)
    try { apply(await (await fetch(`/api/kyc/cases/${kase.id}/screen`, { method: "POST" })).json()) }
    finally { setScreening(false) }
  }
  async function setHit(hitId: string, status: string) {
    apply(await (await fetch(`/api/kyc/cases/${kase.id}/hits/${hitId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) })).json())
  }
  async function requestDoc(docType: string, label: string) {
    apply(await (await fetch(`/api/kyc/cases/${kase.id}/documents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ docType, label }) })).json())
  }
  async function setDoc(docId: string, status: string) {
    apply(await (await fetch(`/api/kyc/cases/${kase.id}/documents/${docId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) })).json())
  }
  async function decide(status: string) {
    apply(await (await fetch(`/api/kyc/cases/${kase.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) })).json())
  }

  const st = STATUS[kase.status]
  const docByType = new Map<string, KycDocument>()
  for (const d of docs) if (!docByType.has(d.doc_type)) docByType.set(d.doc_type, d)
  const extraDocs = docs.filter((d) => !requiredDocs.some((r) => r.type === d.doc_type))

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-4xl">
      <Link href="/dashboard/kyc-aml" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5">
        <ArrowLeft className="w-4 h-4" /> KYC / AML
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5" /> {kase.subject_type} · screening case
          </div>
          <h1 className="text-3xl font-display tracking-tight">{kase.subject_name}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>
            <span className="text-muted-foreground">Risk <span className={`font-medium capitalize ${RISK[kase.risk_level]}`}>{kase.risk_level === "unknown" ? "—" : kase.risk_level}</span></span>
            <span className="text-muted-foreground">Screened {fmtDT(kase.screened_at)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => decide("cleared")} disabled={kase.status === "cleared"} className="h-9 px-3.5 text-sm rounded-md border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/5 disabled:opacity-40">Mark cleared</button>
          <button onClick={() => decide("rejected")} disabled={kase.status === "rejected"} className="h-9 px-3.5 text-sm rounded-md border border-rose-500/30 text-rose-600 hover:bg-rose-500/5 disabled:opacity-40">Reject</button>
        </div>
      </div>

      {/* Screening */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg tracking-tight">Screening</h2>
          <button onClick={screen} disabled={screening} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">
            {screening ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />} {kase.screened_at ? "Re-screen" : "Run screening"}
          </button>
        </div>
        {hits.length === 0 ? (
          <div className="rounded-lg border border-foreground/10 p-5 text-sm text-muted-foreground">
            {kase.screened_at ? "No sanctions, PEP, or adverse-media matches found." : "Not screened yet. Run screening to check this subject against the watchlists."}
          </div>
        ) : (
          <div className="rounded-lg border border-rose-500/20 overflow-hidden">
            <div className="px-4 py-2.5 bg-rose-500/[0.06] flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4" /> {hits.filter((h) => h.status !== "cleared").length} potential match{hits.filter((h) => h.status !== "cleared").length === 1 ? "" : "es"} — review each.
            </div>
            <table className="w-full text-sm">
              <tbody>
                {hits.map((h) => (
                  <tr key={h.id} className="border-t border-foreground/[0.06]">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{h.match_name}</div>
                      <div className="text-[11px] text-muted-foreground">{LIST_LABEL[h.list]}{h.program ? ` · ${h.program}` : ""} · match {Math.round(h.score * 100)}%</div>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {h.status === "cleared" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3.5 h-3.5" /> False positive</span>
                      ) : h.status === "confirmed" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-rose-600 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Confirmed</span>
                      ) : (
                        <span className="inline-flex gap-1.5">
                          <button onClick={() => setHit(h.id, "cleared")} className="text-xs px-2 py-1 rounded border border-foreground/15 hover:border-foreground/40">False positive</button>
                          <button onClick={() => setHit(h.id, "confirmed")} className="text-xs px-2 py-1 rounded border border-rose-500/30 text-rose-600 hover:bg-rose-500/5">Confirm</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Documents */}
      <section>
        <h2 className="font-display text-lg tracking-tight mb-3">Documents <span className="text-sm text-muted-foreground font-sans">({kase.docs_verified ?? 0}/{kase.docs_required ?? requiredDocs.length} verified)</span></h2>
        <div className="rounded-lg border border-foreground/10 overflow-hidden divide-y divide-foreground/[0.06]">
          {requiredDocs.map((rd) => {
            const doc = docByType.get(rd.type)
            return (
              <div key={rd.type} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{rd.label}</div>
                  {doc ? <div className={`text-[11px] ${DOC_STATUS[doc.status].cls}`}>{DOC_STATUS[doc.status].label}{doc.received_at ? ` · ${fmtDT(doc.received_at)}` : ""}</div>
                       : <div className="text-[11px] text-muted-foreground">Not requested</div>}
                </div>
                <div className="shrink-0">
                  {!doc ? (
                    <button onClick={() => requestDoc(rd.type, rd.label)} className="text-xs px-2.5 py-1 rounded border border-foreground/15 hover:border-foreground/40">Request</button>
                  ) : (
                    <DocActions status={doc.status} onSet={(s) => setDoc(doc.id, s)} />
                  )}
                </div>
              </div>
            )
          })}
          {extraDocs.map((doc) => (
            <div key={doc.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{doc.label || doc.doc_type}</div>
                <div className={`text-[11px] ${DOC_STATUS[doc.status].cls}`}>{DOC_STATUS[doc.status].label}</div>
              </div>
              <DocActions status={doc.status} onSet={(s) => setDoc(doc.id, s)} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">A case clears automatically once no screening matches are open and every required document is verified.</p>
      </section>
    </div>
  )
}

function DocActions({ status, onSet }: { status: string; onSet: (s: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {status === "requested" && <button onClick={() => onSet("received")} className="text-xs px-2 py-1 rounded border border-foreground/15 hover:border-foreground/40">Mark received</button>}
      {(status === "received" || status === "rejected") && <button onClick={() => onSet("verified")} className="text-xs px-2 py-1 rounded border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/5">Verify</button>}
      {status !== "rejected" && status !== "requested" && <button onClick={() => onSet("rejected")} title="Reject" className="text-xs px-2 py-1 rounded border border-rose-500/30 text-rose-600 hover:bg-rose-500/5"><X className="w-3 h-3" /></button>}
      {status === "verified" && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3.5 h-3.5" /></span>}
    </div>
  )
}
