/**
 * client/src/pages/app/DealFlowPage.tsx
 *
 * Dual-mode deal flow pipeline:
 *   MODE A — STARTUP: founders tracking VC/PE/Angel outreach
 *   MODE B — FUND: fund managers tracking LP commitments
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "@/components/AppLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

type PipelineMode = "startup" | "fund";

interface Prospect {
  id: string;
  name: string;
  logo?: string;
  website?: string;
  email?: string;
  stage: string;
  assignedTo?: string;
  probability: number;
  lpType?: string;
  commitmentSize?: string;
  geography?: string;
  dealSource?: string;
  investmentDomicile?: string;
  archetypes?: string[];
  tags?: string[];
  linkedPeople?: string[];
  notes?: string;
  starRating?: number;
  firmType?: string;
  checkSize?: string;
  leadPartner?: string;
  hasDealMemo?: boolean;
  dealMemoStatus?: "draft" | "complete" | "shared";
  createdAt: string;
  lastActivity?: string;
}

// ─── Stage definitions ────────────────────────────────────────────────────────

const FUND_STAGES = [
  { id: "prospect",    label: "Prospect",      color: "#888780", bg: "rgba(136,135,128,0.08)" },
  { id: "qualified",   label: "Qualified",     color: "#3b82f6", bg: "rgba(59,130,246,0.08)"  },
  { id: "pitched",     label: "Pitched",       color: "#8e84f7", bg: "rgba(142,132,247,0.08)" },
  { id: "diligence",   label: "Due Diligence", color: "#f59e0b", bg: "rgba(245,158,11,0.08)"  },
  { id: "soft_circle", label: "Soft Circle",   color: "#c8aa82", bg: "rgba(200,170,130,0.08)" },
  { id: "hard_circle", label: "Hard Circle",   color: "#5dcaa5", bg: "rgba(93,202,165,0.08)"  },
  { id: "closed",      label: "Closed ✓",     color: "#22c55e", bg: "rgba(34,197,94,0.08)"   },
  { id: "declined",    label: "Declined",      color: "#ef4444", bg: "rgba(239,68,68,0.08)"   },
];

const STARTUP_STAGES = [
  { id: "identified",     label: "Identified",   color: "#888780", bg: "rgba(136,135,128,0.08)" },
  { id: "contacted",      label: "Contacted",    color: "#3b82f6", bg: "rgba(59,130,246,0.08)"  },
  { id: "engaged",        label: "Engaged",      color: "#8e84f7", bg: "rgba(142,132,247,0.08)" },
  { id: "screen",         label: "Screening",    color: "#f59e0b", bg: "rgba(245,158,11,0.08)"  },
  { id: "diligence",      label: "Diligence",    color: "#c8aa82", bg: "rgba(200,170,130,0.08)" },
  { id: "term_sheet",     label: "Term Sheet",   color: "#5dcaa5", bg: "rgba(93,202,165,0.08)"  },
  { id: "closed_startup", label: "Closed ✓",    color: "#22c55e", bg: "rgba(34,197,94,0.08)"   },
  { id: "passed",         label: "Passed",       color: "#ef4444", bg: "rgba(239,68,68,0.08)"   },
];

const LP_ARCHETYPES = [
  "Family Office", "Endowment", "Foundation", "Pension Fund",
  "Sovereign Wealth Fund", "Fund of Funds", "Insurance Company",
  "Bank / Financial Institution", "Corporate LP", "Angel / HNWI",
  "Government Fund", "Development Finance", "University Endowment",
];

const LP_TYPES = [
  "Institutional LP", "Family Office", "HNWI",
  "Corporate LP", "Government / Sovereign", "Fund of Funds",
];

const DEAL_SOURCES = [
  "Warm intro", "Conference", "Cold outreach", "Placement agent",
  "Existing LP referral", "Anker match", "LinkedIn", "Event",
];

const COMMITMENT_SIZES = [
  "< $250K", "$250K – $500K", "$500K – $1M",
  "$1M – $5M", "$5M – $25M", "$25M – $100M", "$100M+",
];

const INVESTOR_TYPES_STARTUP = [
  "VC Fund", "Micro VC", "Family Office", "Angel",
  "Corporate VC", "PE Growth", "Venture Studio", "Syndicate",
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, { credentials: "include", ...opts });
}

function currencyFormat(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="df-stars">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i}
          className={`df-star ${i <= (hover || value) ? "df-star--on" : ""}`}
          onMouseEnter={() => onChange && setHover(i)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange?.(i)}
          style={{ cursor: onChange ? "pointer" : "default" }}>★</span>
      ))}
    </div>
  );
}

// ─── Metrics Bar ──────────────────────────────────────────────────────────────

function MetricsBar({ prospects, mode }: { prospects: Prospect[]; mode: PipelineMode }) {
  const total = prospects.length;
  const active = prospects.filter(p => p.stage !== "declined" && p.stage !== "passed").length;
  const closed = prospects.filter(p => p.stage === "closed" || p.stage === "closed_startup").length;
  const totalCommitment = mode === "fund"
    ? prospects.filter(p => p.stage === "closed").reduce((sum, p) => {
        const mid: Record<string, number> = {
          "< $250K": 125_000, "$250K – $500K": 375_000, "$500K – $1M": 750_000,
          "$1M – $5M": 3_000_000, "$5M – $25M": 15_000_000,
          "$25M – $100M": 62_500_000, "$100M+": 100_000_000,
        };
        return sum + (mid[p.commitmentSize ?? ""] ?? 0);
      }, 0)
    : 0;
  const softCircle = mode === "fund"
    ? prospects.filter(p => ["soft_circle", "hard_circle"].includes(p.stage)).length : 0;

  const metrics = mode === "fund"
    ? [
        { label: "Prospects",    value: total.toString(),                color: "#888780" },
        { label: "Active",       value: active.toString(),               color: "#8e84f7" },
        { label: "Soft / Hard",  value: softCircle.toString(),           color: "#c8aa82" },
        { label: "Closed LPs",   value: closed.toString(),               color: "#22c55e" },
        { label: "Total raised", value: currencyFormat(totalCommitment), color: "#22c55e" },
      ]
    : [
        { label: "Tracked",      value: total.toString(),   color: "#888780" },
        { label: "Active",       value: active.toString(),  color: "#8e84f7" },
        { label: "Diligence",    value: prospects.filter(p => p.stage === "diligence").length.toString(), color: "#f59e0b" },
        { label: "Term Sheets",  value: prospects.filter(p => p.stage === "term_sheet").length.toString(), color: "#5dcaa5" },
        { label: "Closed",       value: closed.toString(),  color: "#22c55e" },
      ];

  return (
    <div className="df-metrics">
      {metrics.map(m => (
        <div key={m.label} className="df-metrics__item">
          <span className="df-metrics__val" style={{ color: m.color }}>{m.value}</span>
          <span className="df-metrics__label">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Prospect Card ────────────────────────────────────────────────────────────

function ProspectCard({ prospect, mode, stageColor, onMove, onOpenMemo, onClick }: {
  prospect: Prospect; mode: PipelineMode; stageColor: string;
  onMove: (id: string, stage: string) => void;
  onOpenMemo: (p: Prospect) => void;
  onClick: (p: Prospect) => void;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="df-card" onClick={() => onClick(prospect)}>
      <div className="df-card__header">
        {prospect.logo
          ? <img src={prospect.logo} alt="" className="df-card__logo" />
          : <div className="df-card__logo-fb">{prospect.name.slice(0, 2).toUpperCase()}</div>
        }
        <div className="df-card__info">
          <p className="df-card__name">{prospect.name}</p>
          {prospect.email
            ? <p className="df-card__email">{prospect.email}</p>
            : <p className="df-card__email df-card__email--missing">No email</p>}
        </div>
        <div className="df-card__prob" style={{ color: prospect.probability >= 60 ? "#22c55e" : prospect.probability >= 30 ? "#f59e0b" : "#888780" }}>
          {prospect.probability}%
        </div>
      </div>
      <div className="df-card__details">
        {mode === "fund" && prospect.lpType && <span className="df-tag">{prospect.lpType}</span>}
        {mode === "fund" && prospect.commitmentSize && <span className="df-tag df-tag--gold">{prospect.commitmentSize}</span>}
        {mode === "startup" && prospect.firmType && <span className="df-tag">{prospect.firmType}</span>}
        {mode === "startup" && prospect.checkSize && <span className="df-tag df-tag--gold">{prospect.checkSize}</span>}
        {prospect.geography && <span className="df-tag df-tag--geo">📍 {prospect.geography}</span>}
      </div>
      {prospect.tags && prospect.tags.length > 0 && (
        <div className="df-card__tags">
          {prospect.tags.slice(0, 3).map(t => <span key={t} className="df-chip">{t}</span>)}
        </div>
      )}
      <div className="df-card__footer">
        <StarRating value={prospect.starRating ?? 0} />
        {prospect.hasDealMemo
          ? <button className="df-memo-btn df-memo-btn--exists" onClick={e => { e.stopPropagation(); onOpenMemo(prospect); }}>
              📄 Memo {prospect.dealMemoStatus === "shared" ? "· Shared" : ""}
            </button>
          : <button className="df-memo-btn" onClick={e => { e.stopPropagation(); onOpenMemo(prospect); }}>+ Memo</button>
        }
      </div>
    </motion.div>
  );
}

// ─── Stage Column ─────────────────────────────────────────────────────────────

function StageColumn({ stage, prospects, mode, onMove, onOpenMemo, onCardClick }: {
  stage: { id: string; label: string; color: string; bg: string };
  prospects: Prospect[]; mode: PipelineMode;
  onMove: (id: string, stage: string) => void;
  onOpenMemo: (p: Prospect) => void;
  onCardClick: (p: Prospect) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const totalCommitment = mode === "fund"
    ? prospects.reduce((sum, p) => {
        const mid: Record<string, number> = {
          "< $250K": 125_000, "$250K – $500K": 375_000, "$500K – $1M": 750_000,
          "$1M – $5M": 3_000_000, "$5M – $25M": 15_000_000,
        };
        return sum + (mid[p.commitmentSize ?? ""] ?? 0);
      }, 0)
    : 0;

  return (
    <div className={`df-col ${collapsed ? "df-col--collapsed" : ""}`}
      style={{ borderTopColor: stage.color }}>
      <div className="df-col__hdr" onClick={() => setCollapsed(!collapsed)} style={{ background: stage.bg }}>
        <span className="df-col__chevron">{collapsed ? "▶" : "▼"}</span>
        <span className="df-col__label" style={{ color: stage.color }}>{stage.label}</span>
        <span className="df-col__count">{prospects.length}</span>
        {mode === "fund" && totalCommitment > 0 && (
          <span className="df-col__amount">{currencyFormat(totalCommitment)}</span>
        )}
      </div>
      {!collapsed && (
        <div className="df-col__cards">
          <AnimatePresence>
            {prospects.map(p => (
              <ProspectCard key={p.id} prospect={p} mode={mode} stageColor={stage.color}
                onMove={onMove} onOpenMemo={onOpenMemo} onClick={onCardClick} />
            ))}
          </AnimatePresence>
          {prospects.length === 0 && <div className="df-col__empty">Empty</div>}
        </div>
      )}
    </div>
  );
}

// ─── Add Prospect Modal ───────────────────────────────────────────────────────

function AddProspectModal({ mode, stages, onClose, onAdd }: {
  mode: PipelineMode; stages: { id: string; label: string }[];
  onClose: () => void; onAdd: (data: Partial<Prospect>) => void;
}) {
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [form, setForm] = useState<Partial<Prospect>>({ stage: stages[0]?.id, probability: 10 });
  const [activeSection, setActiveSection] = useState("org");
  const upd = (patch: Partial<Prospect>) => setForm(f => ({ ...f, ...patch }));

  const handleAiFill = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await apiFetch("/api/dealflow/ai/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText, mode }),
      });
      const data = await res.json();
      if (data.result) upd(data.result);
    } catch (e) {
      console.error("AI fill failed", e);
    } finally {
      setAiLoading(false);
    }
  };

  const sections = [
    { id: "org",      icon: "🏢", label: "Organisation" },
    { id: "lp",       icon: mode === "fund" ? "👤" : "💼", label: mode === "fund" ? "LP Details" : "Investor Details" },
    { id: "pipeline", icon: "📊", label: "Pipeline" },
    { id: "people",   icon: "🔗", label: "People & Notes" },
  ];

  return (
    <div className="df-modal-overlay" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.22 }}
        className="df-modal" onClick={e => e.stopPropagation()}>
        <div className="df-modal__hdr">
          <h2 className="df-modal__title">Add {mode === "fund" ? "LP Prospect" : "Investor"} to Pipeline</h2>
          <button className="df-modal__close" onClick={onClose}>×</button>
        </div>

        {/* AI Form Assistant */}
        <div className="df-ai">
          <div className="df-ai__hdr"><span style={{ color: "#8e84f7" }}>✦</span><span className="df-ai__label">AI Form Assistant</span></div>
          <p className="df-ai__desc">Paste any text about the {mode === "fund" ? "LP" : "investor"} — email, website copy, LinkedIn bio — and AI will fill the form.</p>
          <textarea className="df-ai__ta" rows={3}
            placeholder={`e.g. "${mode === "fund" ? "Hamilton Lane is a global private markets firm with $920B+ in assets..." : "Sequoia Capital focuses on tech companies seed through growth, check size $1M–$100M..."}"`}
            value={aiText} onChange={e => setAiText(e.target.value)} />
          <button className="df-ai__btn" onClick={handleAiFill} disabled={!aiText.trim() || aiLoading}>
            {aiLoading ? <><span className="df-spinner" /> Analysing…</> : "✦ Auto-fill form fields"}
          </button>
        </div>

        <div className="df-modal__sections">
          {sections.map(s => (
            <button key={s.id} className={`df-modal__sec-tab ${activeSection === s.id ? "df-modal__sec-tab--on" : ""}`}
              onClick={() => setActiveSection(s.id)}>
              <span>{s.icon}</span> {s.label}
            </button>
          ))}
        </div>

        <div className="df-modal__body">
          <AnimatePresence mode="wait">
            {activeSection === "org" && (
              <motion.div key="org" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <MF label="Name *"><input className="df-inp" placeholder="Organisation name" value={form.name ?? ""} onChange={e => upd({ name: e.target.value })} /></MF>
                <MF label="Logo">
                  <div className="df-logo-up" onClick={() => document.getElementById("df-logo-file")?.click()}>
                    {form.logo ? <img src={form.logo} alt="" className="df-logo-up__img" /> : <div className="df-logo-up__ph"><span>↑</span> Upload logo</div>}
                    <input id="df-logo-file" type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => upd({ logo: ev.target?.result as string }); r.readAsDataURL(f); } }} />
                  </div>
                </MF>
                <MF label="Website"><input className="df-inp" type="url" placeholder="https://" value={form.website ?? ""} onChange={e => upd({ website: e.target.value })} /></MF>
                <MF label="Email"><input className="df-inp" type="email" placeholder="contact@firm.com" value={form.email ?? ""} onChange={e => upd({ email: e.target.value })} /></MF>
                <MF label="Notes"><textarea className="df-inp df-inp--ta" rows={2} value={form.notes ?? ""} onChange={e => upd({ notes: e.target.value })} /></MF>
                <MF label="Tags"><input className="df-inp" placeholder="ESG Focus, European LP… (comma separated)" value={(form.tags ?? []).join(", ")} onChange={e => upd({ tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} /></MF>
              </motion.div>
            )}

            {activeSection === "lp" && (
              <motion.div key="lp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {mode === "fund" ? (
                  <>
                    <MF label="LP type"><select className="df-inp df-inp--sel" value={form.lpType ?? ""} onChange={e => upd({ lpType: e.target.value })}><option value="">Select LP type…</option>{LP_TYPES.map(t => <option key={t}>{t}</option>)}</select></MF>
                    <MF label="Target commitment"><select className="df-inp df-inp--sel" value={form.commitmentSize ?? ""} onChange={e => upd({ commitmentSize: e.target.value })}><option value="">Select range…</option>{COMMITMENT_SIZES.map(s => <option key={s}>{s}</option>)}</select></MF>
                    <MF label="LP archetype"><select className="df-inp df-inp--sel" value={form.archetypes?.[0] ?? ""} onChange={e => upd({ archetypes: [e.target.value] })}><option value="">Select archetype…</option>{LP_ARCHETYPES.map(a => <option key={a}>{a}</option>)}</select></MF>
                    <MF label="Investment domicile"><input className="df-inp" placeholder="e.g. Cayman Islands, Delaware" value={form.investmentDomicile ?? ""} onChange={e => upd({ investmentDomicile: e.target.value })} /></MF>
                    <MF label="Geography / HQ"><input className="df-inp" placeholder="e.g. New York, USA" value={form.geography ?? ""} onChange={e => upd({ geography: e.target.value })} /></MF>
                    <MF label="Deal source"><select className="df-inp df-inp--sel" value={form.dealSource ?? ""} onChange={e => upd({ dealSource: e.target.value })}><option value="">Select source…</option>{DEAL_SOURCES.map(s => <option key={s}>{s}</option>)}</select></MF>
                  </>
                ) : (
                  <>
                    <MF label="Investor / firm type"><select className="df-inp df-inp--sel" value={form.firmType ?? ""} onChange={e => upd({ firmType: e.target.value })}><option value="">Select type…</option>{INVESTOR_TYPES_STARTUP.map(t => <option key={t}>{t}</option>)}</select></MF>
                    <MF label="Typical check size"><select className="df-inp df-inp--sel" value={form.checkSize ?? ""} onChange={e => upd({ checkSize: e.target.value })}><option value="">Select range…</option>{COMMITMENT_SIZES.map(s => <option key={s}>{s}</option>)}</select></MF>
                    <MF label="Lead partner"><input className="df-inp" placeholder="Partner name" value={form.leadPartner ?? ""} onChange={e => upd({ leadPartner: e.target.value })} /></MF>
                    <MF label="Geography"><input className="df-inp" placeholder="e.g. USA, Europe, Global" value={form.geography ?? ""} onChange={e => upd({ geography: e.target.value })} /></MF>
                    <MF label="Deal source"><select className="df-inp df-inp--sel" value={form.dealSource ?? ""} onChange={e => upd({ dealSource: e.target.value })}><option value="">Select source…</option>{DEAL_SOURCES.map(s => <option key={s}>{s}</option>)}</select></MF>
                    <MF label="Referred by"><input className="df-inp" placeholder="Name of referrer" value={form.assignedTo ?? ""} onChange={e => upd({ assignedTo: e.target.value })} /></MF>
                  </>
                )}
              </motion.div>
            )}

            {activeSection === "pipeline" && (
              <motion.div key="pipeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <MF label="Initial stage">
                  <select className="df-inp df-inp--sel" value={form.stage ?? ""} onChange={e => upd({ stage: e.target.value })}>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </MF>
                <MF label={mode === "fund" ? "Commitment probability %" : "Close probability %"}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <input type="range" min={0} max={100} step={5} value={form.probability ?? 0}
                      onChange={e => upd({ probability: Number(e.target.value) })}
                      style={{ flex: 1, accentColor: "#8e84f7" }} />
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#8e84f7", minWidth: 40 }}>{form.probability ?? 0}%</span>
                  </div>
                </MF>
                <MF label="Assigned to"><input className="df-inp" placeholder="Team member name" value={form.assignedTo ?? ""} onChange={e => upd({ assignedTo: e.target.value })} /></MF>
                <MF label="Conviction rating"><div style={{ paddingTop: 4 }}><StarRating value={form.starRating ?? 0} onChange={v => upd({ starRating: v })} /></div></MF>
              </motion.div>
            )}

            {activeSection === "people" && (
              <motion.div key="people" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <MF label="Linked people"><input className="df-inp" placeholder="Key contacts (comma separated)" value={(form.linkedPeople ?? []).join(", ")} onChange={e => upd({ linkedPeople: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} /></MF>
                <MF label="Notes"><textarea className="df-inp df-inp--ta" rows={4} placeholder="Notes, context, next steps…" value={form.notes ?? ""} onChange={e => upd({ notes: e.target.value })} /></MF>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="df-modal__footer">
          <button className="df-modal__cancel" onClick={onClose}>Cancel</button>
          <button className="df-modal__submit" onClick={() => { if (form.name) { onAdd(form); onClose(); } }} disabled={!form.name}>
            Add {mode === "fund" ? "LP Prospect" : "Investor"} →
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function MF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="df-mf">
      <label className="df-mf__label">{label}</label>
      {children}
    </div>
  );
}

// ─── Deal Memo Panel ──────────────────────────────────────────────────────────

function DealMemoPanel({ prospect, mode, onClose }: { prospect: Prospect | null; mode: PipelineMode; onClose: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [memoContent, setMemoContent] = useState("");
  const [memoType, setMemoType] = useState<string>(mode === "fund" ? "lp_memo" : "investment_thesis");

  const MEMO_TYPES = mode === "fund"
    ? [{ id: "lp_memo", label: "LP Memo" }, { id: "ic_memo", label: "IC Memo" }, { id: "pass_memo", label: "Pass Memo" }]
    : [{ id: "investment_thesis", label: "Investment Thesis" }, { id: "ic_memo", label: "IC Memo" }, { id: "pass_memo", label: "Pass Memo" }];

  const handleGenerate = async () => {
    if (!prospect) return;
    setGenerating(true);
    try {
      const res = await apiFetch("/api/dealflow/ai/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect, memoType, mode }),
      });
      const data = await res.json();
      setMemoContent(data.content ?? "");
    } finally {
      setGenerating(false);
    }
  };

  if (!prospect) return null;
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
      className="df-memo">
      <div className="df-memo__hdr">
        <div>
          <p className="df-memo__title">Deal Memo — {prospect.name}</p>
          <div className="df-memo__types">
            {MEMO_TYPES.map(t => (
              <button key={t.id} className={`df-memo-type ${memoType === t.id ? "df-memo-type--on" : ""}`}
                onClick={() => setMemoType(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
        <button className="df-memo__close" onClick={onClose}>×</button>
      </div>

      <div className="df-memo__body">
        {memoContent ? (
          <div className="df-memo__content">
            <div className="df-memo__md"
              dangerouslySetInnerHTML={{ __html: memoContent.replace(/\n/g, "<br>").replace(/#{1,3} (.+)/g, "<strong>$1</strong>") }} />
            <div className="df-memo__acts">
              <button className="df-act-btn" onClick={() => navigator.clipboard.writeText(memoContent)}>Copy</button>
              <button className="df-act-btn df-act-btn--primary">Share with {prospect.name}</button>
            </div>
          </div>
        ) : (
          <div className="df-memo__empty">
            <p>Generate an AI-powered {memoType.replace(/_/g, " ")} for {prospect.name}.</p>
            <p style={{ fontSize: 12, opacity: .6, marginTop: 6 }}>Uses prospect data, notes, and stage to produce a professional memo in seconds.</p>
          </div>
        )}
      </div>

      <button className="df-memo__gen" onClick={handleGenerate} disabled={generating}>
        {generating ? <><span className="df-spinner" /> Generating…</> : `✦ Generate ${memoType.replace(/_/g, " ")}`}
      </button>
    </motion.div>
  );
}

// ─── Outreach Tab ─────────────────────────────────────────────────────────────

function OutreachTab({ prospects, mode }: { prospects: Prospect[]; mode: PipelineMode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState("intro");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState("");

  const TEMPLATES = mode === "fund"
    ? [{ id: "intro", label: "Fund introduction" }, { id: "follow_up", label: "Follow-up after meeting" },
       { id: "commitment", label: "Commitment ask" }, { id: "update", label: "Fund performance update" }, { id: "close", label: "Final close reminder" }]
    : [{ id: "intro", label: "Investor introduction" }, { id: "follow_up", label: "Follow-up" },
       { id: "deck_share", label: "Send pitch deck" }, { id: "dd_response", label: "Respond to DD questions" }];

  const qualify = prospects.filter(p => !["declined", "passed", "closed", "closed_startup"].includes(p.stage));
  const toggleSel = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleGenerate = async () => {
    const names = [...selected].map(id => prospects.find(p => p.id === id)?.name ?? "").join(", ");
    setGenerating(true);
    try {
      const res = await apiFetch("/api/dealflow/ai/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: names, template, mode }),
      });
      const data = await res.json();
      setPreview(data.content ?? "");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="df-outreach">
      <div className="df-outreach__split">
        <div className="df-outreach__left">
          <p className="df-section-label">Select {mode === "fund" ? "LPs" : "investors"} to reach out to</p>
          <div className="df-outreach-list">
            {qualify.map(p => (
              <label key={p.id} className={`df-outreach-item ${selected.has(p.id) ? "df-outreach-item--on" : ""}`}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)} style={{ accentColor: "#8e84f7" }} />
                <div>
                  <p className="df-outreach-item__name">{p.name}</p>
                  <p className="df-outreach-item__meta">{p.lpType ?? p.firmType ?? "—"} · {p.stage}</p>
                </div>
                {p.email && <span style={{ color: "rgba(93,202,165,.8)", flexShrink: 0 }}>✉</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="df-outreach__right">
          <p className="df-section-label">Outreach template</p>
          <div className="df-template-chips">
            {TEMPLATES.map(t => (
              <button key={t.id} className={`df-template-chip ${template === t.id ? "df-template-chip--on" : ""}`}
                onClick={() => setTemplate(t.id)}>{t.label}</button>
            ))}
          </div>
          <button className="df-gen-btn" onClick={handleGenerate} disabled={selected.size === 0 || generating}>
            {generating ? <><span className="df-spinner" /> Writing…</> : `✦ Draft email for ${selected.size || 0} ${mode === "fund" ? "LP" : "investor"}${selected.size !== 1 ? "s" : ""}`}
          </button>
          {preview && (
            <div className="df-preview">
              <div className="df-preview__content">{preview}</div>
              <div className="df-preview__acts">
                <button className="df-act-btn" onClick={() => navigator.clipboard.writeText(preview)}>Copy</button>
                <button className="df-act-btn df-act-btn--primary">Open in mail</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DealFlowPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<PipelineMode>("startup");
  const [activeTab, setActiveTab] = useState<"pipeline" | "memos" | "outreach">("pipeline");
  const [showAddModal, setShowAddModal] = useState(false);
  const [memoProspect, setMemoProspect] = useState<Prospect | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStage, setFilterStage] = useState("all");

  const stages = mode === "fund" ? FUND_STAGES : STARTUP_STAGES;

  const { data: prospects = [], isLoading } = useQuery<Prospect[]>({
    queryKey: ["/api/dealflow/prospects", mode],
    queryFn: () => apiFetch(`/api/dealflow/prospects?mode=${mode}`).then(r => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (data: Partial<Prospect>) =>
      apiFetch("/api/dealflow/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, mode }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/dealflow/prospects", mode] }),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      apiFetch(`/api/dealflow/prospects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/dealflow/prospects", mode] }),
  });

  const filtered = prospects.filter(p => {
    if (filterStage !== "all" && p.stage !== filterStage) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const byStage = (stageId: string) => filtered.filter(p => p.stage === stageId);

  return (
    <AppLayout showHero={false}>
      <div className="df-page">
        {/* Header */}
        <div className="df-header">
          <div className="df-title-row">
            <h1 className="df-title">{mode === "fund" ? "LP Fundraising Pipeline" : "Investor Pipeline"}</h1>
            <div className="df-mode-toggle">
              <button className={`df-mode-btn ${mode === "startup" ? "df-mode-btn--on" : ""}`} onClick={() => setMode("startup")}>🚀 Startup</button>
              <button className={`df-mode-btn ${mode === "fund" ? "df-mode-btn--on" : ""}`} onClick={() => setMode("fund")}>💼 Fund LP</button>
            </div>
          </div>

          <MetricsBar prospects={prospects} mode={mode} />

          <div className="df-actions">
            <div className="df-tab-row">
              {(["pipeline", "memos", "outreach"] as const).map(t => (
                <button key={t} className={`df-tab ${activeTab === t ? "df-tab--on" : ""}`}
                  onClick={() => setActiveTab(t)}>
                  {t === "pipeline" ? "📊 Pipeline" : t === "memos" ? "📄 Deal Memos" : "✉ Outreach"}
                </button>
              ))}
            </div>
            <div className="df-right-actions">
              <input className="df-search" placeholder="Search by name…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <select className="df-filter" value={filterStage} onChange={e => setFilterStage(e.target.value)}>
                <option value="all">All stages</option>
                {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <button className="df-add-btn" onClick={() => setShowAddModal(true)}>+ Add {mode === "fund" ? "LP" : "Investor"}</button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="df-body">
          {isLoading && <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,.35)", fontSize: 14 }}>Loading pipeline…</div>}

          {!isLoading && activeTab === "pipeline" && (
            <div className="df-kanban">
              {stages.map(stage => (
                <StageColumn key={stage.id} stage={stage} prospects={byStage(stage.id)}
                  mode={mode} onMove={(id, s) => moveMutation.mutate({ id, stage: s })}
                  onOpenMemo={setMemoProspect} onCardClick={p => setMemoProspect(p)} />
              ))}
            </div>
          )}

          {!isLoading && activeTab === "memos" && (
            <div className="df-memos-tab">
              <p className="df-section-label" style={{ marginBottom: 16 }}>All deal memos — click any card to generate or view its memo</p>
              <div className="df-memos-grid">
                {prospects.map(p => (
                  <div key={p.id} className={`df-memo-card ${p.hasDealMemo ? "df-memo-card--exists" : ""}`} onClick={() => setMemoProspect(p)}>
                    <div className="df-memo-card__hdr">
                      <p className="df-memo-card__name">{p.name}</p>
                      <span className="df-memo-card__stage" style={{ color: stages.find(s => s.id === p.stage)?.color ?? "#888" }}>
                        {stages.find(s => s.id === p.stage)?.label}
                      </span>
                    </div>
                    {p.hasDealMemo
                      ? <div style={{ fontSize: 12, color: "#8e84f7", marginTop: 8 }}>📄 {p.dealMemoStatus === "shared" ? "Shared" : p.dealMemoStatus === "complete" ? "Complete" : "Draft"}</div>
                      : <div style={{ fontSize: 12, color: "rgba(255,255,255,.3)", marginTop: 8 }}>+ Generate memo</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isLoading && activeTab === "outreach" && <OutreachTab prospects={prospects} mode={mode} />}

          {/* Memo side panel */}
          <AnimatePresence>
            {memoProspect && (
              <DealMemoPanel prospect={memoProspect} mode={mode} onClose={() => setMemoProspect(null)} />
            )}
          </AnimatePresence>
        </div>

        {/* Add modal */}
        <AnimatePresence>
          {showAddModal && (
            <AddProspectModal mode={mode} stages={stages} onClose={() => setShowAddModal(false)}
              onAdd={data => addMutation.mutate(data)} />
          )}
        </AnimatePresence>
      </div>

      <style>{CSS}</style>
    </AppLayout>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Outfit:wght@600;700&display=swap');
*{box-sizing:border-box}

.df-page{display:flex;flex-direction:column;height:calc(100vh - 64px);overflow:hidden;font-family:'DM Sans',sans-serif;color:#fff}

/* Header */
.df-header{padding:20px 24px 0;flex-shrink:0}
.df-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:16px;flex-wrap:wrap}
.df-title{font-family:'Outfit',sans-serif;font-size:22px;font-weight:700;margin:0;letter-spacing:-.4px}
.df-mode-toggle{display:flex;background:rgba(255,255,255,.06);border-radius:10px;padding:3px;gap:2px}
.df-mode-btn{padding:7px 16px;border:none;background:none;color:rgba(255,255,255,.45);font-size:13px;font-weight:500;cursor:pointer;border-radius:8px;transition:all .18s;font-family:'DM Sans',sans-serif}
.df-mode-btn--on{background:rgba(142,132,247,.18);color:#fff;border:1px solid rgba(142,132,247,.3)}

/* Metrics */
.df-metrics{display:flex;gap:0;margin-bottom:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden}
.df-metrics__item{flex:1;padding:12px 16px;border-right:1px solid rgba(255,255,255,.06);text-align:center}
.df-metrics__item:last-child{border-right:none}
.df-metrics__val{display:block;font-family:'Outfit',sans-serif;font-size:20px;font-weight:700;line-height:1}
.df-metrics__label{font-size:11px;color:rgba(255,255,255,.35);display:block;margin-top:3px;text-transform:uppercase;letter-spacing:.4px}

/* Actions */
.df-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.df-tab-row{display:flex;gap:4px}
.df-tab{padding:8px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:9px;color:rgba(255,255,255,.5);font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.df-tab--on{background:rgba(142,132,247,.14);border-color:rgba(142,132,247,.3);color:#c4bef7}
.df-right-actions{display:flex;gap:8px;align-items:center}
.df-search{padding:8px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:8px;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;min-width:180px}
.df-search::placeholder{color:rgba(255,255,255,.2)}
.df-filter{padding:8px 11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:8px;color:rgba(255,255,255,.65);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;outline:none}
.df-add-btn{padding:8px 18px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 12px rgba(142,132,247,.25);white-space:nowrap}

/* Body */
.df-body{flex:1;overflow:hidden;display:flex;gap:0;position:relative;padding:0 24px 24px}

/* Kanban */
.df-kanban{display:flex;gap:10px;overflow-x:auto;flex:1;padding-bottom:8px}
.df-kanban::-webkit-scrollbar{height:4px}
.df-kanban::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
.df-col{min-width:220px;max-width:240px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-top:3px solid;border-radius:12px;display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.df-col--collapsed{min-width:44px;max-width:44px}
.df-col__hdr{display:flex;align-items:center;gap:6px;padding:10px 12px;cursor:pointer;user-select:none;min-height:40px}
.df-col--collapsed .df-col__hdr{flex-direction:column;padding:10px 6px}
.df-col__chevron{font-size:10px;color:rgba(255,255,255,.3);flex-shrink:0}
.df-col__label{font-size:12px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.df-col--collapsed .df-col__label{writing-mode:vertical-rl;text-orientation:mixed;transform:rotate(180deg);max-height:120px}
.df-col__count{font-size:11px;background:rgba(255,255,255,.1);border-radius:10px;padding:1px 7px;flex-shrink:0}
.df-col__amount{font-size:10px;color:rgba(255,255,255,.35);flex-shrink:0}
.df-col__cards{padding:8px;display:flex;flex-direction:column;gap:7px;overflow-y:auto;flex:1}
.df-col__empty{height:48px;border:1.5px dashed rgba(255,255,255,.08);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;color:rgba(255,255,255,.2)}

/* Cards */
.df-card{background:rgba(24,24,32,.95);border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:12px;cursor:pointer;transition:border-color .18s}
.df-card:hover{border-color:rgba(142,132,247,.35)}
.df-card__header{display:flex;gap:9px;align-items:center;margin-bottom:8px}
.df-card__logo{width:32px;height:32px;border-radius:6px;object-fit:cover;flex-shrink:0}
.df-card__logo-fb{width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,#8e84f7,#c8aa82);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
.df-card__info{flex:1;min-width:0}
.df-card__name{font-size:13px;font-weight:600;color:#fff;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.df-card__email{font-size:11px;color:rgba(255,255,255,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.df-card__email--missing{color:rgba(239,68,68,.5);font-style:italic}
.df-card__prob{font-size:13px;font-weight:700;flex-shrink:0}
.df-card__details{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.df-tag{padding:2px 7px;background:rgba(255,255,255,.07);border-radius:10px;font-size:10px;color:rgba(255,255,255,.55)}
.df-tag--gold{background:rgba(200,170,130,.12);color:#c8aa82}
.df-tag--geo{background:rgba(93,202,165,.1);color:rgba(93,202,165,.9)}
.df-card__tags{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px}
.df-chip{padding:2px 7px;background:rgba(142,132,247,.1);border:1px solid rgba(142,132,247,.2);border-radius:10px;font-size:10px;color:rgba(142,132,247,.9)}
.df-card__footer{display:flex;align-items:center;justify-content:space-between}
.df-stars{display:flex;gap:1px}
.df-star{font-size:13px;color:rgba(255,255,255,.15);transition:color .1s}
.df-star--on{color:#c8aa82}
.df-memo-btn{padding:3px 9px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;font-size:10px;color:rgba(255,255,255,.45);cursor:pointer;font-family:'DM Sans',sans-serif}
.df-memo-btn--exists{background:rgba(142,132,247,.1);border-color:rgba(142,132,247,.25);color:#c4bef7}

/* Modal */
.df-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:flex-end;z-index:1000;backdrop-filter:blur(4px)}
.df-modal{background:rgb(16,16,22);border-left:1px solid rgba(255,255,255,.1);width:520px;max-width:100%;height:100vh;overflow-y:auto;display:flex;flex-direction:column}
.df-modal__hdr{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
.df-modal__title{font-family:'Outfit',sans-serif;font-size:17px;font-weight:700;color:#fff;margin:0}
.df-modal__close{background:none;border:none;color:rgba(255,255,255,.4);font-size:22px;cursor:pointer;line-height:1;padding:0}
.df-modal__sections{display:flex;gap:4px;padding:12px 24px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;flex-wrap:wrap}
.df-modal__sec-tab{padding:7px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:rgba(255,255,255,.45);font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s;display:flex;align-items:center;gap:6px}
.df-modal__sec-tab--on{background:rgba(142,132,247,.14);border-color:rgba(142,132,247,.3);color:#c4bef7}
.df-modal__body{flex:1;padding:20px 24px;overflow-y:auto}
.df-modal__footer{padding:16px 24px;border-top:1px solid rgba(255,255,255,.07);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.df-modal__cancel{padding:10px 18px;background:none;border:1px solid rgba(255,255,255,.12);border-radius:9px;color:rgba(255,255,255,.5);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif}
.df-modal__submit{padding:10px 22px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
.df-modal__submit:disabled{opacity:.5;cursor:not-allowed}

/* AI assistant */
.df-ai{margin:16px 24px;background:linear-gradient(135deg,rgba(142,132,247,.08),rgba(200,170,130,.06));border:1px solid rgba(142,132,247,.2);border-radius:12px;padding:16px}
.df-ai__hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.df-ai__label{font-size:14px;font-weight:600;color:#c4bef7}
.df-ai__desc{font-size:12px;color:rgba(255,255,255,.45);margin:0 0 10px;line-height:1.5}
.df-ai__ta{width:100%;padding:10px 12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;resize:none;outline:none;line-height:1.5;margin-bottom:10px}
.df-ai__ta::placeholder{color:rgba(255,255,255,.2);font-style:italic}
.df-ai__btn{width:100%;padding:10px;background:rgba(142,132,247,.18);border:1px solid rgba(142,132,247,.35);border-radius:9px;color:#c4bef7;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:7px}
.df-ai__btn:disabled{opacity:.5;cursor:not-allowed}

/* Modal fields */
.df-mf{margin-bottom:16px}
.df-mf__label{display:block;font-size:12px;font-weight:500;color:rgba(255,255,255,.5);margin-bottom:7px}
.df-inp{width:100%;padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .18s}
.df-inp::placeholder{color:rgba(255,255,255,.2)}
.df-inp:focus{border-color:rgba(142,132,247,.5);box-shadow:0 0 0 3px rgba(142,132,247,.1)}
.df-inp--ta{resize:vertical;line-height:1.5}
.df-inp--sel{cursor:pointer;appearance:auto}
.df-logo-up{height:80px;border:1.5px dashed rgba(255,255,255,.12);border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .18s}
.df-logo-up:hover{border-color:rgba(142,132,247,.4)}
.df-logo-up__ph{font-size:13px;color:rgba(255,255,255,.3);display:flex;flex-direction:column;align-items:center;gap:4px}
.df-logo-up__img{height:60px;object-fit:contain;border-radius:6px}

/* Memo panel */
.df-memo{position:absolute;right:0;top:0;bottom:0;width:420px;background:rgb(16,16,22);border-left:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;z-index:50}
.df-memo__hdr{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;justify-content:space-between;align-items:flex-start;flex-shrink:0}
.df-memo__title{font-size:15px;font-weight:600;color:#fff;margin:0 0 8px}
.df-memo__types{display:flex;gap:5px;flex-wrap:wrap}
.df-memo-type{padding:4px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:20px;font-size:11px;color:rgba(255,255,255,.45);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.df-memo-type--on{background:rgba(142,132,247,.14);border-color:rgba(142,132,247,.3);color:#c4bef7}
.df-memo__close{background:none;border:none;color:rgba(255,255,255,.4);font-size:20px;cursor:pointer;padding:0;line-height:1;flex-shrink:0}
.df-memo__body{flex:1;padding:16px 20px;overflow-y:auto}
.df-memo__empty{text-align:center;padding:40px 20px;color:rgba(255,255,255,.38);font-size:13px;line-height:1.6}
.df-memo__content{display:flex;flex-direction:column;gap:12px}
.df-memo__md{font-size:13px;color:rgba(255,255,255,.75);line-height:1.7;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:16px}
.df-memo__acts{display:flex;gap:8px}
.df-memo__gen{margin:0 20px 20px;padding:12px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:7px;flex-shrink:0}
.df-memo__gen:disabled{opacity:.55}
.df-act-btn{padding:8px 16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:rgba(255,255,255,.65);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif}
.df-act-btn--primary{background:rgba(142,132,247,.18);border-color:rgba(142,132,247,.3);color:#c4bef7}

/* Memos tab */
.df-memos-tab{flex:1;padding-top:4px;overflow-y:auto}
.df-memos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.df-memo-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;cursor:pointer;transition:border-color .18s}
.df-memo-card:hover{border-color:rgba(142,132,247,.3)}
.df-memo-card--exists{border-color:rgba(142,132,247,.2)}
.df-memo-card__hdr{display:flex;justify-content:space-between;align-items:center}
.df-memo-card__name{font-size:13px;font-weight:600;color:#fff;margin:0}
.df-memo-card__stage{font-size:11px;font-weight:500}

/* Outreach */
.df-outreach{flex:1;overflow:hidden}
.df-outreach__split{display:grid;grid-template-columns:1fr 1fr;gap:16px;height:100%}
@media(max-width:768px){.df-outreach__split{grid-template-columns:1fr}}
.df-outreach__left,.df-outreach__right{display:flex;flex-direction:column;gap:12px;overflow-y:auto}
.df-section-label{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.7px;color:rgba(255,255,255,.35);margin:0}
.df-outreach-list{display:flex;flex-direction:column;gap:6px}
.df-outreach-item{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;cursor:pointer;transition:all .18s}
.df-outreach-item--on{background:rgba(142,132,247,.09);border-color:rgba(142,132,247,.25)}
.df-outreach-item__name{font-size:13px;font-weight:500;color:#fff;margin:0}
.df-outreach-item__meta{font-size:11px;color:rgba(255,255,255,.38);margin:0}
.df-template-chips{display:flex;flex-wrap:wrap;gap:6px}
.df-template-chip{padding:6px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:20px;font-size:12px;color:rgba(255,255,255,.5);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.df-template-chip--on{background:rgba(142,132,247,.15);border-color:rgba(142,132,247,.4);color:#c4bef7}
.df-gen-btn{padding:11px 20px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 12px rgba(142,132,247,.25);display:flex;align-items:center;gap:7px}
.df-gen-btn:disabled{opacity:.5;cursor:not-allowed}
.df-preview{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden}
.df-preview__content{padding:16px;font-size:13px;color:rgba(255,255,255,.7);line-height:1.6;white-space:pre-wrap}
.df-preview__acts{padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);display:flex;gap:8px}

/* Spinner */
.df-spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:df-spin .7s linear infinite;display:inline-block}
@keyframes df-spin{to{transform:rotate(360deg)}}
`;
