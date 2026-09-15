"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import type { getWorkspaceTeam } from "@/lib/org/team"

type Team = Awaited<ReturnType<typeof getWorkspaceTeam>>
type Change = { action: string; [key: string]: unknown }
const button = "inline-flex min-h-11 items-center justify-center rounded border border-border px-4 py-2 text-sm disabled:opacity-50"
const field = "mt-1 min-h-11 w-full rounded border border-input bg-background px-3 text-foreground"
export function WorkspaceTeam({ orgId }: { orgId: string }) {
  const [team,setTeam] = useState<Team|null>(null), [error,setError] = useState(""), [notice,setNotice] = useState("")
  const [busy,setBusy] = useState(false), [confirmation,setConfirmation] = useState<{ change:Change; title:string; detail:string }|null>(null)
  const [inviteLink,setInviteLink] = useState("")
  const opener = useRef<HTMLElement | null>(null)
  const pending = useRef(false)
  const endpoint = `/api/org/workspaces/${encodeURIComponent(orgId)}/team`
  const load = useCallback(async () => {
    try { const response = await fetch(endpoint,{cache:"no-store"}); const data = await response.json(); if(!response.ok) throw Error(data.error); setTeam(data); setError("") }
    catch(cause) { setError(cause instanceof Error ? cause.message : "The team could not be loaded.") }
  },[endpoint])
  useEffect(()=>{ void load() },[load])
  async function change(input:Change) {
    if(!team || pending.current) return
    pending.current=true;setBusy(true);setError("");setNotice("")
    try {
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...input,revision:team.workspace.team_revision})})
      const result=await response.json(); if(!response.ok) { if(response.status===409) await load(); throw Error(result.error || "The change could not be saved.") }
      if(result.invitationUrl) setInviteLink(result.invitationUrl)
      setConfirmation(null)
      if(input.action==="leave") { window.location.assign("/dashboard/entities");return }
      await load()
      setNotice(result.deliveryStatus==="failed" ? "The invitation was created, but email delivery was not confirmed. Copy its link below." : result.deliveryStatus==="sent" ? "Invitation email sent. The recipient must sign in and accept." : input.action==="invite" ? "Invitation created. Copy and share the link with the invited teammate." : "Workspace access updated.")
      window.dispatchEvent(new Event("anker:workspaces-changed"))
    } catch(cause) { setError(cause instanceof Error ? cause.message : "The change could not be saved.") }
    finally { pending.current=false;setBusy(false) }
  }
  function confirm(change:Change,title:string,detail:string) { setConfirmation({change,title,detail}) }
  const archived=!!team?.workspace.archived_at
  return <div onClickCapture={event=>{if(!confirmation){const target=(event.target as HTMLElement).closest("button");if(target)opener.current=target as HTMLElement}}} className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
    <Link href="/dashboard/entities" className="inline-flex min-h-11 items-center text-sm underline">Manage workspaces</Link>
    <p className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">Workspace access</p>
    <h1 className="mt-2 font-serif text-3xl">{team?.workspace.name || "Your team"}</h1>
    <p className="mt-3 max-w-3xl text-sm text-muted-foreground">Members work in this company or fund context. Viewer access is read only. Sending outreach emails and investor updates requires a separate permission from the owner. Invitations do not grant LP portal access.</p>
    {error && <div role="alert" className="my-4 border border-border p-4"><p>{error}</p><button className={button} disabled={busy} onClick={()=>void load()}>Reload team</button></div>}
    {notice && <p role="status" className="my-4 border border-border bg-muted p-4">{notice}</p>}
    {!team ? !error && <p role="status" className="my-6">Loading workspace access…</p> : <>
      {archived && <section className="my-6 border border-border p-5"><h2 className="font-serif text-xl">Archived workspace</h2><p className="my-2 text-sm">Records are retained and operating access is blocked. Restoring does not reinstate revoked invitation links.</p>{team.isOwner && <button className={button} disabled={busy} onClick={()=>void change({action:"restore"})}>Restore workspace</button>}</section>}
      {team.transfers.map((transfer:any)=><section key={transfer.id} className="my-6 border border-border bg-card p-5"><h2 className="font-serif text-xl">Ownership transfer awaiting acceptance</h2><p className="my-3 text-sm">The current owner remains in place until the nominated teammate accepts. The previous owner will become an admin and retain access. Pending invitation links will be revoked. Expires {new Date(transfer.expires_at).toLocaleString()}.</p>
        {transfer.to_user_id===team.actorId && <button className={button} disabled={busy || archived || new Date(transfer.expires_at)<new Date()} onClick={()=>confirm({action:"accept_transfer",transferId:transfer.id},"Accept workspace ownership?","You will become the primary owner. The previous owner keeps admin access. Review membership and sending permissions after accepting.")}>Accept ownership</button>}
        <button className={button} disabled={busy || archived} onClick={()=>void change({action:"cancel_transfer",transferId:transfer.id})}>Cancel transfer</button>
      </section>)}
      <section className="mt-6 border border-border bg-card p-5"><h2 className="font-serif text-2xl">Teammates</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Teammate</th><th className="p-2">Role</th><th className="p-2">Email sending</th><th className="p-2">Actions</th></tr></thead><tbody>
      {team.members.map((m:any)=>{const manageable=!archived && team.canManage && m.org_role!=="workspace_owner" && (team.isOwner || ["member","viewer"].includes(m.org_role));return <tr key={m.user_id} className="border-t border-border"><td className="p-2 break-all">{m.contact_email || `Member ${m.user_id.slice(0,8)}`}{m.user_id===team.actorId ? " (you)" : ""}</td><td className="p-2">{m.org_role.replaceAll("_"," ")}</td><td className="p-2">{m.can_send_outreach ? "Allowed" : "Not allowed"}</td><td className="p-2">
        {team.isOwner && m.user_id===team.actorId && !archived && <button className={button} disabled={busy} onClick={()=>confirm({action:"set_sending",canSendOutreach:!m.can_send_outreach},"Change your sending permission?","This controls your workspace email sends and queued outreach. Your owner role stays in place.")}>{m.can_send_outreach?"Disable my sending":"Enable my sending"}</button>}
        {manageable && <form className="flex flex-wrap items-center gap-2" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);confirm({action:"change_role",userId:m.user_id,role:data.get("role"),...(team.isOwner?{canSendOutreach:data.get("send")==="on"}:{})},"Change teammate permissions?","Changes take effect on subsequent requests. Shared records remain with the workspace; personal records remain private.")}}>
          <select name="role" aria-label={`Role for ${m.contact_email || m.user_id}`} defaultValue={m.org_role} key={`${m.user_id}:${m.org_role}`} className={field+" !w-auto !mt-0"} disabled={busy}>{(team.isOwner?["admin","member","viewer"]:["member","viewer"]).map(role=><option key={role}>{role}</option>)}</select>
          {team.isOwner && <label className="flex min-h-11 items-center gap-2"><input name="send" type="checkbox" defaultChecked={m.can_send_outreach} key={`${m.user_id}:${m.can_send_outreach}`} disabled={busy}/>Allow sending</label>}
          <button className={button} disabled={busy}>Save role</button><button type="button" className={button} disabled={busy} onClick={()=>confirm({action:"remove_member",userId:m.user_id},"Remove teammate?","They will lose workspace access. Shared workspace records remain available to the team; their outstanding invitations will be revoked.")}>Remove</button>
          {team.isOwner && ["admin","member"].includes(m.org_role) && <button type="button" className={button} disabled={busy} onClick={()=>confirm({action:"start_transfer",userId:m.user_id},"Request ownership transfer?","This teammate must accept within 48 hours. Until then, you remain the owner. After acceptance, you become an admin and retain access.")}>Transfer ownership</button>}
        </form>}
      </td></tr>})}</tbody></table></div></section>
      {team.canManage && !archived && <section className="mt-6 border border-border bg-card p-5"><h2 className="font-serif text-2xl">Invite a teammate</h2><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void change({action:"invite",email:data.get("email"),role:data.get("role"),delivery:data.get("delivery"),canSendOutreach:data.get("send")==="on"})}}>
        <label className="text-sm">Email address<input name="email" type="email" required maxLength={254} className={field} disabled={busy}/></label>
        <label className="text-sm">Role<select name="role" defaultValue="viewer" className={field} disabled={busy}>{(team.isOwner?["viewer","member","admin"]:["viewer","member"]).map(role=><option key={role}>{role}</option>)}</select></label>
        <label className="text-sm">Delivery<select name="delivery" className={field} disabled={busy}><option value="link">Create a link to share</option><option value="email" disabled={!team.emailAvailable}>Send invitation email</option></select></label>
        {team.isOwner && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="send" disabled={busy}/>Allow email sending (members/admins only)</label>}
        <p className="text-sm text-muted-foreground sm:col-span-2">Links expire after seven days and require the invited email to be verified. Creating another invitation for the same email replaces the previous pending link.</p><button className={button} disabled={busy}>Create invitation</button>
      </form>
      {inviteLink && <div className="mt-4"><label className="text-sm">Invitation link<input aria-label="Invitation link" readOnly value={inviteLink} className={field} onFocus={e=>e.target.select()}/></label><button className={button+" mt-2"} onClick={()=>void (navigator.clipboard ? navigator.clipboard.writeText(inviteLink) : Promise.reject(new Error("Clipboard unavailable"))).then(()=>setNotice("Invitation link copied.")).catch(()=>setNotice("Select the invitation link above and copy it manually."))}>Copy invitation link</button><p className="mt-2 text-xs text-muted-foreground">For security, the link is only shown immediately after creation. Replace the invitation if you need a new link later.</p></div>}
      <ul className="mt-5 grid gap-3">{team.invitations.map((inv:any)=><li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm"><span>{inv.email} · {inv.role} · {inv.status} · email: {inv.delivery_status}</span>{inv.status==="pending" && (team.isOwner || inv.role!=="admin") && <button className={button} disabled={busy} onClick={()=>void change({action:"revoke_invitation",invitationId:inv.id})}>Revoke invitation</button>}</li>)}</ul></section>}
      {team.canManage && <section className="mt-6 border border-border p-5"><h2 className="font-serif text-2xl">Access history</h2><ol className="mt-4 grid gap-3 text-sm">{team.events.length ? team.events.map((event:any)=><li key={event.id} className="border-t border-border pt-3"><span className="font-medium">{event.action.replaceAll("_"," ")}</span> · {new Date(event.created_at).toLocaleString()}<p className="text-xs text-muted-foreground">Actor: {event.actor_user_id}{event.target_user_id ? ` · Teammate: ${event.target_user_id}` : ""}</p></li>):<li>No access changes recorded yet.</li>}</ol></section>}
      {!archived && <div className="mt-8 flex flex-wrap gap-3">{team.isOwner?<button className={button} disabled={busy} onClick={()=>confirm({action:"archive"},"Archive this workspace?","Operating access will stop, but records and memberships are retained. Pending invitations and transfers will be cancelled. You can restore the workspace from Manage workspaces.")}>Archive workspace</button>:<button className={button} disabled={busy} onClick={()=>confirm({action:"leave"},"Leave this workspace?","You will lose access. Shared records stay with the team; you will need a new invitation to return.")}>Leave workspace</button>}</div>}
    </>}
    <Dialog open={!!confirmation} onOpenChange={open=>{if(!open && !busy)setConfirmation(null)}}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();if(opener.current?.isConnected)opener.current.focus()}}><DialogTitle>{confirmation?.title}</DialogTitle><DialogDescription>{confirmation?.detail}</DialogDescription>{error&&<p role="alert">{error}</p>}<div className="flex gap-3"><button className={button} disabled={busy} onClick={()=>setConfirmation(null)}>Cancel</button><button className={button} disabled={busy} onClick={()=>confirmation && void change(confirmation.change)}>{busy?"Saving…":"Confirm change"}</button></div></DialogContent></Dialog>
  </div>
}
