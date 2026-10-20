"use client"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { call, field, btn, btnGhost } from "./api"
import { Passport } from "./passport"
import { DiscoverableToggle } from "./discoverable-toggle"

const ROLE: Record<string, string> = { owner: "Owner", can_act: "Can act", can_view: "Can view" }
const STAGE: Record<string, string> = { interested: "Waiting for the fund", in_talks: "In talks", declined: "Not taken forward", withdrawn: "Withdrawn", invited_to_onboard: "Invited to onboard", onboarding: "Onboarding", active: "Investor", on_hold: "On hold" }
const WHAT: Record<string, string> = { entity_created: "created this entity", entity_edited: "edited the entity", request_sent: "asked a fund to talk", request_withdrawn: "withdrew a request", nda_accepted: "accepted a fund’s NDA", team_invited: "invited someone", team_invite_revoked: "withdrew an invitation", team_removed: "removed someone", team_role_changed: "changed a role", team_joined: "joined the team", team_left: "left the team", passport_added: "added a passport document", passport_shared: "shared passport documents with a fund", passport_share_revoked: "took back a shared document", passport_removed: "removed a passport document", discoverable_on: "let funds find this entity", discoverable_off: "stopped funds finding this entity", fund_invited: "received an invitation from a fund", invitation_accepted: "accepted a fund’s invitation", invitation_declined: "declined a fund’s invitation" }

export function EntityDashboard({ id }: { id: string }) {
  const [d, setD] = useState<any>(null), [err, setErr] = useState<string | null>(null), [f, setF] = useState({ email: "", role: "can_view" }), [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => call(`/api/investor/entities/${id}/dashboard`).then((r) => { setD(r); setErr(null) }).catch((e) => setErr(e.message)), [id])
  useEffect(() => { void load() }, [load])
  const team = (body: unknown) => call(`/api/investor/entities/${id}/team`, { method: "POST", body }).then(() => { setMsg(null); return load() }).catch((e) => setErr(e.message))
  if (!d) return err ? <p role="alert">{err} <Link className="underline" href="/investor">Back</Link></p> : <p role="status">Loading…</p>
  const owner = d.entity.role === "owner", t = d.team
  return <div className="space-y-8">
    <Link className="text-sm underline" href="/investor">← Profile</Link>
    <div><h1 className="text-xl font-semibold">{d.entity.legalName}</h1><p className="text-sm text-muted-foreground">{d.entity.kind.replace("_", " ")}{d.entity.country ? ` · ${d.entity.country}` : ""} · you are: {ROLE[d.entity.role]}</p></div>
    {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Requests</h2><Link className={btnGhost} href="/investor/funds">Find a fund</Link></div>
      {d.requests.length === 0 ? <p className="text-sm">No requests from this entity yet.</p> : <ul className="space-y-2">{d.requests.map((r: any) => <li key={r.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{r.fundName} <span className="font-normal text-muted-foreground">· {STAGE[r.stage] ?? r.stage}</span></p>{r.nextStep && <p>Next: {r.nextStep}</p>}</li>)}</ul>}
      <p className="text-sm"><Link className="underline" href="/investor/requests">Open conversations →</Link></p></section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Team</h2>
      <p className="text-sm text-muted-foreground">People with a role here see this entity’s requests and conversations. Funds never see the team.</p>
      <ul className="space-y-1 text-sm"><li>{t.owner.name} <span className="text-muted-foreground">· Owner</span></li>
        {t.members.map((m: any) => <li key={m.userId} className="flex items-center justify-between gap-2"><span>{m.name}{m.email ? ` (${m.email})` : ""} <span className="text-muted-foreground">· {ROLE[m.role]}</span></span>
          {owner && <span className="flex gap-1"><button className={btnGhost} onClick={() => team({ action: "role", userId: m.userId, role: m.role === "can_act" ? "can_view" : "can_act" })}>Make “{m.role === "can_act" ? "can view" : "can act"}”</button><button className={btnGhost} onClick={() => team({ action: "remove", userId: m.userId })}>Remove</button></span>}</li>)}
        {t.invites.map((i: any) => <li key={i.id} className="flex items-center justify-between gap-2"><span>{i.email} <span className="text-muted-foreground">· invited as {ROLE[i.role]}, waiting</span></span>{owner && <button className={btnGhost} onClick={() => team({ action: "revoke_invite", inviteId: i.id })}>Withdraw</button>}</li>)}</ul>
      {owner ? <form onSubmit={(e) => { e.preventDefault(); void team({ action: "invite", email: f.email, role: f.role }).then(() => { setF({ ...f, email: "" }); setMsg("Invitation sent.") }) }} className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Invite by email<input className={field} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
        <label className="text-sm">Role<select className={field} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="can_view">Can view</option><option value="can_act">Can act</option></select></label>
        <button className={btn}>Invite</button>{msg && <span role="status" className="text-sm">{msg}</span>}</form>
        : <button className={btnGhost} onClick={() => confirm("Leave this team?") && team({ action: "leave" }).then(() => window.location.assign("/investor"))}>Leave this team</button>}</section>
    {owner && <DiscoverableToggle entityId={id} />}
    <Passport entityId={id} />
    <section className="space-y-2"><h2 className="text-lg font-semibold">Activity</h2>
      {d.events.length === 0 ? <p className="text-sm">Nothing yet.</p> : <ul className="space-y-1 text-sm">{d.events.map((e: any) => <li key={e.id}>{e.by} {WHAT[e.action] ?? e.action} <span className="text-muted-foreground">· {new Date(e.at).toLocaleString()}</span></li>)}</ul>}</section>
  </div>
}
