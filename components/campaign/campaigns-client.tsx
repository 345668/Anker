"use client";

/**
 * Founder campaign control room. Lists every submission with its assessment
 * result + progressive-send progress bar + funnel, and drills into the
 * per-campaign exclusive investor CRM. Reads /api/campaign and /api/campaign/[id].
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, ChevronDown, ChevronRight, Pause, Play, CheckCircle2,
  Mail, Eye, ThumbsUp, ThumbsDown, AlertTriangle, RefreshCw,
} from "lucide-react";

interface Counts { total: number; contacted: number; opened: number; interested: number; notInterested: number }
interface Campaign {
  id: string; publicRef: string; startupName: string; founderName: string; founderEmail: string;
  status: string; assessmentScore: number | null; stage: string | null; sectors: string[];
  campaignId: string | null; counts: Counts; createdAt: string | null;
}
interface Entry {
  id: string; investorName: string | null; investorEmail: string | null; matchScore: number | null;
  rationale: string | null; stage: string; contactedAt: string | null; openedAt: string | null;
  interestChoice: string | null; founderNotified: boolean; sendError: string | null;
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

function CampaignRow({ c, expanded, onToggle, onAction }: {
  c: Campaign; expanded: boolean; onToggle: () => void; onAction: () => void;
}) {
  const pct = c.counts.total ? Math.round((c.counts.contacted / c.counts.total) * 100) : 0;
  const isActive = c.status === "outreaching" || c.status === "campaign_ready";

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

        {/* Funnel chips */}
        <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <Chip icon={<Mail className="h-3.5 w-3.5" />} n={c.counts.contacted} label="sent" />
          <Chip icon={<Eye className="h-3.5 w-3.5" />} n={c.counts.opened} label="opened" />
          <Chip icon={<ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />} n={c.counts.interested} label="interested" />
        </div>

        {/* Progress */}
        <div className="hidden w-36 shrink-0 md:block">
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{c.counts.contacted}/{c.counts.total}</span><span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {isActive && (
              <ActionButton id={c.id} action="pause" onDone={onAction} icon={<Pause className="h-3.5 w-3.5" />} label="Pause sends" />
            )}
            <ActionButton id={c.id} action="resume" onDone={onAction} icon={<Play className="h-3.5 w-3.5" />} label="Resume" />
            {c.status !== "completed" && c.status !== "declined" && (
              <ActionButton id={c.id} action="complete" onDone={onAction} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Force complete" />
            )}
          </div>
          <CampaignCrm submissionId={c.id} />
        </div>
      )}
    </div>
  );
}

function Chip({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return <span className="inline-flex items-center gap-1">{icon}{n} <span className="opacity-70">{label}</span></span>;
}

function ActionButton({ id, action, label, icon, onDone }: {
  id: string; action: string; label: string; icon: React.ReactNode; onDone: () => void;
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
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon} {label}
    </button>
  );
}

function CampaignCrm({ submissionId }: { submissionId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [declineReason, setDeclineReason] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/campaign/${submissionId}`);
      const json = await res.json();
      if (!alive) return;
      setEntries(json?.entries ?? []);
      setDeclineReason(json?.campaign?.declineReason ?? null);
    })();
    return () => { alive = false; };
  }, [submissionId]);

  if (entries === null) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading CRM…</div>;
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {declineReason ? <><AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-500" />Declined: {declineReason}</> : "No investors in this campaign yet."}
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
