"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Sparkles, Send, Mail, MailOpen, ArrowLeft, RefreshCw } from "lucide-react";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface UpdateRow { id: string; title: string; period: string | null; status: string; created_at: string; sent_at: string | null; recipients: number; opened: number }
interface Recipient { id: string; name: string | null; email: string | null; sent_at: string | null; opened_at: string | null; open_count: number }
interface Recommended { crmEntryId: string; name: string; email: string | null; stage: string | null }

export function UpdateBuilder() {
  const { data, mutate } = useSWR<{ updates: UpdateRow[] }>("/api/updates", fetcher);
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
        {(data?.updates ?? []).map((u) => (
          <button key={u.id} onClick={() => setSelected(u.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-foreground/10 bg-card/40 px-4 py-3 text-left hover:border-foreground/20">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.title}</div>
              <div className="text-xs text-muted-foreground">{u.period ?? new Date(u.created_at).toLocaleDateString()}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${u.status === "sent" ? "bg-emerald-500/10 text-emerald-600" : "bg-foreground/[0.06] text-muted-foreground"}`}>{u.status}</span>
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
  const { data, mutate } = useSWR<{ update: any; recipients: Recipient[]; recommended: Recommended[] }>(`/api/updates/${id}`, fetcher);
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [asks, setAsks] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const u = data?.update;
  if (!u) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const isDraft = u.status === "draft";
  const rec = data!.recommended ?? [];
  const anyPicked = Object.values(picked).some(Boolean);

  async function save() { await fetch(`/api/updates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, asks }) }); mutate(); }
  async function send() {
    setBusy(true);
    try {
      const chosen = rec.filter((r) => picked[r.crmEntryId] && r.email);
      const res = await fetch(`/api/updates/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipients: anyPicked ? chosen : undefined }) });
      const j = await res.json();
      if (res.ok) mutate(); else alert(j?.error ?? "Send failed");
    } finally { setBusy(false); }
  }
  async function sync() { await fetch(`/api/updates/${id}/sync`, { method: "POST" }); mutate(); }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All updates</button>

      <input disabled={!isDraft} value={title ?? u.title ?? ""} onChange={(e) => setTitle(e.target.value)}
        className="mb-3 w-full bg-transparent font-serif text-2xl tracking-tight focus:outline-none disabled:opacity-100" />
      <textarea disabled={!isDraft} value={body ?? u.body ?? ""} onChange={(e) => setBody(e.target.value)} rows={12}
        className="w-full resize-y rounded-xl border border-foreground/10 bg-card/40 p-4 text-sm leading-relaxed focus:border-foreground/30 focus:outline-none" />
      <div className="mt-3">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Asks</div>
        <textarea disabled={!isDraft} value={asks ?? u.asks ?? ""} onChange={(e) => setAsks(e.target.value)} rows={2}
          className="w-full resize-y rounded-lg border border-foreground/10 bg-card/40 p-3 text-sm focus:border-foreground/30 focus:outline-none" />
      </div>

      {isDraft ? (
        <>
          <button onClick={save} className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Save edits</button>
          <section className="mt-8">
            <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Recommended recipients ({rec.filter((r) => r.email).length} with email)</h3>
            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-foreground/10 p-2">
              {rec.map((r) => (
                <label key={r.crmEntryId} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${r.email ? "" : "opacity-40"}`}>
                  <input type="checkbox" disabled={!r.email} checked={!!picked[r.crmEntryId]} onChange={(e) => setPicked((p) => ({ ...p, [r.crmEntryId]: e.target.checked }))} />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">{r.stage}</span>
                  <span className="truncate text-xs text-muted-foreground">{r.email ?? "no email"}</span>
                </label>
              ))}
              {!rec.length && <p className="p-3 text-sm text-muted-foreground">No engaged CRM investors found. Add investors and set their stage.</p>}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={send} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {anyPicked ? `Send to ${rec.filter((r) => picked[r.crmEntryId] && r.email).length}` : "Send to all recommended"}
              </button>
              <span className="text-xs text-muted-foreground">Sends via your outreach mailbox. Suppressed addresses are skipped.</span>
            </div>
          </section>
        </>
      ) : (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Engagement · {data!.recipients.filter((r) => r.opened_at).length}/{data!.recipients.length} opened</h3>
            <button onClick={sync} className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1.5 text-xs hover:bg-foreground/5"><RefreshCw className="h-3.5 w-3.5" /> Sync opens</button>
          </div>
          <div className="space-y-1.5">
            {data!.recipients.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-foreground/10 px-3 py-2 text-sm">
                {r.opened_at ? <MailOpen className="h-4 w-4 text-emerald-600" /> : <Mail className="h-4 w-4 text-muted-foreground" />}
                <span className="flex-1 truncate">{r.name ?? r.email}</span>
                <span className="text-xs text-muted-foreground">{r.opened_at ? "opened" : r.sent_at ? "sent" : "recorded"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
