"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Phone, Sparkles, Send, Trash2, ChevronDown } from "lucide-react";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface Call {
  id: string; title: string | null; investor_name: string | null; created_at: string;
  summary: string | null; sentiment: string | null; interest_level: string | null;
  objections: { objection: string; response: string }[] | null;
  next_steps: string[] | null; key_questions: string[] | null;
  draft_followup: string | null; recommended_stage: string | null; crm_entry_id: string | null;
}

const sentimentColor: Record<string, string> = {
  positive: "text-emerald-600 bg-emerald-500/10", negative: "text-red-600 bg-red-500/10",
  mixed: "text-amber-600 bg-amber-500/10", neutral: "text-muted-foreground bg-foreground/[0.06]",
};
const interestColor: Record<string, string> = {
  high: "bg-[#e5380f] text-white", medium: "bg-foreground/80 text-background", low: "bg-foreground/30 text-foreground",
};

export function CallIntelligence() {
  const { data, mutate, isLoading } = useSWR<{ calls: Call[] }>("/api/calls", fetcher);
  const [transcript, setTranscript] = useState("");
  const [title, setTitle] = useState("");
  const [investor, setInvestor] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  async function analyze() {
    if (!transcript.trim()) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/calls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, title: title || undefined, investorName: investor || undefined }),
      });
      const j = await res.json();
      if (res.ok) { setTranscript(""); setTitle(""); setInvestor(""); setOpen(j.call?.id ?? null); mutate(); }
      else alert(j?.error ?? "Analysis failed");
    } finally { setAnalyzing(false); }
  }
  async function makeFollowup(id: string, draft?: string) {
    const res = await fetch(`/api/calls/${id}/followup`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editedDraft: draft }),
    });
    const j = await res.json();
    if (res.ok) setFollowed((f) => ({ ...f, [id]: true }));
    else alert(j?.error ?? "Could not create follow-up");
  }
  async function del(id: string) {
    await fetch(`/api/calls/${id}`, { method: "DELETE" });
    mutate();
  }

  const calls = data?.calls ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8">
        <span className="mb-2 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <span className="h-px w-8 bg-[#e5380f]" /> Call Intelligence
        </span>
        <h1 className="font-serif text-3xl tracking-tight">Analyze investor calls</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste a call transcript. Anker extracts the summary, sentiment, objections, next steps, and a draft follow-up you can push to your outbox.
        </p>
      </header>

      {/* Composer */}
      <section className="mb-10 rounded-2xl border border-foreground/10 bg-card/50 p-5 sm:p-6">
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call title (optional)"
            className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
          <input value={investor} onChange={(e) => setInvestor(e.target.value)} placeholder="Investor / firm (optional)"
            className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
        </div>
        <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={7}
          placeholder="Paste the call transcript here…"
          className="w-full resize-y rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{transcript.length.toLocaleString()} chars</span>
          <button onClick={analyze} disabled={analyzing || !transcript.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50">
            {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4" /> Analyze call</>}
          </button>
        </div>
      </section>

      {/* Calls */}
      <div className="space-y-4">
        {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!isLoading && calls.length === 0 && (
          <div className="rounded-2xl border border-dashed border-foreground/15 py-12 text-center text-sm text-muted-foreground">
            <Phone className="mx-auto mb-2 h-5 w-5" /> No calls analyzed yet.
          </div>
        )}
        {calls.map((c) => {
          const isOpen = open === c.id;
          return (
            <div key={c.id} className="rounded-2xl border border-foreground/10 bg-card/40">
              <button onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.title || c.investor_name || "Investor call"}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.summary || "—"}</div>
                </div>
                {c.sentiment && <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${sentimentColor[c.sentiment] ?? sentimentColor.neutral}`}>{c.sentiment}</span>}
                {c.interest_level && <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${interestColor[c.interest_level] ?? ""}`}>{c.interest_level}</span>}
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="space-y-5 border-t border-foreground/10 px-5 py-5">
                  {c.summary && <p className="text-sm leading-relaxed">{c.summary}</p>}

                  {!!c.objections?.length && (
                    <div>
                      <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Objections</h4>
                      <ul className="space-y-2">
                        {c.objections.map((o, i) => (
                          <li key={i} className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3 text-sm">
                            <div className="font-medium">{o.objection}</div>
                            {o.response && <div className="mt-1 text-muted-foreground">↳ {o.response}</div>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid gap-5 sm:grid-cols-2">
                    {!!c.next_steps?.length && (
                      <div>
                        <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Next steps</h4>
                        <ul className="space-y-1.5 text-sm">{c.next_steps.map((s, i) => <li key={i} className="flex gap-2"><span className="text-[#e5380f]">→</span>{s}</li>)}</ul>
                      </div>
                    )}
                    {!!c.key_questions?.length && (
                      <div>
                        <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Key questions</h4>
                        <ul className="space-y-1.5 text-sm text-muted-foreground">{c.key_questions.map((q, i) => <li key={i}>· {q}</li>)}</ul>
                      </div>
                    )}
                  </div>

                  {c.draft_followup && (
                    <div>
                      <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Draft follow-up</h4>
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-sm leading-relaxed">{c.draft_followup}</div>
                      <div className="mt-3 flex items-center gap-3">
                        <button onClick={() => makeFollowup(c.id, c.draft_followup ?? undefined)} disabled={!c.crm_entry_id || followed[c.id]}
                          title={c.crm_entry_id ? "Push to outbox as a draft" : "Link this call to a CRM investor to enable"}
                          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50">
                          <Send className="h-3.5 w-3.5" /> {followed[c.id] ? "Drafted in outbox" : "Create follow-up draft"}
                        </button>
                        {!c.crm_entry_id && <span className="text-xs text-muted-foreground">Link an investor to enable outbox draft.</span>}
                        <button onClick={() => del(c.id)} className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
