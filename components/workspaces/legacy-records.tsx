"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
type RecordItem = { id:string;name:string;count?:number;status?:string }
type LegacyData = { orgId:string;workspace:string;canWrite:boolean;boards:RecordItem[];contacts:RecordItem[];updates:RecordItem[] }
export function LegacyWorkspaceRecords() {
  const [data,setData]=useState<LegacyData|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("")
  const [selected,setSelected]=useState<{kind:"board"|"contact"|"update";record:RecordItem}|null>(null),[busy,setBusy]=useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const pending=useRef(false)
  const load=useCallback(async()=>{try{const response=await fetch("/api/org/legacy-records",{cache:"no-store"});const value=await response.json();if(!response.ok)throw Error(value.error);setData(value)}catch(cause){setError(cause instanceof Error?cause.message:"Records could not be loaded.")}},[])
  useEffect(()=>{void load()},[load])
  async function move() {
    if(!data||!selected||pending.current)return
    pending.current=true;setBusy(true);setError("")
    try{const response=await fetch("/api/org/legacy-records",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({orgId:data.orgId,kind:selected.kind,id:selected.record.id,confirmed:true})});const result=await response.json();if(!response.ok)throw Error(result.error);setNotice(`${selected.record.name} now belongs to ${data.workspace}.`);setSelected(null);await load()}
    catch(cause){setError(cause instanceof Error?cause.message:"Nothing was moved. Please retry.")}
    finally{pending.current=false;setBusy(false)}
  }
  const button="inline-flex min-h-11 items-center rounded border border-border px-4 py-2 text-sm disabled:opacity-50"
  return <main onClickCapture={event=>{if(!selected){const target=(event.target as HTMLElement).closest("button");if(target)opener.current=target as HTMLElement}}} className="mx-auto max-w-4xl px-4 py-8 sm:px-8"><Link href="/dashboard/entities" className={button}>Manage workspaces</Link><h1 className="mt-6 font-serif text-3xl">Move older records into a workspace</h1><p className="mt-3 text-sm text-muted-foreground">These records have no confirmed workspace. Only you can choose where your records belong. Moving shares them with the destination team and preserves creator attribution. Private email drafts, call recordings and exported files are not moved.</p>
    {data&&<p className="my-5 border border-border p-4">Destination: <strong>{data.workspace}</strong>. Switch workspaces before choosing records for another company or fund.</p>}
    {error&&<p role="alert" className="my-4">{error} <button className={button} onClick={()=>{setError("");void load()}}>Reload</button></p>}{notice&&<p role="status" className="my-4">{notice}</p>}
    {!data&&!error&&<p role="status" className="my-4">Loading your older records…</p>}
    {data&&([ ["board","CRM boards",data.boards],["contact","Unassigned contacts",data.contacts],["update","Investor updates",data.updates] ] as const).map(([kind,title,records])=><section key={kind} className="my-6 border border-border p-5"><h2 className="font-serif text-xl">{title}</h2><ul className="mt-4 space-y-3">{records.length?records.map(record=><li key={record.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><span>{record.name}{record.count!==undefined?` · ${record.count} contacts`:""}{record.status?` · ${record.status}`:""}</span><button className={button} disabled={busy||!data.canWrite||record.status==="sending"} onClick={()=>{setError("");setSelected({kind,record})}}>Review move</button></li>):<li className="text-sm text-muted-foreground">No older records to move.</li>}</ul><p className="mt-3 text-xs text-muted-foreground">Up to 200 records shown at a time. Moved records leave this list.</p></section>)}
    <Dialog open={!!selected} onOpenChange={open=>{if(!open&&!busy)setSelected(null)}}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();if(opener.current?.isConnected)opener.current.focus()}}><DialogTitle>Share this record with {data?.workspace}?</DialogTitle><DialogDescription>{selected?.record.name}{selected?.kind==="board"?" and its contacts and tasks":""} will belong to this workspace. Its members will gain access according to their roles. The move cannot be undone here. Conflicting duplicates stop the entire move for review.</DialogDescription>{error&&<p role="alert">{error}</p>}<div className="flex gap-3"><button className={button} disabled={busy} onClick={()=>setSelected(null)}>Cancel</button><button className={button} disabled={busy} onClick={()=>void move()}>{busy?"Moving…":"Move to workspace"}</button></div></DialogContent></Dialog>
  </main>
}
