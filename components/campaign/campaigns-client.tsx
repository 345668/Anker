"use client";

/**
 * Founder campaign control room. Lists every submission with its assessment
 * result + progressive-send progress bar + funnel, drills into the per-campaign
 * investor CRM, and gives the admin full control: adjustable readiness
 * threshold + automation switches, re-assess, release, pause/resume/complete.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, ChevronDown, ChevronRight, Pause, Play, CheckCircle2,
  Mail, Eye, ThumbsUp, ThumbsDown, AlertTriangle, RefreshCw, Sliders,
  RotateCcw, Rocket, Save, FileText, Paperclip,
} from "lucide-react";

interface Counts { total: number; contacted: number; opened: number; interested: number; notInterested: number }
interface Campaign {
  id: string; publicRef: string; startupName: string; founderName: string; founderEmail: string;
  status: string; assessmentScore: number | null; stage: string | null; sectors: string[];
  campaignId: string | null; counts: Counts; createdAt: string | null;
}
interface Assessment {
  score: number; verdict: string; summary: string; strengths: string[]; gaps: string[];
}
interface Detail {
  campaign: {
    status: string; campaignStatus: string | null; sendApproved: boolean; hasDeck: boolean;
    assessmentScore: number | null; assessment: Assessment | null; declineReason: string | null;
    extracted: Record<string, any> | null; profile: Record<string, any> | null;
  };
  entries: Entry[];
}
interface Entry {
  id: string; investorName: string | null; investorEmail: string | null; matchScore: number | null;
  rationale: string | null; stage: string; openedAt: string | null;
  interestChoice: string | null; founderNotified: boolean; sendError: string | null;
}
interface Settings {
  readinessThreshold: number; scoreFloor: number; maxInvestors: number;
  waveSize: number; autoAssess: boolean; autoSend: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  received: "bg-slate-500/15 text-slate-500",
  assessing: "bg-blue-500/15 text-blue-500",
  assessed: "bg-blue-500/15 text-blue-500",
  campaign_ready: "bg-violet-500/15 text-violet-500",
  outreaching: "bg-emerald-500/15 text-emerald-500",
  completed: "bg-emerald-600/15 text-emerald-600",
  declined: "bg-amber-500/15 text-amber-600",
  failed: "bg-red-500/15 text-red-500",
};

export function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaign");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load");
      setCampaigns(json.campaigns);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Founder Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Public submissions → AI assessment → investor matching → progressive outreach.
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <SettingsPanel />

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {campaigns === null ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No submissions yet. They&apos;ll appear here as founders apply at <span className="font-mono">/apply</span>.
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignRow
              key={c.id} c={c}
              expanded={expanded === c.id}
              onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
              onAction={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/campaign/settings");
      const json = await res.json();
      if (res.ok) setS(json.settings);
    })();
  }, []);

  async function save() {
    if (!s) return;
    setSaving(true); setSaved(false);
    try {
      const res = await fetch("/api/campaign/settings", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s),
      });
      const json = await res.json();
      if (res.ok) { setS(json.settings); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } finally { setSaving(false); }
  }

  const num = (k: keyof Settings, label: string, hint: string, min: number, max: number) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      <input
        type="number" min={min} max={max} value={s ? (s[k] as number) : ""}
        onChange={(e) => s && setS({ ...s, [k]: Number(e.target.value) })}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </label>
  );

  const toggle = (k: "autoAssess" | "autoSend", label: string, hint: string) => (
    <button
      type="button" onClick={() => s && setS({ ...s, [k]: !s[k] })}
      className="flex items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted/50"
    >
      <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${s?.[k] ? "bg-emerald-500" : "bg-muted-foreground/30"}`}>
        <span className={`h-4 w-4 rounded-full bg-white transition ${s?.[k] ? "translate-x-4" : ""}`} />
      </span>
      <span>
        <span className="block text-xs font-medium">{label}: {s?.[k] ? "ON" : "OFF"}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );

  return (
    <div className="mb-5 rounded-xl border border-border bg-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-medium">
        <Sliders className="h-4 w-4 text-muted-foreground" />
        Engine controls
        {s && <span className="text-xs font-normal text-muted-foreground">· cutoff {s.readinessThreshold} · {s.autoSend ? "auto-send on" : "manual release"} · {s.autoAssess ? "auto-assess on" : "manual assess"}</span>}
        {open ? <ChevronDown className="ml-auto h-4 w-4" /> : <ChevronRight className="ml-auto h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t border-border p-5">
          {!s ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading settings…</div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {num("readinessThreshold", "Readiness cutoff", "0–100. Below this → auto-declined.", 0, 100)}
                {num("scoreFloor", "Match score floor", "Min investor match score.", 0, 100)}
                {num("maxInvestors", "Max investors", "Cap per campaign.", 1, 500)}
                {num("waveSize", "Send wave size", "Emails per send run.", 1, 200)}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {toggle("autoAssess", "Auto-assess", "Off = submissions wait; you run assessment manually.")}
                {toggle("autoSend", "Auto-send", "Off = matched campaigns wait for your Release before any investor is emailed.")}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save controls
                </button>
                {saved && <span className="text-xs text-emerald-600">Saved — applies to the next assessment/send.</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CampaignRow({ c, expanded, onToggle, onAction }: {
  c: Campaign; expanded: boolean; onToggle: () => void; onAction: () => void;
}) {
  const pct = c.counts.total ? Math.round((c.counts.contacted / c.counts.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left">
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{c.startupName}</span>
            <span className="font-mono text-xs text-muted-foreground">{c.publicRef}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status] ?? "bg-muted"}`}>
              {c.status.replace(/_/g, " ")}
            </span>
            {c.assessmentScore != null && (
              <span className="text-xs text-muted-foreground">score {c.assessmentScore}</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {c.founderName} · {c.founderEmail}{c.stage ? ` · ${c.stage}` : ""}
          </div>
        </div>

        <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <Chip icon={<Mail className="h-3.5 w-3.5" />} n={c.counts.contacted} label="sent" />
          <Chip icon={<Eye className="h-3.5 w-3.5" />} n={c.counts.opened} label="opened" />
          <Chip icon={<ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />} n={c.counts.interested} label="interested" />
        </div>

        <div className="hidden w-36 shrink-0 md:block">
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{c.counts.contacted}/{c.counts.total}</span><span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </button>

      {expanded && <CampaignDetail submissionId={c.id} status={c.status} onAction={onAction} />}
    </div>
  );
}

function Chip({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return <span className="inline-flex items-center gap-1">{icon}{n} <span className="opacity-70">{label}</span></span>;
}

function ActionButton({ id, action, label, icon, onDone, tone }: {
  id: string; action: string; label: string; icon: React.ReactNode; onDone: () => void; tone?: "primary";
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/campaign/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
          onDone();
        } finally { setBusy(false); }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs disabled:opacity-50 ${
        tone === "primary" ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border hover:bg-muted"
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon} {label}
    </button>
  );
}

function AttachDeck({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
      {busy ? "Uploading…" : "Attach / replace deck"}
      <input
        type="file" accept=".pdf,.ppt,.pptx" className="sr-only" disabled={busy}
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setBusy(true);
          try {
            const fd = new FormData(); fd.set("deck", f);
            await fetch(`/api/campaign/${id}/deck`, { method: "POST", body: fd });
            onDone();
          } finally { setBusy(false); }
        }}
      />
    </label>
  );
}

function CampaignDetail({ submissionId, status, onAction }: {
  submissionId: string; status: string; onAction: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => { setDetail(null); setNonce((n) => n + 1); onAction(); }, [onAction]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/campaign/${submissionId}`);
      const json = await res.json();
      if (alive) setDetail(json);
    })();
    return () => { alive = false; };
  }, [submissionId, nonce]);

  if (!detail) return <div className="flex items-center gap-2 border-t border-border px-5 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  const cd = detail.campaign;
  const a = cd.assessment;
  const isActive = status === "outreaching" || status === "campaign_ready";
  const held = status === "campaign_ready" && !cd.sendApproved;

  return (
    <div className="border-t border-border px-5 py-4">
      {/* Assessment result */}
      {a && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="mb-2 flex items-center gap-3">
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${a.verdict === "decline" ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>
              {a.score}
            </span>
            <div>
              <div className="text-sm font-medium">Assessment: {a.verdict === "decline" ? "Declined" : "Passed"} ({a.score}/100)</div>
              {a.summary && <div className="text-xs text-muted-foreground">{a.summary}</div>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {a.strengths?.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-600">Strengths</div>
                <ul className="space-y-0.5 text-xs text-muted-foreground">{a.strengths.map((x, i) => <li key={i}>• {x}</li>)}</ul>
              </div>
            )}
            {a.gaps?.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-600">Gaps</div>
                <ul className="space-y-0.5 text-xs text-muted-foreground">{a.gaps.map((x, i) => <li key={i}>• {x}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}
      {!a && cd.declineReason && (
        <div className="mb-4 rounded-lg border border-amber-300/50 bg-amber-50/50 p-3 text-sm text-amber-700 dark:bg-amber-950/20">
          <AlertTriangle className="mr-2 inline h-4 w-4" />{cd.declineReason}
        </div>
      )}

      {/* What the engine extracted from the deck + what it matched on */}
      {(cd.extracted || cd.profile) && <ExtractionPanel extracted={cd.extracted} profile={cd.profile} />}

      {/* Deck status */}
      <div className="mb-3 flex items-center gap-2 text-xs">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        {cd.hasDeck
          ? <span className="text-muted-foreground">Deck attached to this application.</span>
          : <span className="text-amber-600">No deck on file — attach one, then re-assess.</span>}
        <AttachDeck id={submissionId} onDone={reload} />
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ActionButton id={submissionId} action="reassess" onDone={reload} icon={<RotateCcw className="h-3.5 w-3.5" />} label="Re-assess" />
        {held && <ActionButton id={submissionId} action="release" onDone={reload} tone="primary" icon={<Rocket className="h-3.5 w-3.5" />} label="Release outreach" />}
        {isActive && cd.campaignStatus !== "paused" && (
          <ActionButton id={submissionId} action="pause" onDone={reload} icon={<Pause className="h-3.5 w-3.5" />} label="Pause sends" />
        )}
        {cd.campaignStatus === "paused" && (
          <ActionButton id={submissionId} action="resume" onDone={reload} icon={<Play className="h-3.5 w-3.5" />} label="Resume" />
        )}
        {status !== "completed" && status !== "declined" && (
          <ActionButton id={submissionId} action="complete" onDone={reload} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Force complete" />
        )}
        {held && <span className="text-xs text-amber-600">Held — nothing sends until you release.</span>}
      </div>

      {/* Investor CRM */}
      <CrmTable entries={detail.entries} declined={status === "declined"} />
    </div>
  );
}

function ExtractionPanel({ extracted, profile }: { extracted: any; profile: any }) {
  const [open, setOpen] = useState(false);
  const p = profile || {};
  const conf = extracted?.confidence;
  const deckRead = conf != null ? conf >= 0.4 || !!extracted?.pitchDeckSummary : !!extracted?.pitchDeckSummary;
  const money = (n: any) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}k`);

  // The fields the matching engine actually scores on.
  const matchInputs: [string, string][] = [
    ["Sectors", (p.sectors || []).join(", ") || "—"],
    ["Primary sector", p.primarySector || "—"],
    ["Stage", p.stage || "—"],
    ["Check size", p.checkSizeIdealMin || p.checkSizeIdealMax ? `${money(p.checkSizeIdealMin)}–${money(p.checkSizeIdealMax)}` : "—"],
    ["Raising", money(p.askAmount)],
    ["Geography", [p.location, ...(p.geographyTargetRegions || [])].filter(Boolean).join(" → ") || "—"],
    ["Thesis keywords", (p.thesisKeywords || []).join(", ") || "—"],
  ];

  return (
    <div className="mb-4 rounded-lg border border-border">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium">
        <FileText className="h-4 w-4 text-muted-foreground" />
        What we extracted & matched on
        <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] ${deckRead ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}>
          deck {deckRead ? "read" : `not read${conf != null ? ` (conf ${conf})` : ""}`}
        </span>
        {open ? <ChevronDown className="ml-auto h-4 w-4" /> : <ChevronRight className="ml-auto h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Matched investors on</div>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {matchInputs.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-right font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
          {(p.pitchDeckSummary || extracted?.pitchDeckSummary) && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Summary used</div>
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">{p.pitchDeckSummary || extracted?.pitchDeckSummary}</p>
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Raw extracted fields</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/50 p-3 text-[11px] leading-relaxed">{JSON.stringify(extracted ?? {}, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function CrmTable({ entries, declined }: { entries: Entry[]; declined: boolean }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {declined ? "Declined at the assessment gate — no investors were contacted." : "No investors in this campaign yet."}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Investor</th>
            <th className="px-3 py-2 font-medium">Score</th>
            <th className="px-3 py-2 font-medium">Stage</th>
            <th className="px-3 py-2 font-medium">Signals</th>
            <th className="px-3 py-2 font-medium">Why matched</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-border/50 align-top">
              <td className="py-2.5 pr-3">
                <div className="font-medium">{e.investorName || "—"}</div>
                <div className="text-xs text-muted-foreground">{e.investorEmail}</div>
                {e.sendError && <div className="text-xs text-red-500">send failed: {e.sendError}</div>}
              </td>
              <td className="px-3 py-2.5 tabular-nums">{e.matchScore ?? "—"}</td>
              <td className="px-3 py-2.5"><StageBadge stage={e.stage} /></td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {e.openedAt && <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />opened</span>}
                  {e.interestChoice === "yes" && <span className="inline-flex items-center gap-1 text-emerald-500"><ThumbsUp className="h-3 w-3" />yes</span>}
                  {e.interestChoice === "no" && <span className="inline-flex items-center gap-1 text-muted-foreground"><ThumbsDown className="h-3 w-3" />no</span>}
                  {e.founderNotified && <span className="text-[11px] opacity-70">· founder alerted</span>}
                </div>
              </td>
              <td className="max-w-xs px-3 py-2.5 text-xs text-muted-foreground">{e.rationale || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, string> = {
    queued: "bg-slate-500/15 text-slate-500",
    contacted: "bg-blue-500/15 text-blue-500",
    opened: "bg-violet-500/15 text-violet-500",
    interested: "bg-emerald-500/15 text-emerald-600",
    not_interested: "bg-muted text-muted-foreground",
    meeting: "bg-emerald-600/15 text-emerald-700",
    passed: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[stage] ?? "bg-muted"}`}>{stage.replace(/_/g, " ")}</span>;
}
