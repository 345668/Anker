"use client"
import { useCallback, useEffect, useState } from "react"
import { call, btnGhost } from "./api"

const STAGE: Record<string, string> = { interested: "Waiting for the fund", in_talks: "The fund wants to talk", declined: "Not taken forward", withdrawn: "Withdrawn", invited_to_onboard: "Invited to onboard", onboarding: "Onboarding", on_hold: "On hold" }
export function MyRequests() {
  const [rows, setRows] = useState<any[] | null>(null), [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => call("/api/investor/requests").then((r) => setRows(r.requests)).catch((e) => setErr(e.message)), [])
  useEffect(() => { void load() }, [load])
  if (err) return <p role="alert">{err}</p>
  if (!rows) return <p role="status">Loading…</p>
  return <div className="space-y-4"><h1 className="text-xl font-semibold">Your requests</h1>
    {rows.length === 0 ? <p className="text-sm">You have not asked any fund to talk yet.</p> :
      <ul className="space-y-3">{rows.map((r) => <li key={r.id} className="flex items-start justify-between rounded-lg border p-4 text-sm">
        <div><p className="font-medium">{r.fundName} <span className="font-normal text-muted-foreground">· as {r.entityName}</span></p>
          <p>{STAGE[r.stage] ?? r.stage}</p><p className="text-muted-foreground">{r.message}</p></div>
        {["interested", "in_talks"].includes(r.stage) && <button className={btnGhost} onClick={() => call(`/api/investor/requests/${r.id}`, { method: "DELETE" }).then(load).catch((e) => setErr(e.message))}>Withdraw</button>}
      </li>)}</ul>}</div>
}
