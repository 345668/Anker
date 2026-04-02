/**
 * client/src/pages/app/FundraisingHub.tsx
 *
 * The central fundraising page for Anker founders.
 *
 * REPLACES:
 *   /app/fundraising    (FundManagement.tsx)
 *   /app/matching       (Matches.tsx)
 *   /app/matching-logs  (MatchingLogs.tsx)
 *   /app/my-startup     (MyStartups.tsx — profile tab)
 *   /app/deal-rooms     (DealRooms.tsx — deal rooms tab)
 *
 * ROUTE: /app/fundraise
 * Deep-link tabs via ?tab=profile|find|matches|deals
 */

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../hooks/use-auth";
import AppLayout from "@/components/AppLayout";
import { extractTextFromPDF } from "@/lib/pdf-parser";

type Tab = "profile" | "find" | "matches" | "deals";

const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
  { id: "profile",  label: "Profile",         icon: "🏢", desc: "Your fundraising profile" },
  { id: "find",     label: "Find Investors",   icon: "🔍", desc: "Run AI matching" },
  { id: "matches",  label: "My Matches",       icon: "🎯", desc: "Track & manage matches" },
  { id: "deals",    label: "Deal Rooms",       icon: "🤝", desc: "Active deals" },
];

type Algorithm = "accelerated" | "standard" | "niche" | "custom";

const ALGORITHMS: {
  id: Algorithm;
  label: string;
  badge: string;
  desc: string;
  detail: string;
  recommended?: boolean;
}[] = [
  {
    id: "accelerated",
    label: "Accelerated",
    badge: "⚡ Fast",
    desc: "Pre-filtered pool, full 9-factor scoring. Best for complete profiles.",
    detail: "Filters by stage + niche first (up to 500 candidates), then runs the full weighted scoring pipeline. 3–5× faster than standard with negligible accuracy loss when your profile is complete.",
    recommended: true,
  },
  {
    id: "standard",
    label: "Standard",
    badge: "🔍 Thorough",
    desc: "Full database scan across all 500+ investors. No pre-filtering.",
    detail: "Scores every investor in the database using all 9 pipeline stages. Slower but catches edge cases that the accelerated pre-filter might exclude. Use for initial runs or niche profiles.",
  },
  {
    id: "niche",
    label: "Niche Focus",
    badge: "🎬 Domain",
    desc: "Boosts Film, Real Estate, or Sports specialist investors. Activates domain keyword scoring.",
    detail: "Requires nicheIndustry set on your profile. Activates 25–30 domain-specific keywords and surfaces the dedicated niche investor databases (175 family offices, 78 film financiers, 70+ sports investors).",
  },
  {
    id: "custom",
    label: "Custom Weights",
    badge: "⚙️ Advanced",
    desc: "Manually adjust the 6 factor weights before running.",
    detail: "Override the default weights (Industry 28%, Stage 22%, Geography 18%, Check Size 14%, Investor Type 10%, Team Signal 8%). Weights must sum to 100%.",
  },
];

const TIERS = {
  champion: { label: "Champion",     color: "#c8aa82", bg: "rgba(200,170,130,0.12)", border: "rgba(200,170,130,0.4)" },
  A:        { label: "Strong match", color: "#8e84f7", bg: "rgba(142,132,247,0.12)", border: "rgba(142,132,247,0.35)" },
  B:        { label: "Good match",   color: "#5dcaa5", bg: "rgba(93,202,165,0.10)",  border: "rgba(93,202,165,0.3)"  },
  C:        { label: "Potential",    color: "#888780", bg: "rgba(136,135,128,0.08)", border: "rgba(136,135,128,0.2)" },
} as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string }> = {
  pending:   { label: "Pending",    color: "#888780", next: "in_crm"   },
  in_crm:    { label: "In CRM",     color: "#8e84f7", next: "contacted" },
  contacted: { label: "Contacted",  color: "#3b82f6", next: "responded" },
  responded: { label: "Responded",  color: "#f59e0b", next: "won"       },
  passed:    { label: "Passed",     color: "#6b7280"  },
  won:       { label: "Won ✓",      color: "#22c55e"  },
  lost:      { label: "Lost",       color: "#ef4444"  },
};

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, { credentials: "include", ...opts });
}

function useMyStartups() {
  return useQuery<any[]>({
    queryKey: ["/api/startups/mine"],
    queryFn: () => apiFetch("/api/startups/mine").then(r => r.ok ? r.json() : []),
  });
}

function useStartup(startupId?: string | number) {
  return useQuery<any>({
    queryKey: ["/api/startups", startupId],
    queryFn: () => apiFetch(`/api/startups/${startupId}`).then(r => r.ok ? r.json() : null),
    enabled: !!startupId,
  });
}

function readinessScore(startup: any): { score: number; missing: string[] } {
  if (!startup) return { score: 0, missing: ["Complete your profile to get started"] };
  const checks = [
    { field: startup?.name,               label: "Company name",         pts: 10 },
    { field: startup?.industry,           label: "Industry",             pts: 15 },
    { field: startup?.stage,              label: "Funding stage",        pts: 15 },
    { field: startup?.fundingTarget,      label: "Target raise",         pts: 10 },
    { field: startup?.location,           label: "HQ location",          pts: 10 },
    { field: startup?.description,        label: "Company description",  pts: 10 },
    { field: startup?.founderLinkedin,    label: "LinkedIn URL",         pts: 10 },
    { field: startup?.pitchDeckUrl,       label: "Pitch deck",           pts: 15 },
    { field: startup?.targetGeographies?.length, label: "Target geographies", pts: 5 },
  ];
  let score = 0;
  const missing: string[] = [];
  for (const c of checks) {
    if (c.field) score += c.pts;
    else missing.push(c.label);
  }
  return { score, missing };
}

function WeightEditor({ weights, onChange }: {
  weights: Record<string, number>;
  onChange: (w: Record<string, number>) => void;
}) {
  const factors = [
    { key: "industry",     label: "Industry alignment" },
    { key: "stage",        label: "Stage compatibility" },
    { key: "geography",    label: "Geographic fit" },
    { key: "checkSize",    label: "Check size" },
    { key: "investorType", label: "Investor type" },
    { key: "teamSignal",   label: "Team signal" },
  ];
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const valid = Math.abs(total - 100) < 1;

  return (
    <div className="weight-editor">
      {factors.map(f => (
        <div key={f.key} className="weight-editor__row">
          <span className="weight-editor__label">{f.label}</span>
          <input
            type="range" min={0} max={60} step={1}
            value={weights[f.key] ?? 0}
            onChange={e => onChange({ ...weights, [f.key]: Number(e.target.value) })}
            className="weight-editor__slider"
          />
          <span className="weight-editor__val">{weights[f.key] ?? 0}%</span>
        </div>
      ))}
      <div className={`weight-editor__total ${valid ? "ok" : "err"}`}>
        Total: {total}% {valid ? "✓" : `— must equal 100% (${total > 100 ? "reduce" : "increase"} by ${Math.abs(100 - total)}%)`}
      </div>
    </div>
  );
}

function MatchCard({
  match, onStatus, onCRM, onDeal, selected, onSelect,
}: {
  match: any;
  onStatus: (id: string, s: string) => void;
  onCRM: (m: any) => void;
  onDeal: (m: any) => void;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tier = TIERS[match.tier as keyof typeof TIERS] ?? TIERS.C;
  const status = STATUS_CONFIG[match.status] ?? STATUS_CONFIG.pending;

  return (
    <div className={`mc ${selected ? "mc--sel" : ""}`} style={{ borderColor: selected ? "#8e84f7" : undefined }}>
      <div className="mc__row" onClick={() => setOpen(o => !o)}>
        <input
          type="checkbox" checked={selected}
          onChange={() => onSelect(match.id)}
          onClick={e => e.stopPropagation()}
          style={{ accentColor: "#8e84f7", flexShrink: 0 }}
        />
        <div className="mc__tier" style={{ background: tier.bg, borderColor: tier.border, color: tier.color }}>{tier.label}</div>
        <div className="mc__score" style={{ borderColor: tier.color, color: tier.color }}>{match.score}</div>
        <div className="mc__info">
          <p className="mc__firm">{match.firmName ?? match.investorName ?? "—"}</p>
          <p className="mc__meta">{[match.investorName, match.decisionSpeed && `${match.decisionSpeed} decision`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="mc__prob">
          <span className="mc__prob-n">{match.winProbability ?? 0}%</span>
          <span className="mc__prob-l">win</span>
        </div>
        <span className="mc__status" style={{ color: status.color }}>{status.label}</span>
        <div className="mc__acts" onClick={e => e.stopPropagation()}>
          {match.status !== "in_crm" && match.status !== "won" && (
            <button className="mc__btn mc__btn--crm" onClick={() => onCRM(match)}>+ CRM</button>
          )}
          {(match.status === "won" || match.status === "responded") && (
            <button className="mc__btn mc__btn--deal" onClick={() => onDeal(match)}>Open deal</button>
          )}
          {status.next && (
            <button className="mc__btn" onClick={() => onStatus(match.id, status.next!)}>
              → {STATUS_CONFIG[status.next!]?.label}
            </button>
          )}
        </div>
        <span className="mc__chev" style={{ transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="bd"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mc__body"
          >
            <div className="mc__body-inner">
              <div className="mc__factors">
                {[
                  ["Industry", match.factorIndustry],
                  ["Stage",    match.factorStage],
                  ["Geo",      match.factorGeo],
                  ["Check",    match.factorCheckSize],
                  ["Inv type", match.factorInvestorType],
                  ["Team",     match.factorTeamSignal],
                ].map(([label, val]) => (
                  <div key={label as string} className="mc__factor">
                    <span className="mc__factor-l">{label}</span>
                    <div className="mc__factor-bar">
                      <div className="mc__factor-fill" style={{ width: `${Math.round(((val as number) ?? 0) * 100)}%` }} />
                    </div>
                    <span className="mc__factor-v">{Math.round(((val as number) ?? 0) * 100)}</span>
                  </div>
                ))}
              </div>
              <div className="mc__bonuses">
                {[
                  ["Semantic",  match.semanticScore,  20],
                  ["Niche",     match.nicheScore,      15],
                  ["Docs",      match.documentScore,   10],
                  ["Economic",  match.economicScore,   15],
                  ["Behaviour", match.behaviourScore,  10],
                ].map(([l, v, mx]) => (
                  <span key={l as string} className="mc__bonus">
                    {l} +{v ?? 0}/{mx}
                  </span>
                ))}
                <span className="mc__bonus mc__bonus--mult">×{match.feedbackMultiplier ?? 1}</span>
              </div>
              {match.investorEmail && (
                <a href={`mailto:${match.investorEmail}`} className="mc__email">{match.investorEmail}</a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileTab({ onComplete, startup, startupId, onStartupUpdated }: {
  onComplete: () => void;
  startup: any;
  startupId: string | number | undefined;
  onStartupUpdated: () => void;
}) {
  const qc = useQueryClient();
  const [extracting, setExtracting] = useState(false);
  const [saved, setSaved] = useState(false);
  const deckInputRef = useRef<HTMLInputElement>(null);

  const FIELD_KEYS = ["name","website","location","industry","stage","fundingTarget","founderLinkedin","description","targetGeographies","pitchDeckUrl","linkedinUrl"];

  const [formValues, setFormValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of FIELD_KEYS) init[k] = startup?.[k] ?? "";
    return init;
  });

  // Sync formValues when startup data arrives/changes
  useEffect(() => {
    if (!startup) return;
    setFormValues(prev => {
      const next = { ...prev };
      for (const k of FIELD_KEYS) {
        if (!prev[k] && startup[k]) next[k] = startup[k] ?? "";
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startup?.id]);

  const { score, missing } = readinessScore({ ...startup, ...formValues });

  const saveMutation = useMutation({
    mutationFn: (patch: any) =>
      apiFetch(`/api/startups/${startupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/startups", startupId] });
      qc.invalidateQueries({ queryKey: ["/api/startups/mine"] });
      onStartupUpdated();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function handleSave() {
    if (!startupId) return;
    saveMutation.mutate(formValues);
  }

  function handleSaveAndFind() {
    if (!startupId) return;
    saveMutation.mutate(formValues, { onSuccess: () => onComplete() });
  }

  const handlePitchDeckExtract = async (file: File) => {
    setExtracting(true);
    try {
      const text = await extractTextFromPDF(file);
      const res = await apiFetch("/api/pitch-deck/extract-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitchDeckContent: text }),
      });
      if (!res.ok) throw new Error("Extraction failed");
      const { extractedInfo } = await res.json();
      const patch: Record<string, string> = {};
      if (extractedInfo.companyName) patch.name = extractedInfo.companyName;
      if (extractedInfo.description) patch.description = extractedInfo.description;
      if (extractedInfo.stage) patch.stage = extractedInfo.stage;
      if (extractedInfo.targetMarket) patch.targetMarket = extractedInfo.targetMarket;
      if (extractedInfo.industries?.length) patch.industry = extractedInfo.industries.join(", ");
      if (extractedInfo.askAmount) patch.fundingTarget = extractedInfo.askAmount;
      if (extractedInfo.problem) patch.problem = extractedInfo.problem;
      if (extractedInfo.solution) patch.solution = extractedInfo.solution;
      if (Object.keys(patch).length > 0) {
        await saveMutation.mutateAsync(patch);
        setFormValues(v => ({ ...v, ...patch }));
      }
    } catch {
      // silently ignore extraction errors — user can fill manually
    } finally {
      setExtracting(false);
    }
  };

  if (!startup && !startupId) return <div className="loading">Select or create a startup above…</div>;

  const fields = [
    { key: "name",            label: "Company name *",           type: "text",     placeholder: "e.g. NovaSphere",                  full: false },
    { key: "website",         label: "Website",                  type: "url",      placeholder: "https://yourcompany.com",           full: false },
    { key: "location",        label: "HQ location *",            type: "text",     placeholder: "Amsterdam, Netherlands",            full: false },
    { key: "industry",        label: "Industry *",               type: "text",     placeholder: "AI / Machine Learning",             full: false },
    { key: "stage",           label: "Current stage *",          type: "text",     placeholder: "Seed",                             full: false },
    { key: "fundingTarget",   label: "Target raise *",           type: "text",     placeholder: "$1M – $3M",                        full: false },
    { key: "founderLinkedin", label: "Your LinkedIn *",          type: "url",      placeholder: "linkedin.com/in/you",              full: false },
    { key: "targetGeographies", label: "Target geographies",     type: "text",     placeholder: "Europe, MENA, US",                 full: false },
    { key: "description",     label: "One-line description *",   type: "textarea", placeholder: "What your company does in one sentence", full: true },
  ];

  const isDirty = fields.some(f => (formValues[f.key] ?? "") !== (startup?.[f.key] ?? ""));

  return (
    <div className="tab-content">
      {/* Pitch deck quick-extract */}
      <input
        ref={deckInputRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handlePitchDeckExtract(f);
          e.target.value = "";
        }}
      />
      <div
        className="deck-extract-zone"
        onClick={() => deckInputRef.current?.click()}
        data-testid="button-deck-extract"
      >
        <span className="deck-extract-zone__icon">{extracting ? "⏳" : "📄"}</span>
        <div>
          <p className="deck-extract-zone__title">
            {extracting ? "Extracting from pitch deck…" : "Upload pitch deck to auto-fill profile"}
          </p>
          <p className="deck-extract-zone__sub">
            {extracting ? "AI is reading your deck…" : "PDF · Company name, stage, market & more auto-extracted"}
          </p>
        </div>
        {!extracting && <span className="deck-extract-zone__cta">Upload →</span>}
      </div>

      <div className="readiness">
        <div className="readiness__header">
          <div>
            <p className="readiness__label">Match readiness</p>
            <p className="readiness__sub">Complete your profile to improve match quality</p>
          </div>
          <div className="readiness__score" style={{ color: score >= 80 ? "#22c55e" : score >= 50 ? "#c8aa82" : "#ef4444" }}>
            {score}<span style={{ fontSize: 14, opacity: 0.5 }}>/100</span>
          </div>
        </div>
        <div className="readiness__bar">
          <motion.div
            className="readiness__fill"
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ background: score >= 80 ? "#22c55e" : score >= 50 ? "#c8aa82" : "#ef4444" }}
          />
        </div>
        {missing.length > 0 && (
          <div className="readiness__missing">
            <span className="readiness__missing-label">Missing:</span>
            {missing.map(m => <span key={m} className="readiness__chip">{m}</span>)}
          </div>
        )}
      </div>

      <div className="profile-grid">
        {fields.map(f => (
          <div key={f.key} className={`pf ${f.full ? "pf--full" : ""}`}>
            <label className="pf__label">{f.label}</label>
            {f.type === "textarea" ? (
              <textarea
                className="pf__input pf__input--ta"
                value={formValues[f.key] ?? ""}
                placeholder={f.placeholder}
                rows={2}
                onChange={e => setFormValues(v => ({ ...v, [f.key]: e.target.value }))}
              />
            ) : (
              <input
                className="pf__input"
                type={f.type}
                value={formValues[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={e => setFormValues(v => ({ ...v, [f.key]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Save bar ── */}
      <div className="profile-save-bar">
        <button
          className={`profile-save-btn ${saved ? "profile-save-btn--saved" : ""}`}
          onClick={handleSave}
          disabled={saveMutation.isPending || !startupId}
          data-testid="button-save-profile"
        >
          {saveMutation.isPending
            ? "Saving…"
            : saved
            ? "✓ Saved!"
            : isDirty
            ? "Save changes"
            : "Save profile"}
        </button>
        <button
          className="btn-primary"
          onClick={handleSaveAndFind}
          disabled={saveMutation.isPending || !startupId}
          data-testid="button-save-and-find"
        >
          {saveMutation.isPending ? "Saving…" : "Save & Find Investors →"}
        </button>
        {saved && <span className="profile-save-hint">✓ Saved — you can now run matching</span>}
      </div>
    </div>
  );
}

function FindTab({ onMatchesReady, startup }: { onMatchesReady: (sessionId: string) => void; startup: any }) {
  const [algo, setAlgo] = useState<Algorithm>("accelerated");
  const [expanded, setExpanded] = useState<Algorithm | null>(null);
  const [customWeights, setCustomWeights] = useState({
    industry: 28, stage: 22, geography: 18, checkSize: 14, investorType: 10, teamSignal: 8,
  });
  const { score } = readinessScore(startup);

  const runMutation = useMutation({
    mutationFn: async () => {
      const isCustom = algo === "custom";
      const weights = isCustom
        ? Object.fromEntries(Object.entries(customWeights).map(([k, v]) => [k, v / 100]))
        : undefined;
      const res = await apiFetch("/api/matches/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startupId: startup?.id,
          async: false,
          limit: 100,
          mode: algo,
          ...(weights ? { weights } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Match run failed");
      }
      return res.json();
    },
    onSuccess: (data: any) => onMatchesReady(data.sessionId),
  });

  const weightsValid = Object.values(customWeights).reduce((a, b) => a + b, 0) === 100;
  const canRun = score >= 40 && (algo !== "custom" || weightsValid);

  return (
    <div className="tab-content">
      {score < 40 && (
        <div className="alert-banner">
          Profile is too incomplete to run matches. Complete your profile first.
        </div>
      )}

      <p className="section-label">Choose matching algorithm</p>

      <div className="algo-grid">
        {ALGORITHMS.map(a => (
          <div
            key={a.id}
            className={`algo-card ${algo === a.id ? "algo-card--on" : ""}`}
            onClick={() => setAlgo(a.id)}
          >
            <div className="algo-card__top">
              <div className="algo-card__left">
                <div className="algo-card__radio" style={{ borderColor: algo === a.id ? "#8e84f7" : undefined }}>
                  {algo === a.id && <div className="algo-card__radio-dot" />}
                </div>
                <div>
                  <div className="algo-card__name">
                    {a.label}
                    {a.recommended && <span className="algo-card__rec">Recommended</span>}
                  </div>
                  <div className="algo-card__badge">{a.badge}</div>
                </div>
              </div>
              <button
                className="algo-card__detail-btn"
                onClick={e => { e.stopPropagation(); setExpanded(expanded === a.id ? null : a.id); }}
              >
                {expanded === a.id ? "Less" : "Details"}
              </button>
            </div>
            <p className="algo-card__desc">{a.desc}</p>
            <AnimatePresence>
              {expanded === a.id && (
                <motion.p
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="algo-card__detail"
                >
                  {a.detail}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {algo === "custom" && (
        <WeightEditor weights={customWeights} onChange={setCustomWeights} />
      )}

      <motion.button
        whileHover={canRun ? { scale: 1.01 } : {}}
        whileTap={canRun ? { scale: 0.99 } : {}}
        className="btn-primary btn-primary--run"
        disabled={!canRun || runMutation.isPending}
        onClick={() => runMutation.mutate()}
      >
        {runMutation.isPending ? (
          <><span className="spinner" /> Running {algo} matching…</>
        ) : (
          <>Run {ALGORITHMS.find(a => a.id === algo)?.label} match</>
        )}
      </motion.button>

      {runMutation.isError && (
        <p className="error-msg">Match run failed. Check your profile and try again.</p>
      )}
    </div>
  );
}

function exportMatchesToCSV(matches: any[]) {
  const headers = [
    "Firm", "Investor", "Email", "Score", "Tier", "Win Probability", "Status",
    "Factor Industry", "Factor Stage", "Factor Geo", "Factor Check Size", "Factor Investor Type", "Factor Team",
    "Semantic Score", "Niche Score", "Economic Score",
  ];
  const rows = matches.map((m: any) => [
    m.firmName ?? "",
    m.investorName ?? "",
    m.investorEmail ?? "",
    m.score ?? "",
    m.tier ?? "",
    (m.winProbability ?? 0) + "%",
    m.status ?? "",
    Math.round(((m.factorIndustry ?? 0) * 100)),
    Math.round(((m.factorStage ?? 0) * 100)),
    Math.round(((m.factorGeo ?? 0) * 100)),
    Math.round(((m.factorCheckSize ?? 0) * 100)),
    Math.round(((m.factorInvestorType ?? 0) * 100)),
    Math.round(((m.factorTeamSignal ?? 0) * 100)),
    m.semanticScore ?? 0,
    m.nicheScore ?? 0,
    m.economicScore ?? 0,
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `investor_matches_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function MatchesTab({
  highlightSession,
  onOpenDeal,
  startupId,
}: {
  highlightSession?: string;
  onOpenDeal: () => void;
  startupId?: string | number;
}) {
  const qc = useQueryClient();

  const [activeSession, setActiveSession] = useState<string | null>(highlightSession ?? null);
  const [tierFilter, setTierFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: allSessions = [] } = useQuery({
    queryKey: ["/api/match-sessions"],
    queryFn: () => apiFetch("/api/match-sessions").then(r => r.json()),
  });

  const sessions = (allSessions as any[]).filter((s: any) =>
    !startupId || String(s.startupId) === String(startupId)
  );

  const sessionId = activeSession ?? sessions[0]?.id;

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["/api/match-sessions", sessionId],
    queryFn: () => sessionId
      ? apiFetch(`/api/match-sessions/${sessionId}`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (highlightSession) setActiveSession(highlightSession);
  }, [highlightSession]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/matches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/match-sessions", sessionId] }),
  });

  const crmMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/matches/bulk-import-to-crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupId, sessionId, matchIds: ids, addCustomFields: true }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/match-sessions", sessionId] });
      setSelected(new Set());
    },
  });

  const filtered = matches.filter((m: any) => {
    if (tierFilter.length > 0 && !tierFilter.includes(m.tier)) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (m.firmName ?? "").toLowerCase().includes(q) || (m.investorName ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const toggleSelect = (id: string) =>
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((m: any) => m.id)));

  const statusCounts = matches.reduce((acc: any, m: any) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="tab-content">
      {sessions.length === 0 ? (
        <div className="empty-state">No match runs yet. Go to Find Investors to run your first match.</div>
      ) : (
        <>
          <div className="pipeline-bar">
            {["pending", "in_crm", "contacted", "responded", "won"].map((s, i, arr) => (
              <div key={s} className="pipeline-bar__step">
                <div
                  className="pipeline-bar__node"
                  style={{ background: STATUS_CONFIG[s]?.color + "22", borderColor: STATUS_CONFIG[s]?.color, color: STATUS_CONFIG[s]?.color }}
                  onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                >
                  <span className="pipeline-bar__count">{statusCounts[s] ?? 0}</span>
                  <span className="pipeline-bar__label">{STATUS_CONFIG[s]?.label}</span>
                </div>
                {i < arr.length - 1 && <div className="pipeline-bar__arrow">→</div>}
              </div>
            ))}
          </div>

          {sessions.length > 1 && (
            <div className="session-chips">
              {sessions.map((s: any) => {
                const counts = typeof s.tierCounts === "string" ? JSON.parse(s.tierCounts) : (s.tierCounts ?? {});
                return (
                  <button
                    key={s.id}
                    className={`session-chip ${s.id === sessionId ? "session-chip--on" : ""}`}
                    onClick={() => setActiveSession(s.id)}
                  >
                    {s.mode === "accelerated" ? "⚡" : "🔍"}
                    {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    &nbsp;·&nbsp;{s.matchesReturned} matches
                    &nbsp;·&nbsp;<span style={{ color: "#c8aa82" }}>{counts.champion ?? 0} champion</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="filter-row">
            <input className="filter-search" placeholder="Search firms…" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="tier-chips">
              {Object.entries(TIERS).map(([k, v]) => (
                <button
                  key={k}
                  className={`tier-chip ${tierFilter.includes(k) ? "tier-chip--on" : ""}`}
                  style={tierFilter.includes(k) ? { borderColor: v.color, color: v.color } : {}}
                  onClick={() => setTierFilter(p => p.includes(k) ? p.filter(t => t !== k) : [...p, k])}
                >{v.label}</button>
              ))}
            </div>
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
            </select>
            {selected.size > 0 && (
              <button
                className="bulk-btn"
                onClick={() => crmMutation.mutate([...selected])}
                disabled={crmMutation.isPending}
              >
                {crmMutation.isPending ? "Importing…" : `Import ${selected.size} to Folk CRM`}
              </button>
            )}
            <span className="filter-count">{filtered.length} shown</span>
          </div>

          {filtered.length > 0 && (
            <label className="select-all-row">
              <input type="checkbox" checked={selected.size === filtered.length} onChange={toggleAll} style={{ accentColor: "#8e84f7" }} />
              <span>Select all {filtered.length}</span>
            </label>
          )}

          <div className="match-list">
            {isLoading ? (
              <div className="loading">Loading matches…</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">No matches for selected filters.</div>
            ) : (
              filtered.map((m: any) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  onStatus={(id, s) => statusMutation.mutate({ id, status: s })}
                  onCRM={match => crmMutation.mutate([match.id])}
                  onDeal={() => onOpenDeal()}
                  selected={selected.has(m.id)}
                  onSelect={toggleSelect}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DealsTab() {
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["/api/deal-rooms"],
    queryFn: () => apiFetch("/api/deal-rooms").then(r => r.json()),
  });

  if (isLoading) return <div className="loading">Loading deal rooms…</div>;

  if (rooms.length === 0) {
    return (
      <div className="empty-state">
        No active deal rooms yet. When you mark a match as "Responded" or "Won", a deal room will be created here.
      </div>
    );
  }

  return (
    <div className="tab-content">
      <div className="deal-rooms-grid">
        {rooms.map((room: any) => (
          <a key={room.id} href={`/app/deal-rooms/${room.id}`} className="deal-room-card">
            <div className="deal-room-card__header">
              <span className="deal-room-card__icon">🤝</span>
              <div>
                <p className="deal-room-card__name">{room.name}</p>
                <p className="deal-room-card__meta">
                  {room.documentCount ?? 0} docs · {room.milestoneCount ?? 0} milestones
                </p>
              </div>
            </div>
            <div className="deal-room-card__status">{room.status ?? "Active"}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function FundraisingHub() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [highlightSession, setHighlightSession] = useState<string | undefined>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const urlTab = params.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(urlTab ?? "profile");

  const switchTab = (t: Tab, sessionId?: string) => {
    setTab(t);
    if (sessionId) setHighlightSession(sessionId);
    navigate(`/app/fundraise?tab=${t}`, { replace: true });
  };

  // fetch all of the user's startups
  const { data: startups = [] } = useMyStartups();
  const [selectedId, setSelectedId] = useState<string | number | undefined>(undefined);

  // auto-select first startup once loaded
  const effectiveId = selectedId ?? startups[0]?.id;
  const { data: startup } = useStartup(effectiveId);

  const { score } = readinessScore(startup);
  const { data: sessions = [] } = useQuery({
    queryKey: ["/api/matching/startup", effectiveId, "sessions"],
    queryFn: () => apiFetch(`/api/matching/startup/${effectiveId}/sessions`).then(r => r.json()),
    enabled: !!effectiveId,
  });

  const tabLocked: Record<Tab, boolean> = {
    profile:  false,
    find:     !effectiveId,
    matches:  sessions.length === 0,
    deals:    sessions.length === 0,
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/startups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      const created = await res.json();
      await qc.invalidateQueries({ queryKey: ["/api/startups/mine"] });
      setSelectedId(created.id);
      setShowCreateModal(false);
      setNewName("");
    } catch {
      // silently ignore
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppLayout showHero={false}>
    <div className="hub">
      <div className="hub__header">
        <div>
          <h1 className="hub__title">Fundraise</h1>
          <p className="hub__sub">Complete your profile · Find investors · Track progress · Close deals</p>
        </div>
        {score > 0 && effectiveId && (
          <div className="hub__readiness">
            <span className="hub__readiness-label">Profile</span>
            <div className="hub__readiness-bar">
              <div className="hub__readiness-fill" style={{ width: `${score}%`, background: score >= 80 ? "#22c55e" : score >= 50 ? "#c8aa82" : "#ef4444" }} />
            </div>
            <span className="hub__readiness-score" style={{ color: score >= 80 ? "#22c55e" : score >= 50 ? "#c8aa82" : "#ef4444" }}>{score}%</span>
          </div>
        )}
      </div>

      {/* ── Startup switcher ── */}
      <div className="hub__switcher">
        {startups.length === 0 ? (
          <div className="hub__switcher-empty">
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No startups yet.</span>
            <button className="hub__create-btn" onClick={() => setShowCreateModal(true)} data-testid="button-create-startup">
              + Create startup
            </button>
          </div>
        ) : (
          <div className="hub__switcher-row">
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Startup</span>
            <div className="hub__startup-pills">
              {startups.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`hub__startup-pill ${effectiveId === s.id ? "hub__startup-pill--on" : ""}`}
                  data-testid={`button-select-startup-${s.id}`}
                >
                  {s.name ?? `Startup #${s.id}`}
                </button>
              ))}
            </div>
            <button className="hub__create-btn hub__create-btn--sm" onClick={() => setShowCreateModal(true)} data-testid="button-add-startup">
              + Add
            </button>
          </div>
        )}
      </div>

      {/* Create startup modal */}
      {showCreateModal && (
        <div className="hub__modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="hub__modal" onClick={e => e.stopPropagation()}>
            <h3 className="hub__modal-title">Create a startup</h3>
            <p className="hub__modal-sub">Give your startup a name to get started. You can fill in all the details on the Profile tab.</p>
            <input
              className="hub__modal-input"
              placeholder="e.g. NovaSphere"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              autoFocus
              data-testid="input-startup-name"
            />
            <div className="hub__modal-actions">
              <button className="hub__modal-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button
                className="hub__modal-confirm"
                disabled={!newName.trim() || creating}
                onClick={handleCreate}
                data-testid="button-confirm-create-startup"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hub__tabs">
        {TABS.map((t, i) => {
          const locked = tabLocked[t.id];
          const isActive = tab === t.id;
          const isDone =
            (t.id === "profile" && score >= 60) ||
            (t.id === "find" && sessions.length > 0);

          return (
            <button
              key={t.id}
              className={`hub__tab ${isActive ? "hub__tab--on" : ""} ${locked ? "hub__tab--locked" : ""}`}
              onClick={() => !locked && switchTab(t.id)}
              title={locked ? (effectiveId ? "Complete previous steps first" : "Create a startup first") : undefined}
            >
              <span className="hub__tab-step">{i + 1}</span>
              <span className="hub__tab-icon">{isDone ? "✓" : t.icon}</span>
              <span className="hub__tab-label">{t.label}</span>
              {locked && <span className="hub__tab-lock">🔒</span>}
            </button>
          );
        })}
        <div className="hub__tab-progress">
          <div
            className="hub__tab-progress-fill"
            style={{ width: `${(["profile", "find", "matches", "deals"].indexOf(tab) / 3) * 100}%` }}
          />
        </div>
      </div>

      {!effectiveId && (
        <div className="hub__no-startup">
          <p>Create or select a startup above to get started.</p>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>Create your first startup →</button>
        </div>
      )}

      {effectiveId && (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "profile" && (
              <ProfileTab
                onComplete={() => switchTab("find")}
                startup={startup}
                startupId={effectiveId}
                onStartupUpdated={() => qc.invalidateQueries({ queryKey: ["/api/startups", effectiveId] })}
              />
            )}
            {tab === "find" && <FindTab startup={startup} onMatchesReady={(sessionId) => switchTab("matches", sessionId)} />}
            {tab === "matches" && <MatchesTab startupId={effectiveId} highlightSession={highlightSession} onOpenDeal={() => switchTab("deals")} />}
            {tab === "deals" && <DealsTab />}
          </motion.div>
        </AnimatePresence>
      )}

      <style>{hubStyles}</style>
    </div>
    </AppLayout>
  );
}

const hubStyles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Outfit:wght@600;700&display=swap');
*{box-sizing:border-box}

.hub{padding:28px 32px;font-family:'DM Sans',sans-serif;min-height:100vh;color:#fff}
@media(max-width:768px){.hub{padding:16px}}

.hub__header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:16px;flex-wrap:wrap}
.hub__title{font-family:'Outfit',sans-serif;font-size:26px;font-weight:700;margin:0 0 4px;letter-spacing:-.5px}
.hub__sub{font-size:13px;color:rgba(255,255,255,.38);margin:0}
.hub__readiness{display:flex;align-items:center;gap:10px}
.hub__readiness-label{font-size:12px;color:rgba(255,255,255,.4)}
.hub__readiness-bar{width:120px;height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}
.hub__readiness-fill{height:100%;border-radius:3px;transition:width .6s ease}
.hub__readiness-score{font-size:13px;font-weight:600;min-width:30px}

.hub__tabs{display:flex;gap:0;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:6px;margin-bottom:24px;position:relative;overflow:hidden}
.hub__tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:12px 8px;border:none;background:none;cursor:pointer;border-radius:12px;transition:all .2s;position:relative;z-index:1}
.hub__tab--on{background:rgba(142,132,247,.18);border:1px solid rgba(142,132,247,.25)}
.hub__tab--locked{opacity:.4;cursor:not-allowed}
.hub__tab-step{font-size:10px;color:rgba(255,255,255,.28);font-family:'DM Sans',sans-serif}
.hub__tab-icon{font-size:18px;line-height:1}
.hub__tab-label{font-size:12px;font-weight:500;color:rgba(255,255,255,.65);white-space:nowrap}
.hub__tab--on .hub__tab-label{color:#fff}
.hub__tab-lock{font-size:10px;position:absolute;top:6px;right:6px}
.hub__tab-progress{position:absolute;bottom:0;left:6px;right:6px;height:2px;background:rgba(255,255,255,.06);border-radius:1px}
.hub__tab-progress-fill{height:100%;background:linear-gradient(90deg,#8e84f7,#c8aa82);border-radius:1px;transition:width .4s ease}
@media(max-width:560px){.hub__tab-label{display:none}.hub__tab{padding:10px 4px}}

.tab-content{padding:4px 0}
.section-label{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,.35);margin:0 0 14px}
.loading{padding:40px;text-align:center;color:rgba(255,255,255,.3);font-size:14px}
.empty-state{padding:60px 20px;text-align:center;color:rgba(255,255,255,.3);font-size:14px;line-height:1.6;max-width:400px;margin:0 auto}
.error-msg{font-size:13px;color:#f87171;margin-top:12px}
.alert-banner{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:12px 16px;font-size:13px;color:#f87171;margin-bottom:18px}
.tab-cta{display:flex;align-items:center;justify-content:space-between;background:rgba(142,132,247,.08);border:1px solid rgba(142,132,247,.2);border-radius:12px;padding:14px 18px;margin-top:24px}
.tab-cta p{font-size:14px;color:rgba(255,255,255,.7);margin:0}
.btn-primary{padding:10px 22px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 16px rgba(142,132,247,.28);display:flex;align-items:center;gap:8px}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.btn-primary--run{width:100%;justify-content:center;padding:13px;margin-top:20px;font-size:15px}

.readiness{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:18px;margin-bottom:24px}
.readiness__header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.readiness__label{font-size:14px;font-weight:600;color:#fff;margin:0 0 2px}
.readiness__sub{font-size:12px;color:rgba(255,255,255,.38);margin:0}
.readiness__score{font-family:'Outfit',sans-serif;font-size:28px;font-weight:700;text-align:right}
.readiness__bar{height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;margin-bottom:12px}
.readiness__fill{height:100%;border-radius:3px;transition:width .8s ease}
.readiness__missing{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.readiness__missing-label{font-size:12px;color:rgba(255,255,255,.35)}
.readiness__chip{padding:3px 9px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:20px;font-size:11px;color:#f87171}
.profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pf{}.pf--full{grid-column:1/-1}
.pf__label{font-size:12px;font-weight:500;color:rgba(255,255,255,.5);margin:0 0 6px;display:block}
.pf__input{width:100%;padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .18s}
.pf__input::placeholder{color:rgba(255,255,255,.18)}
.pf__input:focus{border-color:rgba(142,132,247,.5);box-shadow:0 0 0 3px rgba(142,132,247,.1)}
.pf__input--ta{resize:none;line-height:1.5}
@media(max-width:560px){.profile-grid{grid-template-columns:1fr}.pf--full{grid-column:1}}

.profile-save-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:20px;padding:16px 18px;background:rgba(142,132,247,.06);border:1px solid rgba(142,132,247,.15);border-radius:12px}
.profile-save-btn{padding:11px 26px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 16px rgba(142,132,247,.25);transition:all .2s;white-space:nowrap}
.profile-save-btn:hover:not(:disabled){box-shadow:0 6px 22px rgba(142,132,247,.4);transform:translateY(-1px)}
.profile-save-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.profile-save-btn--saved{background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 4px 16px rgba(34,197,94,.25)}
.profile-save-hint{font-size:12px;color:#4ade80;display:flex;align-items:center;gap:4px}

.algo-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
@media(max-width:580px){.algo-grid{grid-template-columns:1fr}}
.algo-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px 16px;cursor:pointer;transition:all .18s}
.algo-card--on{background:rgba(142,132,247,.1);border-color:#8e84f7}
.algo-card:hover:not(.algo-card--on){border-color:rgba(255,255,255,.2)}
.algo-card__top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
.algo-card__left{display:flex;gap:10px;align-items:center}
.algo-card__radio{width:16px;height:16px;border-radius:50%;border:1.5px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.algo-card__radio-dot{width:8px;height:8px;border-radius:50%;background:#8e84f7}
.algo-card__name{font-size:14px;font-weight:600;color:#fff;display:flex;align-items:center;gap:8px;margin:0 0 3px}
.algo-card__rec{font-size:10px;padding:2px 7px;background:rgba(200,170,130,.15);border:1px solid rgba(200,170,130,.3);border-radius:20px;color:#c8aa82;font-weight:500}
.algo-card__badge{font-size:11px;color:rgba(255,255,255,.45)}
.algo-card__detail-btn{font-size:11px;color:rgba(255,255,255,.4);background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap;padding:0;flex-shrink:0}
.algo-card__detail-btn:hover{color:rgba(255,255,255,.7)}
.algo-card__desc{font-size:12px;color:rgba(255,255,255,.45);margin:0;line-height:1.5}
.algo-card__detail{font-size:12px;color:rgba(255,255,255,.38);margin:8px 0 0;line-height:1.6;overflow:hidden}

.weight-editor{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:16px;margin-bottom:16px}
.weight-editor__row{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.weight-editor__label{font-size:13px;color:rgba(255,255,255,.55);min-width:130px;flex-shrink:0}
.weight-editor__slider{flex:1;accent-color:#8e84f7}
.weight-editor__val{font-size:13px;font-weight:600;color:#fff;min-width:36px;text-align:right}
.weight-editor__total{font-size:12px;font-weight:500;padding:8px 0 0;border-top:1px solid rgba(255,255,255,.06);margin-top:4px}
.weight-editor__total.ok{color:#22c55e}.weight-editor__total.err{color:#f87171}

.pipeline-bar{display:flex;align-items:center;gap:0;margin-bottom:18px;overflow-x:auto;padding-bottom:4px}
.pipeline-bar__step{display:flex;align-items:center;flex-shrink:0}
.pipeline-bar__node{display:flex;flex-direction:column;align-items:center;padding:8px 14px;border:1px solid;border-radius:10px;cursor:pointer;transition:all .18s;min-width:72px}
.pipeline-bar__node:hover{opacity:.85}
.pipeline-bar__count{font-size:18px;font-weight:700;line-height:1}
.pipeline-bar__label{font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
.pipeline-bar__arrow{color:rgba(255,255,255,.2);font-size:14px;margin:0 4px;flex-shrink:0}

.session-chips{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}
.session-chip{padding:6px 13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:20px;color:rgba(255,255,255,.5);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.session-chip--on{background:rgba(142,132,247,.14);border-color:#8e84f7;color:#c4bef7}

.filter-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.filter-search{padding:8px 13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;min-width:180px}
.filter-search::placeholder{color:rgba(255,255,255,.2)}
.tier-chips{display:flex;gap:5px;flex-wrap:wrap}
.tier-chip{padding:5px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:20px;color:rgba(255,255,255,.4);font-size:11px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.filter-select{padding:7px 11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:rgba(255,255,255,.6);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;outline:none}
.bulk-btn{padding:7px 14px;background:rgba(142,132,247,.16);border:1px solid rgba(142,132,247,.3);border-radius:9px;color:#c4bef7;font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap}
.bulk-btn:disabled{opacity:.5}
.filter-count{font-size:11px;color:rgba(255,255,255,.25);margin-left:auto}
.select-all-row{display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,.4);margin-bottom:10px;cursor:pointer}

.match-list{display:flex;flex-direction:column;gap:7px}
.mc{background:rgba(20,20,26,.92);border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden;transition:border-color .18s}
.mc--sel{border-color:#8e84f7!important}
.mc__row{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;flex-wrap:wrap}
.mc__tier{padding:3px 9px;border:1px solid;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;flex-shrink:0}
.mc__score{width:38px;height:38px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}
.mc__info{flex:1;min-width:130px}
.mc__firm{font-size:13px;font-weight:600;color:#fff;margin:0 0 1px}
.mc__meta{font-size:11px;color:rgba(255,255,255,.38);margin:0}
.mc__prob{text-align:center;flex-shrink:0;min-width:40px}
.mc__prob-n{display:block;font-size:14px;font-weight:700;color:#c8aa82}
.mc__prob-l{font-size:9px;color:rgba(255,255,255,.28)}
.mc__status{font-size:11px;font-weight:500;white-space:nowrap;flex-shrink:0}
.mc__acts{display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap}
.mc__btn{padding:4px 10px;border-radius:7px;font-size:11px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);white-space:nowrap}
.mc__btn--crm{background:rgba(142,132,247,.14);border-color:rgba(142,132,247,.3);color:#c4bef7}
.mc__btn--deal{background:rgba(200,170,130,.12);border-color:rgba(200,170,130,.3);color:#c8aa82}
.mc__chev{font-size:13px;color:rgba(255,255,255,.3);transition:transform .2s;flex-shrink:0}
.mc__body{overflow:hidden}
.mc__body-inner{padding:14px 16px;border-top:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;gap:10px}
.mc__factors{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.mc__factor{display:flex;align-items:center;gap:8px}
.mc__factor-l{font-size:11px;color:rgba(255,255,255,.4);min-width:56px;flex-shrink:0}
.mc__factor-bar{flex:1;height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.mc__factor-fill{height:100%;background:#8e84f7;border-radius:2px;transition:width .4s ease}
.mc__factor-v{font-size:11px;color:rgba(255,255,255,.5);min-width:22px;text-align:right}
.mc__bonuses{display:flex;flex-wrap:wrap;gap:5px}
.mc__bonus{padding:2px 8px;background:rgba(200,170,130,.1);border:1px solid rgba(200,170,130,.15);border-radius:20px;font-size:10px;color:rgba(200,170,130,.8)}
.mc__bonus--mult{background:rgba(93,202,165,.1);border-color:rgba(93,202,165,.2);color:rgba(93,202,165,.9)}
.mc__email{font-size:12px;color:#8e84f7;text-decoration:none}
.mc__email:hover{text-decoration:underline}

.deal-rooms-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:560px){.deal-rooms-grid{grid-template-columns:1fr}}
.deal-room-card{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:16px;text-decoration:none;transition:border-color .18s;gap:12px}
.deal-room-card:hover{border-color:rgba(142,132,247,.35)}
.deal-room-card__header{display:flex;align-items:center;gap:12px}
.deal-room-card__icon{font-size:22px}
.deal-room-card__name{font-size:14px;font-weight:600;color:#fff;margin:0 0 2px}
.deal-room-card__meta{font-size:12px;color:rgba(255,255,255,.38);margin:0}
.deal-room-card__status{font-size:12px;padding:4px 10px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:20px;color:#22c55e}

.spinner{width:15px;height:15px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Startup switcher ── */
.hub__switcher{margin-bottom:20px;padding:12px 16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px}
.hub__switcher-empty{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.hub__switcher-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.hub__startup-pills{display:flex;flex-wrap:wrap;gap:7px;flex:1}
.hub__startup-pill{padding:5px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:rgba(255,255,255,.55);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .16s}
.hub__startup-pill:hover{border-color:rgba(255,255,255,.2);color:#fff}
.hub__startup-pill--on{background:rgba(142,132,247,.18);border-color:rgba(142,132,247,.45);color:#c4b5fd;font-weight:600}
.hub__create-btn{padding:6px 14px;border-radius:8px;border:1px solid rgba(142,132,247,.35);background:rgba(142,132,247,.1);color:#c4b5fd;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .16s;white-space:nowrap}
.hub__create-btn:hover{background:rgba(142,132,247,.2)}
.hub__create-btn--sm{font-size:12px;padding:4px 11px}

/* ── No-startup state ── */
.hub__no-startup{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 24px;text-align:center;gap:16px}
.hub__no-startup p{color:rgba(255,255,255,.45);font-size:14px;margin:0}

/* ── Create modal ── */
.hub__modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
.hub__modal{background:#1a1a2e;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:28px 32px;width:100%;max-width:420px;display:flex;flex-direction:column;gap:14px}
.hub__modal-title{font-family:'Outfit',sans-serif;font-size:20px;font-weight:700;color:#fff;margin:0}
.hub__modal-sub{font-size:13px;color:rgba(255,255,255,.4);margin:0;line-height:1.6}
.hub__modal-input{padding:11px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .18s}
.hub__modal-input:focus{border-color:rgba(142,132,247,.5);box-shadow:0 0 0 3px rgba(142,132,247,.1)}
.hub__modal-input::placeholder{color:rgba(255,255,255,.2)}
.hub__modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:4px}
.hub__modal-cancel{padding:8px 18px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:none;color:rgba(255,255,255,.5);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .16s}
.hub__modal-cancel:hover{border-color:rgba(255,255,255,.2);color:#fff}
.hub__modal-confirm{padding:8px 20px;border-radius:9px;border:none;background:#8e84f7;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .16s}
.hub__modal-confirm:hover:not(:disabled){background:#7c73e6}
.hub__modal-confirm:disabled{opacity:.45;cursor:not-allowed}
`;
