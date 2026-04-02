/**
 * client/src/pages/app/MatchingPage.tsx
 *
 * Full matching UI: run matches, browse results, view score breakdowns,
 * manage statuses, import to Folk CRM.
 *
 * Replaces / extends the existing Matching.tsx page.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import type { MatchResult, MatchSession, MatchStatus } from "../../../server/services/matchmaking";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  champion: { label: "Champion",       color: "#c8aa82", bg: "rgba(200,170,130,0.12)", border: "rgba(200,170,130,0.4)" },
  A:        { label: "Strong match",   color: "#8e84f7", bg: "rgba(142,132,247,0.12)", border: "rgba(142,132,247,0.4)" },
  B:        { label: "Good match",     color: "#5dcaa5", bg: "rgba(93,202,165,0.10)",  border: "rgba(93,202,165,0.35)" },
  C:        { label: "Potential",      color: "#888780", bg: "rgba(136,135,128,0.08)", border: "rgba(136,135,128,0.25)" },
} as const;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: "Pending",    color: "#888780" },
  in_crm:    { label: "In CRM",     color: "#8e84f7" },
  contacted: { label: "Contacted",  color: "#3b82f6" },
  responded: { label: "Responded",  color: "#f59e0b" },
  passed:    { label: "Passed",     color: "#ef4444" },
  won:       { label: "Won",        color: "#22c55e" },
  lost:      { label: "Lost",       color: "#6b7280" },
};

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="score-bar">
      <div className="score-bar__track">
        <motion.div
          className="score-bar__fill"
          initial={{ width: 0 }}
          animate={{ width: `${(value / max) * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ background: color }}
        />
      </div>
      <span className="score-bar__val">{value}</span>
    </div>
  );
}

// ─── Factor breakdown ─────────────────────────────────────────────────────────

function FactorBreakdown({ match }: { match: any }) {
  const factors = [
    { label: "Industry",      value: Math.round((match.factorIndustry ?? 0) * 100),      weight: "28%" },
    { label: "Stage",         value: Math.round((match.factorStage ?? 0) * 100),          weight: "22%" },
    { label: "Geography",     value: Math.round((match.factorGeo ?? 0) * 100),            weight: "18%" },
    { label: "Check size",    value: Math.round((match.factorCheckSize ?? 0) * 100),      weight: "14%" },
    { label: "Investor type", value: Math.round((match.factorInvestorType ?? 0) * 100),  weight: "10%" },
    { label: "Team signal",   value: Math.round((match.factorTeamSignal ?? 0) * 100),    weight: "8%"  },
  ];
  const bonuses = [
    { label: "Semantic",    value: match.semanticScore  ?? 0, max: 20 },
    { label: "Niche",       value: match.nicheScore     ?? 0, max: 15 },
    { label: "Documents",   value: match.documentScore  ?? 0, max: 10 },
    { label: "Economic fit",value: match.economicScore  ?? 0, max: 15 },
    { label: "Behaviour",   value: match.behaviourScore ?? 0, max: 10 },
  ];
  return (
    <div className="factor-breakdown">
      <div className="factor-breakdown__section">
        <p className="factor-breakdown__title">Weighted factors</p>
        {factors.map(f => (
          <div key={f.label} className="factor-row">
            <span className="factor-row__label">{f.label}</span>
            <span className="factor-row__weight">{f.weight}</span>
            <div className="factor-row__bar">
              <div className="factor-row__fill" style={{ width: `${f.value}%`, background: "#8e84f7" }} />
            </div>
            <span className="factor-row__val">{f.value}</span>
          </div>
        ))}
      </div>
      <div className="factor-breakdown__section">
        <p className="factor-breakdown__title">Bonus scores</p>
        {bonuses.map(b => (
          <div key={b.label} className="factor-row">
            <span className="factor-row__label">{b.label}</span>
            <span className="factor-row__weight">+{b.max}</span>
            <div className="factor-row__bar">
              <div className="factor-row__fill" style={{ width: `${(b.value / b.max) * 100}%`, background: "#c8aa82" }} />
            </div>
            <span className="factor-row__val">+{b.value}</span>
          </div>
        ))}
        <div className="factor-row factor-row--multiplier">
          <span className="factor-row__label">Feedback ×</span>
          <span className="factor-row__weight" />
          <div className="factor-row__bar" />
          <span className="factor-row__val">{match.feedbackMultiplier ?? "1.0"}×</span>
        </div>
      </div>
    </div>
  );
}

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({
  match,
  onStatusChange,
  onAddToCRM,
  isSelected,
  onSelect,
}: {
  match: any;
  onStatusChange: (id: string, status: MatchStatus) => void;
  onAddToCRM: (match: any) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tier = TIER_CONFIG[match.tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.C;
  const status = STATUS_LABELS[match.status] ?? STATUS_LABELS.pending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`match-card ${isSelected ? "match-card--selected" : ""}`}
      style={{ borderColor: isSelected ? "#8e84f7" : undefined }}
    >
      <div className="match-card__header" onClick={() => setExpanded(!expanded)}>
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(match.id)}
          onClick={e => e.stopPropagation()}
          className="match-card__check"
          style={{ accentColor: "#8e84f7" }}
        />

        {/* Tier badge */}
        <div className="match-card__tier" style={{ background: tier.bg, border: `1px solid ${tier.border}`, color: tier.color }}>
          {tier.label}
        </div>

        {/* Score circle */}
        <div className="match-card__score-circle" style={{ borderColor: tier.color, color: tier.color }}>
          {match.score}
        </div>

        {/* Investor info */}
        <div className="match-card__info">
          <p className="match-card__name">{match.firmName ?? match.investorName ?? "Unknown firm"}</p>
          <p className="match-card__meta">
            {[match.investorName, match.decisionSpeed ? `${match.decisionSpeed} decision` : null]
              .filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* Win probability */}
        <div className="match-card__winprob">
          <span className="match-card__winprob-val">{match.winProbability ?? 0}%</span>
          <span className="match-card__winprob-label">win prob.</span>
        </div>

        {/* Status */}
        <div className="match-card__status" style={{ color: status.color }}>
          {status.label}
        </div>

        {/* Actions */}
        <div className="match-card__actions" onClick={e => e.stopPropagation()}>
          <button
            className="match-card__btn"
            onClick={() => onAddToCRM(match)}
            title="Add to Folk CRM"
            disabled={match.status === "in_crm"}
          >
            {match.status === "in_crm" ? "✓ In CRM" : "+ CRM"}
          </button>
          <select
            className="match-card__select"
            value={match.status}
            onChange={e => onStatusChange(match.id, e.target.value as MatchStatus)}
          >
            {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        <span className="match-card__chevron" style={{ transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
      </div>

      {/* Expanded breakdown */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="match-card__body"
          >
            <div className="match-card__body-inner">
              <FactorBreakdown match={match} />
              {match.valueAdd?.length > 0 && (
                <div className="match-card__value-add">
                  <p className="match-card__section-title">Value add</p>
                  <div className="match-card__pills">
                    {(typeof match.valueAdd === "string"
                      ? JSON.parse(match.valueAdd)
                      : match.valueAdd
                    ).map((v: string) => (
                      <span key={v} className="match-pill">{v}</span>
                    ))}
                  </div>
                </div>
              )}
              {match.investorEmail && (
                <a href={`mailto:${match.investorEmail}`} className="match-card__email">
                  {match.investorEmail}
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Session summary bar ──────────────────────────────────────────────────────

function SessionSummary({ session, onNewRun }: { session: any; onNewRun: () => void }) {
  const counts = typeof session.tierCounts === "string"
    ? JSON.parse(session.tierCounts)
    : (session.tierCounts ?? {});
  return (
    <div className="session-bar">
      <div className="session-bar__meta">
        <span className="session-bar__mode">{session.mode === "accelerated" ? "⚡ Accelerated" : "🔍 Standard"}</span>
        <span className="session-bar__date">{new Date(session.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        <span className="session-bar__stats">{session.matchesReturned} matches from {session.totalCandidates} candidates · {session.durationMs}ms</span>
      </div>
      <div className="session-bar__tiers">
        {Object.entries(TIER_CONFIG).map(([key, cfg]) => (
          <span key={key} className="session-bar__tier" style={{ color: cfg.color }}>
            {counts[key] ?? 0} {cfg.label}
          </span>
        ))}
      </div>
      <button className="session-bar__rerun" onClick={onNewRun}>Re-run matches</button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MatchingPage() {
  const qc = useQueryClient();
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [crmImporting, setCrmImporting] = useState(false);
  const [runMode, setRunMode] = useState<"standard" | "accelerated">("accelerated");
  const [search, setSearch] = useState("");

  // Fetch startup id from auth context (simplified)
  const startupId = "current"; // replace with useAuth().user?.startupId

  // ── Sessions list ──────────────────────────────────────────────────────────
  const { data: sessions = [] } = useQuery({
    queryKey: ["/api/matching/startup", startupId, "sessions"],
    queryFn: () => fetch(`/api/matching/startup/${startupId}/sessions`, { credentials: "include" }).then(r => r.json()),
  });

  // ── Matches for active session ─────────────────────────────────────────────
  const sessionId = activeSession ?? sessions[0]?.id;
  const { data: matches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ["/api/matching/session", sessionId],
    queryFn: () => sessionId
      ? fetch(`/api/matching/session/${sessionId}`, { credentials: "include" }).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!sessionId,
  });

  // ── Run matching ───────────────────────────────────────────────────────────
  const runMutation = useMutation({
    mutationFn: async () => {
      const endpoint = runMode === "accelerated"
        ? "/api/matching/accelerated"
        : `/api/matching/startup/${startupId}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ startupId }),
      });
      if (!res.ok) throw new Error("Match run failed");
      return res.json();
    },
    onSuccess: ({ session }) => {
      qc.invalidateQueries({ queryKey: ["/api/matching/startup", startupId, "sessions"] });
      setActiveSession(session.id);
    },
  });

  // ── Status update ──────────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MatchStatus }) => {
      await fetch(`/api/matching/match/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/matching/session", sessionId] });
    },
  });

  // ── CRM import ─────────────────────────────────────────────────────────────
  const crmMutation = useMutation({
    mutationFn: async (ids?: string[]) => {
      const res = await fetch("/api/matching/crm-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          startupId,
          sessionId,
          addCustomFields: true,
          ...(ids ? { matchIds: ids } : {}),
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/matching/session", sessionId] });
      setSelectedIds(new Set());
    },
  });

  // ── Filter matches ─────────────────────────────────────────────────────────
  const filtered = matches.filter((m: any) => {
    if (tierFilter.length > 0 && !tierFilter.includes(m.tier)) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!m.firmName?.toLowerCase().includes(q) && !m.investorName?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((m: any) => m.id)));
  };

  const currentSession = sessions.find((s: any) => s.id === sessionId);

  return (
    <div className="matching-page">
      {/* Header */}
      <div className="matching-header">
        <div>
          <h1 className="matching-title">Investor Matching</h1>
          <p className="matching-sub">AI-powered matching across 500+ investors</p>
        </div>
        <div className="matching-header__actions">
          <div className="mode-toggle">
            <button
              className={`mode-btn ${runMode === "accelerated" ? "mode-btn--on" : ""}`}
              onClick={() => setRunMode("accelerated")}
            >⚡ Accelerated</button>
            <button
              className={`mode-btn ${runMode === "standard" ? "mode-btn--on" : ""}`}
              onClick={() => setRunMode("standard")}
            >🔍 Standard</button>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="run-btn"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending
              ? <><span className="spinner" /> Running…</>
              : "Run matches"}
          </motion.button>
        </div>
      </div>

      {/* Sessions list */}
      {sessions.length > 1 && (
        <div className="sessions-list">
          {sessions.map((s: any) => (
            <button
              key={s.id}
              className={`session-chip ${s.id === sessionId ? "session-chip--on" : ""}`}
              onClick={() => setActiveSession(s.id)}
            >
              {s.mode === "accelerated" ? "⚡" : "🔍"} {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {s.matchesReturned}
            </button>
          ))}
        </div>
      )}

      {/* Current session summary */}
      {currentSession && (
        <SessionSummary session={currentSession} onNewRun={() => runMutation.mutate()} />
      )}

      {/* Filters + bulk actions */}
      <div className="match-controls">
        <input
          className="match-search"
          placeholder="Search firms or investors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="tier-filters">
          {Object.entries(TIER_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              className={`tier-filter ${tierFilter.includes(key) ? "tier-filter--on" : ""}`}
              style={tierFilter.includes(key) ? { borderColor: cfg.color, color: cfg.color } : {}}
              onClick={() => setTierFilter(prev =>
                prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]
              )}
            >
              {cfg.label}
            </button>
          ))}
        </div>
        <select
          className="status-filter"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        {selectedIds.size > 0 && (
          <button
            className="bulk-crm-btn"
            onClick={() => crmMutation.mutate([...selectedIds])}
            disabled={crmMutation.isPending}
          >
            {crmMutation.isPending ? "Importing…" : `Import ${selectedIds.size} to Folk CRM`}
          </button>
        )}
        <span className="match-count">{filtered.length} matches</span>
      </div>

      {/* Select all */}
      {filtered.length > 0 && (
        <div className="select-all">
          <label>
            <input
              type="checkbox"
              checked={selectedIds.size === filtered.length}
              onChange={toggleAll}
              style={{ accentColor: "#8e84f7" }}
            />
            <span>Select all {filtered.length}</span>
          </label>
        </div>
      )}

      {/* Match list */}
      {loadingMatches ? (
        <div className="loading-state">
          <span className="spinner" /> Loading matches…
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {sessions.length === 0
            ? "No matches yet. Run your first match above."
            : "No matches for selected filters."}
        </div>
      ) : (
        <div className="match-list">
          {filtered.map((match: any) => (
            <MatchCard
              key={match.id}
              match={match}
              onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
              onAddToCRM={(m) => crmMutation.mutate([m.id])}
              isSelected={selectedIds.has(match.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      <style>{pageStyles}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pageStyles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Outfit:wght@600;700&display=swap');
*{box-sizing:border-box}
.matching-page{padding:28px 32px;font-family:'DM Sans',sans-serif;background:rgb(11,11,15);min-height:100vh;color:#fff}
@media(max-width:768px){.matching-page{padding:16px}}

.matching-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;gap:16px;flex-wrap:wrap}
.matching-title{font-family:'Outfit',sans-serif;font-size:26px;font-weight:700;margin:0 0 4px;letter-spacing:-.5px}
.matching-sub{font-size:14px;color:rgba(255,255,255,.4);margin:0}
.matching-header__actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}

.mode-toggle{display:flex;background:rgba(255,255,255,.06);border-radius:10px;padding:3px;gap:2px}
.mode-btn{padding:7px 14px;border:none;background:none;color:rgba(255,255,255,.45);font-size:13px;font-weight:500;cursor:pointer;border-radius:8px;transition:all .18s;font-family:'DM Sans',sans-serif}
.mode-btn--on{background:rgba(142,132,247,.18);color:#fff;border:1px solid rgba(142,132,247,.3)}
.run-btn{padding:10px 22px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 16px rgba(142,132,247,.28);display:flex;align-items:center;gap:8px}
.run-btn:disabled{opacity:.55}

.sessions-list{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.session-chip{padding:6px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;color:rgba(255,255,255,.55);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.session-chip--on{background:rgba(142,132,247,.15);border-color:#8e84f7;color:#c4bef7}

.session-bar{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.session-bar__meta{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.session-bar__mode{font-size:13px;font-weight:600;color:#fff}
.session-bar__date,.session-bar__stats{font-size:12px;color:rgba(255,255,255,.35)}
.session-bar__tiers{display:flex;gap:14px;margin-left:auto}
.session-bar__tier{font-size:12px;font-weight:500}
.session-bar__rerun{padding:7px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:rgba(255,255,255,.6);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif}

.match-controls{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.match-search{padding:9px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;min-width:200px}
.match-search::placeholder{color:rgba(255,255,255,.2)}
.match-search:focus{border-color:rgba(142,132,247,.5)}
.tier-filters{display:flex;gap:6px;flex-wrap:wrap}
.tier-filter{padding:6px 13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:20px;color:rgba(255,255,255,.45);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.status-filter{padding:8px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:rgba(255,255,255,.65);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;outline:none}
.bulk-crm-btn{padding:8px 16px;background:rgba(142,132,247,.18);border:1px solid rgba(142,132,247,.35);border-radius:9px;color:#c4bef7;font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif}
.match-count{font-size:12px;color:rgba(255,255,255,.3);margin-left:auto}

.select-all{margin-bottom:10px;font-size:13px;color:rgba(255,255,255,.45);display:flex;align-items:center;gap:8px}
.select-all label{display:flex;align-items:center;gap:8px;cursor:pointer}

.match-list{display:flex;flex-direction:column;gap:8px}
.match-card{background:rgba(20,20,26,.92);border:1px solid rgba(255,255,255,.09);border-radius:14px;overflow:hidden;transition:border-color .18s}
.match-card--selected{border-color:#8e84f7!important}
.match-card__header{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;flex-wrap:wrap}
.match-card__check{flex-shrink:0;width:15px;height:15px;cursor:pointer}
.match-card__tier{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}
.match-card__score-circle{width:40px;height:40px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}
.match-card__info{flex:1;min-width:140px}
.match-card__name{font-size:14px;font-weight:600;color:#fff;margin:0 0 2px}
.match-card__meta{font-size:12px;color:rgba(255,255,255,.4);margin:0}
.match-card__winprob{text-align:center;flex-shrink:0}
.match-card__winprob-val{display:block;font-size:15px;font-weight:700;color:#c8aa82}
.match-card__winprob-label{font-size:10px;color:rgba(255,255,255,.3)}
.match-card__status{font-size:12px;font-weight:500;white-space:nowrap;flex-shrink:0}
.match-card__actions{display:flex;gap:7px;align-items:center;flex-shrink:0}
.match-card__btn{padding:5px 12px;background:rgba(142,132,247,.15);border:1px solid rgba(142,132,247,.3);border-radius:7px;color:#c4bef7;font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap}
.match-card__btn:disabled{opacity:.5;cursor:default}
.match-card__select{padding:5px 10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:7px;color:rgba(255,255,255,.6);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;outline:none}
.match-card__chevron{font-size:14px;color:rgba(255,255,255,.3);transition:transform .2s;flex-shrink:0}
.match-card__body{overflow:hidden}
.match-card__body-inner{padding:16px 18px;border-top:1px solid rgba(255,255,255,.06)}
.match-card__value-add{margin-top:14px}
.match-card__section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:rgba(255,255,255,.35);margin:0 0 8px}
.match-card__pills{display:flex;flex-wrap:wrap;gap:6px}
.match-pill{padding:4px 10px;background:rgba(200,170,130,.1);border:1px solid rgba(200,170,130,.2);border-radius:20px;font-size:11px;color:rgba(200,170,130,.9)}
.match-card__email{font-size:13px;color:#8e84f7;margin-top:12px;display:block;text-decoration:none}
.match-card__email:hover{text-decoration:underline}

.factor-breakdown{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:600px){.factor-breakdown{grid-template-columns:1fr}}
.factor-breakdown__section{}
.factor-breakdown__title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:rgba(255,255,255,.3);margin:0 0 10px}
.factor-row{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.factor-row__label{font-size:12px;color:rgba(255,255,255,.55);min-width:100px;flex-shrink:0}
.factor-row__weight{font-size:11px;color:rgba(255,255,255,.25);min-width:28px;text-align:right;flex-shrink:0}
.factor-row__bar{flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.factor-row__fill{height:100%;border-radius:2px;transition:width .5s ease}
.factor-row__val{font-size:12px;color:rgba(255,255,255,.7);min-width:26px;text-align:right;flex-shrink:0}
.factor-row--multiplier .factor-row__val{color:#c8aa82;font-weight:600}

.score-bar{display:flex;align-items:center;gap:8px}
.score-bar__track{flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.score-bar__fill{height:100%;border-radius:2px}
.score-bar__val{font-size:12px;color:rgba(255,255,255,.6);min-width:22px;text-align:right}

.loading-state,.empty-state{padding:60px;text-align:center;color:rgba(255,255,255,.3);font-size:14px;display:flex;align-items:center;justify-content:center;gap:10px}

.spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
`;
