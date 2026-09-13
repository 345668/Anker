"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Sparkles, Send, Mail, MailOpen, ArrowLeft, RefreshCw } from "lucide-react";
import { swrFetcher } from "@/lib/http/client";

interface UpdateRow { id: string; title: string; period: string | null; status: string; created_at: string; sent_at: string | null; recipients: number; opened: number }
interface Recipient { id: string; name: string | null; email: string | null; sent_at: string | null; opened_at: string | null; open_count: number }
interface Recommended { crmEntryId: string; name: string; email: string | null; stage: string | null }

export function UpdateBuilder() {
  const { data, mutate, isLoading, error } = useSWR<{ updates: UpdateRow[] }>("/api/updates", swrFetcher);
  const [selected, setSelected] = useState<string | null>(null);
  if (selected) return <Detail id={selected} onBack={() => { setSelected(null); mutate(); }} />;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <span className="mb-2 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <span className="h-px w-8 bg-[#e5380f]" /> Investor Updates
          </span>
          <h1 className="font-serif text-3xl tracking-tight">Keep investors warm</h1>
        </div>
      </header>
      <Composer onCreated={(id) => { mutate(); setSelected(id); }} />

      <div className="mt-8 space-y-3">
        {isLoading && <div role="status" className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /><span className="sr-only">Loading updates</span></div>}
        {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">Updates could not be loaded. Refresh and try again.</div>}
        {(data?.updates ?? []).map((u) => (
          <button key={u.id} onClick={() => setSelected(u.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-foreground/10 bg-card/40 px-4 py-3 text-left hover:border-foreground/20">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.title}</div>
              <div className="text-xs text-muted-foreground">{u.period ?? new Date(u.created_at).toLocaleDateString()}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${u.status === "sent" ? "bg-emerald-500/10 text-emerald-600" : u.status === "partial" ? "bg-amber-500/10 text-amber-700" : "bg-foreground/[0.06] text-muted-foreground"}`}>{u.status}</span>
            {u.status === "sent" && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MailOpen className="h-3.5 w-3.5" /> {u.opened}/{u.recipients}</span>}
          </button>
        ))}
        {data && !data.updates?.length && <p className="py-8 text-center text-sm text-muted-foreground">No updates yet — draft your first above.</p>}
      </div>
    </div>
  );
}

function Composer({ onCreated }: { onCreated: (id: string) => void }) {
  const [period, setPeriod] = useState("");
  const [highlights, setHighlights] = useState("");
  const [busy, setBusy] = useState(false);
  async function draft() {
    setBusy(true);
    try {
      const res = await fetch("/api/updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: period || undefined, highlights: highlights || undefined }) });
      const j = await res.json();
      if (res.ok) onCreated(j.update.id); else alert(j?.error ?? "Failed");
    } finally { setBusy(false); }
  }
  return (
    <section className="rounded-2xl border border-foreground/10 bg-card/50 p-5">
      <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Period (e.g. September 2026)"
        className="mb-3 w-full rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
      <textarea value={highlights} onChange={(e) => setHighlights(e.target.value)} rows={5}
        placeholder="Raw highlights: wins, metrics, lowlights, what's next, asks…"
        className="w-full resize-y rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
      <div className="mt-3 flex justify-end">
        <button onClick={draft} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Drafting…</> : <><Sparkles className="h-4 w-4" /> Draft with AI</>}
        </button>
      </div>
    </section>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, error, mutate } = useSWR<any>(`/api/updates/${id}`, swrFetcher, { refreshInterval: 5000 });
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [asks, setAsks] = useState<string | null>(null);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  if (error) return <div role="alert" className="p-8">Could not load this update. <button className="underline" onClick={() => void mutate()}>Try again</button></div>;
  const u = data?.update;
  if (!u) return <p role="status" className="p-8">Loading update…</p>;
  const editable = u.status === "draft" && !u.delivery_snapshot;
  const content = { title: title ?? u.title ?? "", body: body ?? u.body ?? "", asks: asks ?? u.asks ?? "" };
  const recommended: Recommended[] = data.recommended || [];
  const chosen = recommended.filter(r => r.email && picked[r.crmEntryId] !== false);
  async function act(kind: "save" | "send" | "sync") {
    setBusy(true); setActionError(""); setNotice("");
    try {
      const payload = kind === "save" ? { ...content, revision: editRevision ?? u.revision } : kind === "send" ? {
        revision: editRevision ?? u.revision, ...(editable ? { content, recipients: chosen.map(r => ({ crmEntryId: r.crmEntryId, name: r.name, email: r.email })) } : {}),
      } : undefined;
      const res = await fetch(`/api/updates/${id}${kind === "save" ? "" : `/${kind}`}`, { method: kind === "save" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
      const result = await res.json();
      await mutate();
      if (!res.ok) throw new Error(result.error || "Request failed.");
      if (kind !== "sync") { setTitle(null); setBody(null); setAsks(null); setEditRevision(null); }
      setNotice(kind === "save" ? "Edits saved." : kind === "send" ? `${result.sent} sent, ${result.skipped} suppressed.` : result.skipped ? "Delivery tracking is unavailable." : "Delivery status refreshed.");
    } catch (e) { setActionError(e instanceof Error ? e.message : "Request failed. Your edits are still here."); }
    finally { setBusy(false); }
  }
  const recipients: any[] = data.recipients || [];
  const frozen = !!u.delivery_snapshot;
  const canRetry = frozen && (u.status === "partial" || (u.status === "sending" && u.send_lease_until && new Date(u.send_lease_until).getTime() < Date.now()));
  const shown = frozen ? { title: u.title, body: u.body, asks: u.asks } : content;
  return <div className="mx-auto max-w-3xl space-y-5 px-6 py-8">
    <button onClick={onBack} disabled={busy} className="text-sm underline">All updates</button>
    {actionError && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{actionError}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <p className="text-sm text-muted-foreground">{u.status} / Revision {u.revision}{frozen ? " / Content and recipients locked for delivery" : " / Review before sending"}</p>
    {u.last_error && <p role="status" className="text-sm">{u.last_error}</p>}
    <fieldset disabled={!editable || busy} className="space-y-4">
      <label className="block text-sm">Subject<input maxLength={200} value={shown.title || ""} onChange={e => { setEditRevision(v => v ?? u.revision); setTitle(e.target.value); }} className="mt-1 w-full rounded-lg border bg-background p-3 font-serif text-xl" /></label>
      <label className="block text-sm">Update<textarea maxLength={50000} rows={12} value={shown.body || ""} onChange={e => { setEditRevision(v => v ?? u.revision); setBody(e.target.value); }} className="mt-1 w-full rounded-lg border bg-background p-3" /></label>
      <label className="block text-sm">Asks<textarea maxLength={10000} rows={3} value={shown.asks || ""} onChange={e => { setEditRevision(v => v ?? u.revision); setAsks(e.target.value); }} className="mt-1 w-full rounded-lg border bg-background p-3" /></label>
    </fieldset>
    {editable && <>
      <button disabled={busy} onClick={() => void act("save")} className="text-sm underline">Save edits</button>
      <section><h2 className="mb-3 font-serif text-xl">Review recipients ({chosen.length} selected)</h2>
        <div className="max-h-64 overflow-y-auto space-y-2">{recommended.map(r => <label key={r.crmEntryId} className="flex items-center gap-3 rounded border p-3 text-sm"><input type="checkbox" disabled={busy || !r.email} checked={!!r.email && picked[r.crmEntryId] !== false} onChange={e => setPicked(p => ({ ...p, [r.crmEntryId]: e.target.checked }))} /><span>{r.name} <span className="text-muted-foreground">{r.email || "No email"}</span></span></label>)}</div>
        {!recommended.length && <p className="text-sm text-muted-foreground">No engaged investors with email addresses found. Update your CRM first.</p>}
        <p className="my-3 text-sm text-muted-foreground">Send saves and delivers exactly the content above to the selected recipients. Suppressed addresses are skipped.</p>
        <button disabled={busy || !chosen.length || !content.title.trim() || !content.body.trim()} onClick={() => void act("send")} className="rounded-lg bg-primary px-5 py-3 text-sm text-primary-foreground disabled:opacity-50">{busy ? "Processing…" : `Save and send to ${chosen.length}`}</button>
      </section>
    </>}
    {frozen && <section className="space-y-3"><h2 className="font-serif text-xl">Delivery results</h2>
      <p className="text-sm text-muted-foreground">Retries use the original message and recipient list. Create a new update to change either.</p>
      {canRetry && <button disabled={busy} onClick={() => void act("send")} className="rounded-lg border px-4 py-2 text-sm">Retry pending or failed deliveries</button>}
      {u.status === "sending" && !canRetry && <p role="status" className="text-sm">Sending is in progress. Status refreshes automatically.</p>}
      <ul className="divide-y">{(u.delivery_snapshot.recipients || []).map((r: any) => { const delivery = recipients.find(d => d.email?.toLowerCase() === r.email.toLowerCase()); return <li key={r.trackingId} className="py-3 text-sm"><span>{r.name || r.email}</span><span className="ml-3 text-muted-foreground">{delivery?.delivery_status || "pending"}{delivery?.opened_at ? " / opened" : ""}</span>{delivery?.last_error && <p className="mt-1 text-muted-foreground">{delivery.last_error}</p>}</li> })}</ul>
      <button disabled={busy} className="text-sm underline" onClick={() => void act("sync")}>Refresh delivery tracking</button>
    </section>}
  </div>;
}
