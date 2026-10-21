"use client"
import { useEffect, useState } from "react"
import { TEXTS } from "@/lib/investor/legal"
import Link from "next/link"
import { call, field } from "./api"

const STATUS: Record<string, string> = { eligible: "You meet the stated rules", unclear: "Some rules cannot be checked yet", ineligible: "Does not meet the stated rules" }
export function FundFinder() {
  const [entities, setEntities] = useState<any[]>([]), [entityId, setEntityId] = useState(""), [funds, setFunds] = useState<any[] | null>(null), [err, setErr] = useState<string | null>(null)
  useEffect(() => { call("/api/investor/entities").then((r) => { setEntities(r.entities); setEntityId(r.entities[0]?.id ?? "") }).catch((e) => setErr(e.message)) }, [])
  useEffect(() => { if (!entityId) return; setFunds(null); call(`/api/investor/funds?entityId=${entityId}`).then((r) => setFunds(r.funds)).catch((e) => setErr(e.message)) }, [entityId])
  if (err) return <p role="alert">{err}</p>
  return <div className="space-y-6">
    <div><h1 className="text-xl font-semibold">Funds that fit you</h1>
      <p className="mt-1 text-sm text-muted-foreground">{TEXTS.fitDisclaimer.text}</p></div>
    <label className="block max-w-sm text-sm">Looking for<select className={field} value={entityId} onChange={(e) => setEntityId(e.target.value)}>{entities.map((e) => <option key={e.id} value={e.id}>{e.legalName}</option>)}</select></label>
    {!funds ? <p role="status">Loading…</p> : funds.length === 0 ? <p className="text-sm">No fund is open to investors yet. Check back later.</p> :
      <ul className="space-y-3">{funds.map((f) => <li key={f.fundId} className="rounded-lg border p-4 text-sm">
        <div className="flex items-start justify-between gap-4"><div>
          <Link className="text-base font-medium underline" href={`/investor/funds/${f.fundId}?entityId=${entityId}`}>{f.name}</Link>
          <p className="text-muted-foreground">{f.manager ?? ""}</p></div>
          <div className="text-right"><p className="text-lg font-semibold">{f.fit.score == null ? "—" : f.fit.score}</p><p className="text-xs text-muted-foreground">fit · {f.fit.confidence} confidence</p></div></div>
        <p className="mt-2">{f.sentence}</p>
        <p className="mt-1 text-muted-foreground">{STATUS[f.eligibility.status]}{f.eligibility.failed.length ? `: ${f.eligibility.failed.join("; ")}` : ""}</p>
        {f.fit.gaps.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Not judged: {f.fit.gaps.join("; ")}</p>}
      </li>)}</ul>}
  </div>
}
