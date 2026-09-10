"use client"
import { createContext, useContext, useRef, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Phone, Laptop, Loader2, ChevronDown } from "lucide-react"
import { swrFetcher } from "@/lib/http/client"
import { CALL_CONTEXT, MAX_TRANSCRIPT } from "@/lib/calls/contracts"
import type { CallScope } from "@/lib/calls/access"

type Call = { id: string; title: string; investor_name?: string; created_at: string; status: string; source: string;
  summary?: string; sentiment?: string; interest_level?: string; generated_by?: string; analysis_error?: string;
  objections?: { objection: string; response: string }[]; next_steps?: string[]; key_questions?: string[];
  draft_followup?: string; recommended_stage?: string; crm_entry_id?: string; outreach_message_id?: string }
const field = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-11"
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
const primary = `${button} bg-primary text-primary-foreground hover:opacity-90`
const Workspace = createContext("")
function useCallRequest() {
  const orgId = useContext(Workspace)
  return (url: string, method = "POST", body?: unknown) => request(url, method, body, orgId)
}
async function request(url: string, method = "POST", body?: unknown, orgId = "") {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json", "x-anker-workspace": orgId }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Request failed. Please retry.")
  return data
}

export function CallIntelligence() {
  const { data, error, isLoading, mutate } = useSWR<{ calls: Call[]; legacy: Call[]; scope: CallScope }>("/api/calls", swrFetcher, { refreshInterval: 15000 })
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  if (isLoading) return <div role="status" className="p-8 flex gap-2"><Loader2 className="animate-spin" />Loading your calls…</div>
  if (error || !data) return <div className="p-8 space-y-4"><h1>Call Intelligence</h1><p role="alert">Calls are unavailable. Check your active workspace and connection, then retry.</p><button className={button} onClick={() => mutate()}>Retry loading calls</button><Link href="/onboarding" className={button}>Workspace setup</Link></div>
  const context = CALL_CONTEXT[data.scope.persona]
  const visible = data.calls.filter(c => `${c.title} ${c.investor_name ?? ""} ${c.summary ?? ""}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || c.source === filter || c.status === filter))
  return <Workspace.Provider value={data.scope.orgId}><div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-8" key={`${data.scope.userId}:${data.scope.orgId}`}>
    <header className="border-b border-border pb-7">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{context.label} · {data.scope.workspace} · Private to you</p>
      <h1 className="mt-3 text-3xl sm:text-4xl">Turn conversations into considered next steps.</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">{context.description}</p>
      <p className="mt-3 text-sm text-muted-foreground">Capture → Sync → Review → Follow through. Suggestions never advance a deal, confirm a commitment or send a message automatically.</p>
    </header>
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Composer writable={data.scope.writable} onSaved={mutate} />
      <Devices writable={data.scope.writable} workspace={data.scope.workspace} />
    </div>
    <section aria-labelledby="call-library" className="space-y-4">
      <div className="flex flex-wrap justify-between gap-4 items-end"><div><h2 id="call-library" className="text-xl">Your call library</h2><p className="text-xs text-muted-foreground">Latest 100 calls in this workspace. {visible.length} shown.</p></div><div className="flex flex-wrap gap-3">
        <label className="text-sm">Search<input className={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="Title, participant or summary" /></label>
        <label className="text-sm">View<select className={field} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All calls</option><option value="captured">Awaiting analysis</option><option value="needs_review">Needs review</option><option value="analysis_failed">Analysis failed</option><option value="desktop">Desktop imports</option></select></label>
      </div></div>
      {visible.length === 0 && <p className="border border-dashed border-border rounded-md p-8 text-muted-foreground">{data.calls.length ? "No calls match these filters." : "Your first conversation starts here. Paste a transcript or connect the desktop companion."}</p>}
      {visible.map(call => <CallCard key={call.id} call={call} scope={data.scope} refresh={mutate} />)}
    </section>
    {!!data.legacy.length && <section className="border-t border-border pt-6"><h2 className="text-xl">Earlier personal calls</h2><p className="text-sm text-muted-foreground mb-3">These calls predate workspace scoping. Assign each one explicitly to {data.scope.workspace}.</p>{data.legacy.map(c => <LegacyCall key={c.id} call={c} scope={data.scope} refresh={mutate} />)}</section>}
  </div></Workspace.Provider>
}

function Composer({ writable, onSaved }: { writable: boolean; onSaved: () => unknown }) {
  const request = useCallRequest()
  const [title, setTitle] = useState(""); const [participant, setParticipant] = useState(""); const [transcript, setTranscript] = useState(""); const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(false)
  const upload = useRef<{ content: string; id: string } | null>(null)
  const lock = useRef(false)
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(""); setSaved(false)
    const content = JSON.stringify({ title, investorName: participant, transcript, consent })
    if (upload.current?.content !== content) upload.current = { content, id: crypto.randomUUID() }
    try { await request("/api/calls", "POST", { ...JSON.parse(content), externalId: upload.current.id }); setTranscript(""); setConsent(false); setSaved(true); upload.current = null; await onSaved() }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save. Your transcript remains in the form.") }
    finally { lock.current = false; setBusy(false) }
  }
  return <form onSubmit={save} className="rounded-md border border-border p-5 space-y-4">
    <h2 className="flex gap-2 items-center text-xl"><Phone size={20} /> Add a conversation</h2>
    <fieldset disabled={!writable || busy} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Call title<input className={field} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} /></label><label className="block text-sm">Participant or organization<input className={field} value={participant} onChange={e => setParticipant(e.target.value)} maxLength={200} /></label></div>
    <label className="block text-sm">Transcript<textarea className={`${field} mt-1`} rows={8} value={transcript} onChange={e => setTranscript(e.target.value)} maxLength={MAX_TRANSCRIPT} required minLength={20} /></label>
    <p className="text-xs text-muted-foreground">{transcript.length.toLocaleString()} / {MAX_TRANSCRIPT.toLocaleString()} characters. Saving does not start AI analysis.</p>
    <label className="flex gap-3 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />I have permission to upload this transcript to my Anker workspace.</label>
    <button className={primary} disabled={!consent || transcript.trim().length < 20 || busy}>{busy ? "Saving…" : "Save transcript"}</button></fieldset>
    {!writable && <p className="text-sm">This workspace grants view-only access.</p>}{error && <p role="alert" className="text-destructive">{error}</p>}{saved && <p role="status">Transcript saved. Open the call below to review or request analysis.</p>}
  </form>
}

function Devices({ writable, workspace }: { writable: boolean; workspace: string }) {
  const request = useCallRequest()
  const { data: releases, error: releaseError } = useSWR<{ releases: { platform: string; version: string; filename: string; sha256: string; size: number }[] }>("/api/calls/releases", swrFetcher)
  const { data, error, mutate } = useSWR<{ devices: { id: string; name: string; expires_at: string; revoked_at?: string; last_seen_at?: string }[] }>("/api/calls/devices", swrFetcher)
  const [name, setName] = useState(""); const [token, setToken] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("")
  async function act(id?: string) {
    setBusy(true); setMessage("")
    try { const r = await request("/api/calls/devices", id ? "DELETE" : "POST", id ? { id } : { name }); if (!id) setToken(r.token); await mutate() }
    catch (e) { setMessage(e instanceof Error ? e.message : "Connection update failed.") } finally { setBusy(false) }
  }
  return <section className="rounded-md border border-border p-5 space-y-4">
    <h2 className="flex gap-2 items-center text-xl"><Laptop size={20} /> Desktop companion</h2>
    <p className="text-sm text-muted-foreground">Capture on your computer with your chosen speech provider. Local Whisper keeps audio on the device. Only the transcript you explicitly select is uploaded here.</p>
    {releaseError ? <p role="alert" className="text-sm">Installer availability could not be checked. Refresh to retry.</p> : !releases ? <p role="status" className="text-sm">Checking installer availability…</p> : releases.releases.length === 0 ? <p className="text-sm">The companion is currently available from source. Signed private installers are not yet published.</p> : releases.releases.map(r => <div key={r.platform} className="text-sm"><a className="underline" href={`/api/calls/download?platform=${r.platform}`}>Download {r.platform} · {r.version} · {Math.round(r.size / 1e6)} MB</a><details className="text-xs text-muted-foreground"><summary>Verify download checksum</summary><code className="break-all">{r.sha256}</code></details></div>)}
    <a className="text-sm underline" href="https://github.com/345668/Call-Intelligence/tree/feat/anker-private-sync" target="_blank" rel="noreferrer">Desktop source and setup instructions</a>
    <label className="block text-sm">Device name<input className={field} value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="My laptop" disabled={!writable || busy} /></label>
    <button className={button} disabled={!writable || busy || !name.trim()} onClick={() => act()}>Create connection key</button>
    {token && <div className="space-y-2"><p className="text-sm">Copy this key into the desktop Anker tab. It expires in 90 days and uploads only to {workspace}. Shown once.</p><input className={field} aria-label="One-time desktop connection key" readOnly value={token} onFocus={e => e.target.select()} /><button className={button} onClick={() => setToken("")}>Hide key</button></div>}
    {error && <div role="alert">Devices could not load. <button className={button} onClick={() => mutate()}>Retry</button></div>}
    {!error && !data && <p role="status">Loading connections…</p>}
    {data?.devices.map(d => <div className="border-t border-border pt-3 text-sm flex justify-between gap-3" key={d.id}><div>{d.name}<p className="text-xs text-muted-foreground">{d.revoked_at ? "Revoked" : `Expires ${new Date(d.expires_at).toLocaleDateString()}`} · {d.last_seen_at ? `Last connected ${new Date(d.last_seen_at).toLocaleDateString()}` : "Not connected yet"}</p></div>{!d.revoked_at && <button className={button} disabled={busy || !writable} onClick={() => act(d.id)}>Revoke</button>}</div>)}
    {message && <p role="alert" className="text-destructive">{message}</p>}
  </section>
}

function CallCard({ call, scope, refresh }: { call: Call; scope: CallScope; refresh: () => unknown }) {
  const request = useCallRequest()
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [transcript, setTranscript] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null); const [analyzeConsent, setAnalyzeConsent] = useState(false); const [reviewed, setReviewed] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false)
  const { data: contacts, error: contactsError } = useSWR<{ contacts: { id: string; display_name: string }[] }>(open && scope.persona !== "lp" ? "/api/calls/contacts" : null, swrFetcher)
  const lock = useRef(false)
  async function action(kind: string, body?: unknown) {
    if (lock.current) return; lock.current = true; setBusy(kind); setError("")
    try {
      const result = await request(`/api/calls/${call.id}${["analyze", "followup"].includes(kind) ? `/${kind}` : ""}`, kind === "delete" ? "DELETE" : kind === "transcript" ? "GET" : ["link", "review"].includes(kind) ? "PATCH" : "POST", body)
      if (kind === "transcript") setTranscript(result.call.transcript)
      if (kind === "analyze") { setDraft(null); setReviewed(false) }
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); await refresh() }
    finally { lock.current = false; setBusy("") }
  }
  return <article className="border border-border rounded-md overflow-hidden">
    <h3><button aria-expanded={open} aria-controls={`call-${call.id}`} onClick={() => setOpen(!open)} className="w-full flex justify-between gap-4 text-left p-5 min-h-11"><span><span className="font-medium">{call.title || call.investor_name || "Untitled call"}</span><span className="block text-xs text-muted-foreground mt-1">{new Date(call.created_at).toLocaleString()} · {call.source} · {call.status.replaceAll("_", " ")}</span></span><ChevronDown className="shrink-0" size={18} /></button></h3>
    {open && <div id={`call-${call.id}`} className="p-5 border-t border-border space-y-5">
      <div className="flex flex-wrap gap-3"><button className={button} disabled={!!busy} onClick={() => action("transcript")}>View original transcript</button><span className="self-center text-xs text-muted-foreground">{call.generated_by ? `Analysis: ${call.generated_by} · Verify against transcript` : "Transcript saved; no analysis yet"}</span></div>
      {transcript !== null && <pre className="whitespace-pre-wrap break-words max-h-80 overflow-y-auto text-sm border border-border rounded p-4" tabIndex={0}>{transcript}</pre>}
      {call.summary && <div><h4 className="font-medium mb-2">Review summary</h4><p className="whitespace-pre-wrap text-sm">{call.summary}</p><p className="text-xs text-muted-foreground mt-2">Interpreted tone: {call.sentiment ?? "unknown"} · Interest: {call.interest_level ?? "unknown"}. These are suggestions, not verified outcomes.</p></div>}
      {!!call.objections?.length && <div><h4 className="font-medium">Concerns and suggested responses</h4>{call.objections.map((o, i) => <div className="border-l border-border pl-4 mt-3 text-sm" key={i}><p>{o.objection}</p><p className="text-muted-foreground">Suggested response: {o.response}</p></div>)}</div>}
      <div className="grid sm:grid-cols-2 gap-5">{[["Next steps", call.next_steps], ["Open questions", call.key_questions]].map(([label, items]) => <div key={label as string}><h4 className="font-medium">{label as string}</h4><ul className="mt-2 list-disc pl-5 text-sm space-y-2">{((items as string[]) ?? []).map((item, i) => <li key={i}>{item}</li>)}</ul></div>)}</div>
      {call.analysis_error && <p role="alert" className="text-destructive text-sm">{call.analysis_error}</p>}
      {scope.writable && <div className="border-t border-border pt-4 space-y-3"><label className="flex gap-3 text-sm"><input type="checkbox" checked={analyzeConsent} onChange={e => setAnalyzeConsent(e.target.checked)} />Send this transcript to Anker's configured AI provider for analysis. Desktop provider settings do not apply here.</label><button className={button} disabled={!!busy || !analyzeConsent} onClick={() => action("analyze", { consent: true })}>{busy === "analyze" ? "Analyzing…" : call.status === "analyzing" ? "Retry stalled analysis" : "Analyze transcript"}</button>{call.status === "analyzing" && <p className="text-xs text-muted-foreground">Analysis is running. If interrupted, retry after three minutes.</p>}</div>}
      {scope.persona !== "lp" && <div className="space-y-3"><label className="block text-sm">Linked contact · your personal CRM (first 500)<select className={field} value={call.crm_entry_id ?? ""} disabled={!!busy || !scope.writable || !!call.outreach_message_id} onChange={e => action("link", { crmEntryId: e.target.value })}><option value="">Choose contact</option>{contacts?.contacts.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label>{contactsError && <p role="alert">Contacts could not load. Reopen the call to retry.</p>}
        {!!call.recommended_stage && call.recommended_stage !== "none" && <p className="text-xs text-muted-foreground">Suggested CRM stage: {call.recommended_stage}. Review and change it in <Link className="underline" href="/dashboard/crm">Relationships</Link> if appropriate.</p>}
      </div>}
      <label className="block text-sm">Follow-up for your review<textarea className={`${field} mt-1`} rows={4} value={draft ?? call.draft_followup ?? ""} maxLength={12000} onChange={e => { setDraft(e.target.value); setReviewed(false) }} /></label>
      {scope.writable && <div className="space-y-3"><label className="flex gap-3 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I verified the notes against the transcript and reviewed the follow-up.</label><button className={button} disabled={!!busy || !reviewed} onClick={() => action("review", { reviewed: true, editedDraft: draft ?? call.draft_followup ?? "" })}>Save reviewed notes</button></div>}
      {scope.persona !== "lp" && <div className="space-y-3"><label className="flex gap-3 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed this text and its linked contact.</label><button className={primary} disabled={!!busy || !scope.writable || !reviewed || !call.crm_entry_id || !!call.outreach_message_id} onClick={() => action("followup", { editedDraft: draft ?? call.draft_followup ?? "", reviewed: true })}>{call.outreach_message_id ? "Draft created" : "Create outbox draft"}</button> <Link href="/dashboard/outreach" className="text-sm underline">Review outbox</Link></div>}
      {scope.persona === "lp" && <p className="text-sm text-muted-foreground">Copy your reviewed text into your preferred communication channel. These private notes do not change fund or payment records.</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {scope.writable && <div className="border-t border-border pt-4">{!confirmDelete ? <button className={button} onClick={() => setConfirmDelete(true)}>Delete call…</button> : <div className="space-y-3"><p className="text-sm">Delete the stored transcript and analysis? Existing outbox drafts and local desktop copies remain.</p><button className={`${button} text-destructive`} disabled={!!busy} onClick={() => action("delete")}>Confirm deletion</button> <button className={button} onClick={() => setConfirmDelete(false)}>Cancel</button></div>}</div>}
    </div>}
  </article>
}
function LegacyCall({ call, scope, refresh }: { call: Call; scope: CallScope; refresh: () => unknown }) {
  const request = useCallRequest()
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false)
  return <div className="py-3 space-y-2"><span className="mr-4">{call.title || "Untitled call"}</span><button className={button} disabled={!scope.writable || busy} onClick={async () => { setBusy(true); setError(""); try { await request(`/api/calls/${call.id}`, "PATCH", { claimLegacy: true }); await refresh() } catch (e) { setError(e instanceof Error ? e.message : "Assignment failed.") } finally { setBusy(false) } }}>Assign to {scope.workspace}</button>{error && <p role="alert">{error}</p>}</div>
}
