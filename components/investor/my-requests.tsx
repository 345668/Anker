"use client"
import { useCallback, useEffect, useState } from "react"
import { call, btnGhost } from "./api"
import { Thread } from "./thread"

const STAGE: Record<string, string> = { interested: "Waiting for the fund", in_talks: "The fund wants to talk", declined: "Not taken forward", withdrawn: "Withdrawn", invited_to_onboard: "Invited to onboard", onboarding: "Onboarding", on_hold: "On hold" }
export function MyRequests() {
  const [rows, setRows] = useState<any[] | null>(null), [open, setOpen] = useState<string | null>(null), [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => call("/api/investor/requests").then((r) => setRows(r.requests)).catch((e) => setErr(e.message)), [])
  useEffect(() => { void load() }, [load])
  if (err) return <p role="alert">{err}</p>
  if (!rows) return <p role="status">Loading…</p>
  return <div className="space-y-4"><h1 className="text-xl font-semibold">Your requests</h1>
    {rows.length === 0 ? <p className="text-sm">You have not asked any fund to talk yet.</p> :
      <ul className="space-y-3">{rows.map((r) => <li key={r.id} className="rounded-lg border p-4 text-sm">
        <div className="flex items-start justify-between gap-4"><div><p className="font-medium">{r.fundName} <span className="font-normal text-muted-foreground">· as {r.entityName}</span></p>
          <p>{STAGE[r.stage] ?? r.stage}</p><p className="text-muted-foreground">{r.message}</p>{r.nextStep && <p className="mt-1 font-medium">Next: {r.nextStep}</p>}
          {r.stage === "interested" && Date.now() - new Date(r.createdAt).getTime() > 14 * 864e5 && <p className="mt-1 text-muted-foreground">The fund has not answered in two weeks. You can withdraw if you no longer want to wait.</p>}</div>
          <div className="flex shrink-0 gap-2">
            {r.stage !== "interested" && r.stage !== "withdrawn" && <button className={btnGhost} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide messages" : "Messages"}</button>}
            {["interested", "in_talks"].includes(r.stage) && <button className={btnGhost} onClick={() => call(`/api/investor/requests/${r.id}`, { method: "DELETE" }).then(load).catch((e) => setErr(e.message))}>Withdraw</button>}</div></div>
        {open === r.id && <Thread base={`/api/investor/requests/${r.id}`} me="investor" />}
      </li>)}</ul>}</div>
}
