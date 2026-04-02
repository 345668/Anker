/**
 * client/src/pages/app/DealFlowPage.tsx
 *
 * Dual-mode deal flow pipeline for Anker:
 *
 *   MODE A — STARTUP fundraising (existing "USA Dealflow" concept)
 *   Pipeline: founders tracking their VC/PE/Angel outreach
 *   Stages: Identified → Contacted → Engaged → Term Sheet → Closed
 *
 *   MODE B — VC/PE/VENTURE STUDIO fundraising from LPs  ← NEW
 *   Pipeline: fund managers tracking LP commitments for Fund I–IV
 *   Stages: Prospect → Qualified → Pitched → Due Diligence → Soft Circle → Hard Circle → Closed → Declined
 *
 * Features:
 *   - Kanban board with drag-aware stage columns
 *   - Deal Memos tab (integrated, not separate)
 *   - LP Outreach sequences tab (new)
 *   - "Add Prospect" modal with correct fields per mode
 *   - AI Form Assistant (fixing the broken upload button)
 *   - Pipeline metrics bar (commitment totals, velocity)
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../hooks/use-auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type PipelineMode = "startup" | "fund";

type ProspectStatus =
  | "prospect" | "qualified" | "pitched" | "diligence"
  | "soft_circle" | "hard_circle" | "closed" | "declined"  // fund mode
  | "identified" | "contacted" | "engaged" | "term_sheet" | "closed_startup"; // startup mode

interface Prospect {
  id: string;
  name: string;
  logo?: string;
  website?: string;
  email?: string;
  stage: string;
  assignedTo?: string;
  probability: number;
  // Fund mode LP fields
  lpType?: string;
  commitmentSize?: string;
  commitmentCurrency?: string;
  geography?: string;
  dealSource?: string;
  investmentDomicile?: string;
  archetypes?: string[];
  tags?: string[];
  linkedPeople?: string[];
  notes?: string;
  starRating?: number;
  // Startup mode fields
  firmType?: string;
  checkSize?: string;
  leadPartner?: string;
  // Shared
  createdAt: string;
  lastActivity?: string;
  hasDealMemo?: boolean;
  dealMemoStatus?: "draft" | "complete" | "shared";
}

interface DealMemo {
  id: string;
  prospectId: string;
  prospectName: string;
  type: "investment_thesis" | "lp_memo" | "ic_memo" | "pass_memo";
  status: "draft" | "review" | "approved" | "shared";
  createdAt: string;
  summary?: string;
  aiGenerated?: boolean;
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
  { id: "identified",    label: "Identified",   color: "#888780", bg: "rgba(136,135,128,0.08)" },
  { id: "contacted",     label: "Contacted",    color: "#3b82f6", bg: "rgba(59,130,246,0.08)"  },
  { id: "engaged",       label: "Engaged",      color: "#8e84f7", bg: "rgba(142,132,247,0.08)" },
  { id: "screen",        label: "Screening",    color: "#f59e0b", bg: "rgba(245,158,11,0.08)"  },
  { id: "diligence",     label: "Diligence",    color: "#c8aa82", bg: "rgba(200,170,130,0.08)" },
  { id: "term_sheet",    label: "Term Sheet",   color: "#5dcaa5", bg: "rgba(93,202,165,0.08)"  },
  { id: "closed_startup",label: "Closed ✓",    color: "#22c55e", bg: "rgba(34,197,94,0.08)"   },
  { id: "passed",        label: "Passed",       color: "#ef4444", bg: "rgba(239,68,68,0.08)"   },
];

// LP archetypes for fund mode
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

// ─── Utility ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, { credentials: "include", ...opts });
}

function currencyFormat(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ─── Stars ────────────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={`star ${i <= (hover || value) ? "star--on" : ""}`}
          onMouseEnter={() => onChange && setHover(i)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange?.(i)}
          style={{ cursor: onChange ? "pointer" : "default" }}
        >★</span>
      ))}
    </div>
  );
}

// ─── Pipeline metrics bar ─────────────────────────────────────────────────────

function MetricsBar({ prospects, mode }: { prospects: Prospect[]; mode: PipelineMode }) {
  const total = prospects.length;
  const active = prospects.filter(p => p.stage !== "declined" && p.stage !== "passed").length;
  const closed = prospects.filter(p => p.stage === "closed" || p.stage === "closed_startup").length;

  // Fund mode: sum commitment sizes
  const totalCommitment = mode === "fund"
    ? prospects
        .filter(p => p.stage === "closed")
        .reduce((sum, p) => {
          const mid: Record<string, number> = {
            "< $250K": 125_000, "$250K – $500K": 375_000, "$500K – $1M": 750_000,
            "$1M – $5M": 3_000_000, "$5M – $25M": 15_000_000,
            "$25M – $100M": 62_500_000, "$100M+": 100_000_000,
          };
          return sum + (mid[p.commitmentSize ?? ""] ?? 0);
        }, 0)
    : 0;

  const softCircle = mode === "fund"
    ? prospects.filter(p => ["soft_circle", "hard_circle"].includes(p.stage)).length
    : 0;

  const metrics = mode === "fund"
    ? [
        { label: "Prospects",    value: total.toString(),               color: "#888780" },
        { label: "Active",       value: active.toString(),              color: "#8e84f7" },
        { label: "Soft / Hard",  value: softCircle.toString(),          color: "#c8aa82" },
        { label: "Closed LPs",   value: closed.toString(),              color: "#22c55e" },
        { label: "Total raised", value: currencyFormat(totalCommitment), color: "#22c55e" },
      ]
    : [
        { label: "Investors tracked", value: total.toString(),   color: "#888780" },
        { label: "Active",            value: active.toString(),  color: "#8e84f7" },
        { label: "In diligence",      value: prospects.filter(p => p.stage === "diligence").length.toString(), color: "#f59e0b" },
        { label: "Term sheets",       value: prospects.filter(p => p.stage === "term_sheet").length.toString(), color: "#5dcaa5" },
        { label: "Closed",            value: closed.toString(),  color: "#22c55e" },
      ];

  return (
    <div className="metrics-bar">
      {metrics.map(m => (
        <div key={m.label} className="metrics-bar__item">
          <span className="metrics-bar__val" style={{ color: m.color }}>{m.value}</span>
          <span className="metrics-bar__label">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Prospect card ────────────────────────────────────────────────────────────

function ProspectCard({
  prospect,
  mode,
  stageColor,
  onMove,
  onOpenMemo,
  onClick,
}: {
  prospect: Prospect;
  mode: PipelineMode;
  stageColor: string;
  onMove: (id: string, stage: string) => void;
  onOpenMemo: (p: Prospect) => void;
  onClick: (p: Prospect) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="prospect-card"
      onClick={() => onClick(prospect)}
    >
      {/* Header */}
      <div className="prospect-card__header">
        {prospect.logo ? (
          <img src={prospect.logo} alt="" className="prospect-card__logo" />
        ) : (
          <div className="prospect-card__logo-fallback">
            {prospect.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="prospect-card__info">
          <p className="prospect-card__name">{prospect.name}</p>
          {prospect.email
            ? <p className="prospect-card__email">{prospect.email}</p>
            : <p className="prospect-card__email prospect-card__email--missing">No email</p>
          }
        </div>
        <div className="prospect-card__prob" style={{ color: prospect.probability >= 60 ? "#22c55e" : prospect.probability >= 30 ? "#f59e0b" : "#888780" }}>
          {prospect.probability}%
        </div>
      </div>

      {/* Key details */}
      <div className="prospect-card__details">
        {mode === "fund" && prospect.lpType && (
          <span className="prospect-card__tag">{prospect.lpType}</span>
        )}
        {mode === "fund" && prospect.commitmentSize && (
          <span className="prospect-card__tag prospect-card__tag--gold">{prospect.commitmentSize}</span>
        )}
        {mode === "startup" && prospect.firmType && (
          <span className="prospect-card__tag">{prospect.firmType}</span>
        )}
        {mode === "startup" && prospect.checkSize && (
          <span className="prospect-card__tag prospect-card__tag--gold">{prospect.checkSize}</span>
        )}
        {prospect.geography && (
          <span className="prospect-card__tag prospect-card__tag--geo">📍 {prospect.geography}</span>
        )}
      </div>

      {/* Tags */}
      {prospect.tags && prospect.tags.length > 0 && (
        <div className="prospect-card__tags">
          {prospect.tags.slice(0, 3).map(t => (
            <span key={t} className="prospect-card__chip">{t}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="prospect-card__footer">
        <StarRating value={prospect.starRating ?? 0} />
        <div className="prospect-card__actions">
          {prospect.hasDealMemo ? (
            <button
              className="prospect-card__memo-btn prospect-card__memo-btn--exists"
              onClick={e => { e.stopPropagation(); onOpenMemo(prospect); }}
              title="View deal memo"
            >
              📄 Memo {prospect.dealMemoStatus === "shared" ? "· Shared" : ""}
            </button>
          ) : (
            <button
              className="prospect-card__memo-btn"
              onClick={e => { e.stopPropagation(); onOpenMemo(prospect); }}
              title="Create deal memo"
            >
              + Memo
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Stage column ─────────────────────────────────────────────────────────────

function StageColumn({
  stage,
  prospects,
  mode,
  onMove,
  onOpenMemo,
  onCardClick,
}: {
  stage: { id: string; label: string; color: string; bg: string };
  prospects: Prospect[];
  mode: PipelineMode;
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
    <div className={`stage-col ${collapsed ? "stage-col--collapsed" : ""}`}
      style={{ borderTopColor: stage.color }}>
      <div
        className="stage-col__header"
        onClick={() => setCollapsed(!collapsed)}
        style={{ background: stage.bg }}
      >
        <span className="stage-col__chevron">{collapsed ? "▶" : "▼"}</span>
        <span className="stage-col__label" style={{ color: stage.color }}>{stage.label}</span>
        <span className="stage-col__count">{prospects.length}</span>
        {mode === "fund" && totalCommitment > 0 && (
          <span className="stage-col__amount">{currencyFormat(totalCommitment)}</span>
        )}
      </div>

      {!collapsed && (
        <div className="stage-col__cards">
          <AnimatePresence>
            {prospects.map(p => (
              <ProspectCard
                key={p.id}
                prospect={p}
                mode={mode}
                stageColor={stage.color}
                onMove={onMove}
                onOpenMemo={onOpenMemo}
                onClick={onCardClick}
              />
            ))}
          </AnimatePresence>
          {prospects.length === 0 && (
            <div className="stage-col__empty">Drop here</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Prospect Modal ───────────────────────────────────────────────────────

function AddProspectModal({
  mode,
  stages,
  onClose,
  onAdd,
}: {
  mode: PipelineMode;
  stages: { id: string; label: string }[];
  onClose: () => void;
  onAdd: (data: Partial<Prospect>) => void;
}) {
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [form, setForm] = useState<Partial<Prospect>>({ stage: stages[0]?.id, probability: 10 });
  const [activeSection, setActiveSection] = useState<string>("org");
  const upd = (patch: Partial<Prospect>) => setForm(f => ({ ...f, ...patch }));

  // AI auto-fill using Anthropic API
  const handleAiFill = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Extract structured data from this text about an ${mode === "fund" ? "LP / investor" : "investment firm"}. Return ONLY valid JSON with these fields (use null for missing): { "name": string, "website": string, "email": string, "geography": string, "lpType": "${mode === "fund" ? LP_TYPES.join("|") : "VC Fund|Angel|Family Office|PE"}", "commitmentSize": string, "notes": string, "tags": string[] }\n\nText: ${aiText}`,
          }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      upd(parsed);
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
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.22 }}
        className="modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="modal__header">
          <h2 className="modal__title">
            Add {mode === "fund" ? "LP Prospect" : "Investor"} to Pipeline
          </h2>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>

        {/* AI Form Assistant */}
        <div className="ai-assistant">
          <div className="ai-assistant__header">
            <span className="ai-assistant__icon">✦</span>
            <span className="ai-assistant__label">AI Form Assistant</span>
          </div>
          <p className="ai-assistant__desc">
            Paste any text about the {mode === "fund" ? "LP" : "investor"} — email, website copy, LinkedIn bio, document — and AI will fill the form.
          </p>
          <textarea
            className="ai-assistant__textarea"
            placeholder={`e.g. "${mode === "fund"
              ? "Hamilton Lane is a global private markets asset management firm with $920B+ in assets, headquartered in Philadelphia..."
              : "Sequoia Capital is a VC firm focused on technology companies in seed through growth stages, check size $1M–$100M..."
            }"`}
            value={aiText}
            onChange={e => setAiText(e.target.value)}
            rows={3}
          />
          <button
            className="ai-assistant__btn"
            onClick={handleAiFill}
            disabled={!aiText.trim() || aiLoading}
          >
            {aiLoading ? <><span className="spinner" /> Analysing…</> : "✦ Auto-fill form fields"}
          </button>
        </div>

        {/* Section nav tabs */}
        <div className="modal__sections">
          {sections.map(s => (
            <button
              key={s.id}
              className={`modal__section-tab ${activeSection === s.id ? "modal__section-tab--on" : ""}`}
              onClick={() => setActiveSection(s.id)}
            >
              <span>{s.icon}</span> {s.label}
            </button>
          ))}
        </div>

        {/* Section content */}
        <div className="modal__body">
          <AnimatePresence mode="wait">
            {activeSection === "org" && (
              <motion.div key="org" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ModalField label="Name *">
                  <input className="modal-input" placeholder="Organisation name" value={form.name ?? ""} onChange={e => upd({ name: e.target.value })} />
                </ModalField>
                <ModalField label="Logo">
                  <div className="logo-upload" onClick={() => document.getElementById("logo-file")?.click()}>
                    {form.logo
                      ? <img src={form.logo} alt="" className="logo-upload__preview" />
                      : <div className="logo-upload__placeholder"><span>↑</span> Upload logo</div>
                    }
                    <input id="logo-file" type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = ev => upd({ logo: ev.target?.result as string });
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                </ModalField>
                <ModalField label="Website">
                  <input className="modal-input" type="url" placeholder="https://" value={form.website ?? ""} onChange={e => upd({ website: e.target.value })} />
                </ModalField>
                <ModalField label="Email">
                  <input className="modal-input" type="email" placeholder="contact@firm.com" value={form.email ?? ""} onChange={e => upd({ email: e.target.value })} />
                </ModalField>
                <ModalField label="Short description">
                  <textarea className="modal-input modal-input--ta" rows={2} placeholder="Brief description of the organisation" value={form.notes ?? ""} onChange={e => upd({ notes: e.target.value })} />
                </ModalField>
                <ModalField label="Tags">
                  <input className="modal-input" placeholder="e.g. ESG Focus, European LP, Repeat Investor" value={(form.tags ?? []).join(", ")} onChange={e => upd({ tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} />
                </ModalField>
              </motion.div>
            )}

            {activeSection === "lp" && (
              <motion.div key="lp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {mode === "fund" ? (
                  <>
                    <ModalField label="LP type">
                      <select className="modal-input modal-input--sel" value={form.lpType ?? ""} onChange={e => upd({ lpType: e.target.value })}>
                        <option value="">Select LP type…</option>
                        {LP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </ModalField>
                    <ModalField label="Target commitment size">
                      <select className="modal-input modal-input--sel" value={form.commitmentSize ?? ""} onChange={e => upd({ commitmentSize: e.target.value })}>
                        <option value="">Select range…</option>
                        {COMMITMENT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </ModalField>
                    <ModalField label="LP archetype">
                      <select className="modal-input modal-input--sel" value={form.archetypes?.[0] ?? ""} onChange={e => upd({ archetypes: [e.target.value] })}>
                        <option value="">Select archetype…</option>
                        {LP_ARCHETYPES.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </ModalField>
                    <ModalField label="Investment domicile">
                      <input className="modal-input" placeholder="e.g. Cayman Islands, Delaware, Luxembourg" value={form.investmentDomicile ?? ""} onChange={e => upd({ investmentDomicile: e.target.value })} />
                    </ModalField>
                    <ModalField label="Geography / HQ">
                      <input className="modal-input" placeholder="e.g. New York, USA" value={form.geography ?? ""} onChange={e => upd({ geography: e.target.value })} />
                    </ModalField>
                    <ModalField label="Deal source">
                      <select className="modal-input modal-input--sel" value={form.dealSource ?? ""} onChange={e => upd({ dealSource: e.target.value })}>
                        <option value="">Select source…</option>
                        {DEAL_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </ModalField>
                  </>
                ) : (
                  <>
                    <ModalField label="Investor / firm type">
                      <select className="modal-input modal-input--sel" value={form.firmType ?? ""} onChange={e => upd({ firmType: e.target.value })}>
                        <option value="">Select type…</option>
                        {INVESTOR_TYPES_STARTUP.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </ModalField>
                    <ModalField label="Typical check size">
                      <select className="modal-input modal-input--sel" value={form.checkSize ?? ""} onChange={e => upd({ checkSize: e.target.value })}>
                        <option value="">Select range…</option>
                        {COMMITMENT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </ModalField>
                    <ModalField label="Lead partner">
                      <input className="modal-input" placeholder="Partner name" value={form.leadPartner ?? ""} onChange={e => upd({ leadPartner: e.target.value })} />
                    </ModalField>
                    <ModalField label="Geography focus">
                      <input className="modal-input" placeholder="e.g. USA, Europe, Global" value={form.geography ?? ""} onChange={e => upd({ geography: e.target.value })} />
                    </ModalField>
                    <ModalField label="Deal source">
                      <select className="modal-input modal-input--sel" value={form.dealSource ?? ""} onChange={e => upd({ dealSource: e.target.value })}>
                        <option value="">Select source…</option>
                        {DEAL_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </ModalField>
                    <ModalField label="Referred by">
                      <input className="modal-input" placeholder="Name of referrer" value={form.assignedTo ?? ""} onChange={e => upd({ assignedTo: e.target.value })} />
                    </ModalField>
                  </>
                )}
              </motion.div>
            )}

            {activeSection === "pipeline" && (
              <motion.div key="pipeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ModalField label="Initial stage">
                  <select className="modal-input modal-input--sel" value={form.stage ?? ""} onChange={e => upd({ stage: e.target.value })}>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </ModalField>
                <ModalField label={mode === "fund" ? "Commitment probability %" : "Close probability %"}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <input
                      className="modal-input"
                      type="range" min={0} max={100} step={5}
                      value={form.probability ?? 0}
                      onChange={e => upd({ probability: Number(e.target.value) })}
                      style={{ flex: 1, accentColor: "#8e84f7" }}
                    />
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#8e84f7", minWidth: 40 }}>{form.probability ?? 0}%</span>
                  </div>
                </ModalField>
                <ModalField label="Assigned to">
                  <input className="modal-input" placeholder="Team member name" value={form.assignedTo ?? ""} onChange={e => upd({ assignedTo: e.target.value })} />
                </ModalField>
                <ModalField label="Conviction rating">
                  <div style={{ paddingTop: 4 }}>
                    <StarRating value={form.starRating ?? 0} onChange={v => upd({ starRating: v })} />
                  </div>
                </ModalField>
              </motion.div>
            )}

            {activeSection === "people" && (
              <motion.div key="people" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ModalField label="Linked people">
                  <input className="modal-input" placeholder="Names of key contacts (comma separated)" value={(form.linkedPeople ?? []).join(", ")} onChange={e => upd({ linkedPeople: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} />
                </ModalField>
                <ModalField label="Notes">
                  <textarea className="modal-input modal-input--ta" rows={4} placeholder="Any notes, context, or next steps…" value={form.notes ?? ""} onChange={e => upd({ notes: e.target.value })} />
                </ModalField>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="modal__footer">
          <button className="modal__cancel" onClick={onClose}>Cancel & Close</button>
          <button
            className="modal__submit"
            onClick={() => { if (form.name) { onAdd(form); onClose(); } }}
            disabled={!form.name}
          >
            Add {mode === "fund" ? "LP Prospect" : "Investor"} →
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="modal-field">
      <label className="modal-field__label">{label}</label>
      {children}
    </div>
  );
}

// ─── Deal Memo Panel ──────────────────────────────────────────────────────────

function DealMemoPanel({ prospect, mode, onClose }: { prospect: Prospect | null; mode: PipelineMode; onClose: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [memoContent, setMemoContent] = useState("");
  const [memoType, setMemoType] = useState<DealMemo["type"]>(mode === "fund" ? "lp_memo" : "investment_thesis");

  const MEMO_TYPES = mode === "fund"
    ? [
        { id: "lp_memo",   label: "LP Memo" },
        { id: "ic_memo",   label: "IC Memo" },
        { id: "pass_memo", label: "Pass Memo" },
      ]
    : [
        { id: "investment_thesis", label: "Investment Thesis" },
        { id: "ic_memo",           label: "IC Memo" },
        { id: "pass_memo",         label: "Pass Memo" },
      ];

  const handleGenerate = async () => {
    if (!prospect) return;
    setGenerating(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Generate a professional ${memoType.replace(/_/g, " ")} for an ${mode === "fund" ? "LP prospect" : "investment opportunity"}. Use this data:\n\nName: ${prospect.name}\nType: ${prospect.lpType ?? prospect.firmType ?? "N/A"}\nSize: ${prospect.commitmentSize ?? prospect.checkSize ?? "N/A"}\nGeography: ${prospect.geography ?? "N/A"}\nNotes: ${prospect.notes ?? "None"}\n\nFormat as markdown with sections: Overview, Key Points, Rationale, Next Steps. Be concise and professional.`,
          }],
        }),
      });
      const data = await res.json();
      setMemoContent(data.content?.[0]?.text ?? "");
    } finally {
      setGenerating(false);
    }
  };

  if (!prospect) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="memo-panel"
    >
      <div className="memo-panel__header">
        <div>
          <p className="memo-panel__title">Deal Memo — {prospect.name}</p>
          <div className="memo-panel__types">
            {MEMO_TYPES.map(t => (
              <button
                key={t.id}
                className={`memo-type-btn ${memoType === t.id ? "memo-type-btn--on" : ""}`}
                onClick={() => setMemoType(t.id as any)}
              >{t.label}</button>
            ))}
          </div>
        </div>
        <button className="memo-panel__close" onClick={onClose}>×</button>
      </div>

      <div className="memo-panel__body">
        {memoContent ? (
          <div className="memo-panel__content">
            <div className="memo-panel__markdown"
              dangerouslySetInnerHTML={{ __html: memoContent.replace(/\n/g, "<br>").replace(/#{1,3} (.+)/g, "<strong>$1</strong>") }}
            />
            <div className="memo-panel__actions">
              <button className="memo-action-btn" onClick={() => navigator.clipboard.writeText(memoContent)}>Copy</button>
              <button className="memo-action-btn memo-action-btn--primary">Share with {prospect.name}</button>
            </div>
          </div>
        ) : (
          <div className="memo-panel__empty">
            <p>Generate an AI-powered {memoType.replace(/_/g, " ")} for {prospect.name}.</p>
            <p className="memo-panel__empty-sub">Uses prospect data, notes, and stage to produce a professional memo in seconds.</p>
          </div>
        )}
      </div>

      <button
        className="memo-panel__generate"
        onClick={handleGenerate}
        disabled={generating}
      >
        {generating ? <><span className="spinner" /> Generating…</> : `✦ Generate ${memoType.replace(/_/g, " ")}`}
      </button>
    </motion.div>
  );
}

// ─── LP Outreach Tab ──────────────────────────────────────────────────────────

function LPOutreachTab({ prospects, mode }: { prospects: Prospect[]; mode: PipelineMode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState("intro");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState("");

  const TEMPLATES = mode === "fund"
    ? [
        { id: "intro",       label: "Fund introduction" },
        { id: "follow_up",   label: "Follow-up after meeting" },
        { id: "commitment",  label: "Commitment ask" },
        { id: "update",      label: "Fund performance update" },
        { id: "close",       label: "Final close reminder" },
      ]
    : [
        { id: "intro",       label: "Investor introduction" },
        { id: "follow_up",   label: "Follow-up" },
        { id: "deck_share",  label: "Send pitch deck" },
        { id: "dd_response", label: "Respond to DD questions" },
      ];

  const qualify = prospects.filter(p => !["declined", "passed", "closed", "closed_startup"].includes(p.stage));
  const toggle = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleGenerate = async () => {
    const names = [...selected].map(id => prospects.find(p => p.id === id)?.name ?? "").join(", ");
    setGenerating(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Write a professional ${template.replace(/_/g, " ")} email for a ${mode === "fund" ? "fund manager reaching out to LP prospects" : "startup founder reaching out to investors"}. Recipients: ${names}. Keep it concise (3-4 paragraphs), warm, and action-oriented. Include a clear CTA. Subject line first, then email body. No placeholders.`,
          }],
        }),
      });
      const data = await res.json();
      setPreview(data.content?.[0]?.text ?? "");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="outreach-tab">
      <div className="outreach-tab__split">
        <div className="outreach-tab__left">
          <p className="outreach-section-label">Select {mode === "fund" ? "LPs" : "investors"} to reach out to</p>
          <div className="outreach-list">
            {qualify.map(p => (
              <label key={p.id} className={`outreach-item ${selected.has(p.id) ? "outreach-item--on" : ""}`}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: "#8e84f7" }} />
                <div>
                  <p className="outreach-item__name">{p.name}</p>
                  <p className="outreach-item__meta">{p.lpType ?? p.firmType ?? "—"} · {p.stage}</p>
                </div>
                {p.email && <span className="outreach-item__email">✉</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="outreach-tab__right">
          <p className="outreach-section-label">Outreach template</p>
          <div className="template-chips">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                className={`template-chip ${template === t.id ? "template-chip--on" : ""}`}
                onClick={() => setTemplate(t.id)}
              >{t.label}</button>
            ))}
          </div>

          <button
            className="generate-outreach-btn"
            onClick={handleGenerate}
            disabled={selected.size === 0 || generating}
          >
            {generating ? <><span className="spinner" /> Writing…</> : `✦ Draft email for ${selected.size || 0} ${mode === "fund" ? "LP" : "investor"}${selected.size !== 1 ? "s" : ""}`}
          </button>

          {preview && (
            <div className="outreach-preview">
              <div className="outreach-preview__content">{preview}</div>
              <div className="outreach-preview__actions">
                <button className="memo-action-btn" onClick={() => navigator.clipboard.writeText(preview)}>Copy</button>
                <button className="memo-action-btn memo-action-btn--primary">Open in mail</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DealFlowPage() {
  const { user, isFounder } = useAuth();
  const qc = useQueryClient();

  // Dual mode: startup mode = founder tracking VCs; fund mode = VC tracking LPs
  const [mode, setMode] = useState<PipelineMode>(isFounder ? "startup" : "fund");
  const [activeTab, setActiveTab] = useState<"pipeline" | "memos" | "outreach">("pipeline");
  const [showAddModal, setShowAddModal] = useState(false);
  const [memoProspect, setMemoProspect] = useState<Prospect | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStage, setFilterStage] = useState<string>("all");

  const stages = mode === "fund" ? FUND_STAGES : STARTUP_STAGES;

  const { data: prospects = [], isLoading } = useQuery({
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

  const filtered = (prospects as Prospect[]).filter(p => {
    if (filterStage !== "all" && p.stage !== filterStage) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const byStage = (stageId: string) => filtered.filter(p => p.stage === stageId);

  return (
    <div className="dealflow">
      {/* Top header */}
      <div className="dealflow__header">
        <div className="dealflow__title-row">
          <h1 className="dealflow__title">
            {mode === "fund" ? "LP Fundraising Pipeline" : "Investor Pipeline"}
          </h1>
          {/* Mode toggle */}
          <div className="mode-toggle">
            <button className={`mode-btn ${mode === "startup" ? "mode-btn--on" : ""}`} onClick={() => setMode("startup")}>
              🚀 Startup
            </button>
            <button className={`mode-btn ${mode === "fund" ? "mode-btn--on" : ""}`} onClick={() => setMode("fund")}>
              💼 Fund LP
            </button>
          </div>
        </div>

        <MetricsBar prospects={prospects as Prospect[]} mode={mode} />

        {/* Action bar */}
        <div className="dealflow__actions">
          <div className="tab-row">
            {["pipeline", "memos", "outreach"].map(t => (
              <button
                key={t}
                className={`action-tab ${activeTab === t ? "action-tab--on" : ""}`}
                onClick={() => setActiveTab(t as any)}
              >
                {t === "pipeline" ? "📊 Pipeline" : t === "memos" ? "📄 Deal Memos" : "✉ LP Outreach"}
              </button>
            ))}
          </div>
          <div className="dealflow__right-actions">
            <input
              className="search-input"
              placeholder="Search by name…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <select className="filter-select" value={filterStage} onChange={e => setFilterStage(e.target.value)}>
              <option value="all">All stages</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button className="add-btn" onClick={() => setShowAddModal(true)}>
              + Add {mode === "fund" ? "LP" : "Investor"}
            </button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="dealflow__body">
        {activeTab === "pipeline" && (
          <div className="kanban-board">
            {stages.map(stage => (
              <StageColumn
                key={stage.id}
                stage={stage}
                prospects={byStage(stage.id)}
                mode={mode}
                onMove={(id, s) => moveMutation.mutate({ id, stage: s })}
                onOpenMemo={setMemoProspect}
                onCardClick={p => setMemoProspect(p)}
              />
            ))}
          </div>
        )}

        {activeTab === "memos" && (
          <div className="memos-tab">
            <p className="outreach-section-label" style={{ marginBottom: 16 }}>
              All deal memos — click any prospect to generate or view its memo
            </p>
            <div className="memos-grid">
              {(prospects as Prospect[]).map(p => (
                <div
                  key={p.id}
                  className={`memo-card ${p.hasDealMemo ? "memo-card--exists" : ""}`}
                  onClick={() => setMemoProspect(p)}
                >
                  <div className="memo-card__header">
                    <p className="memo-card__name">{p.name}</p>
                    <span className="memo-card__stage" style={{ color: stages.find(s => s.id === p.stage)?.color ?? "#888" }}>
                      {stages.find(s => s.id === p.stage)?.label}
                    </span>
                  </div>
                  {p.hasDealMemo ? (
                    <div className="memo-card__exists">
                      <span className="memo-card__status">📄 {p.dealMemoStatus === "shared" ? "Shared" : p.dealMemoStatus === "complete" ? "Complete" : "Draft"}</span>
                    </div>
                  ) : (
                    <div className="memo-card__empty">+ Generate memo</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "outreach" && (
          <LPOutreachTab prospects={prospects as Prospect[]} mode={mode} />
        )}

        {/* Deal memo side panel */}
        <AnimatePresence>
          {memoProspect && (
            <DealMemoPanel
              prospect={memoProspect}
              mode={mode}
              onClose={() => setMemoProspect(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Add prospect modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddProspectModal
            mode={mode}
            stages={stages}
            onClose={() => setShowAddModal(false)}
            onAdd={(data) => addMutation.mutate(data)}
          />
        )}
      </AnimatePresence>

      <style>{dealflowStyles}</style>
    </div>
  );
}

const dealflowStyles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Outfit:wght@600;700&display=swap');
*{box-sizing:border-box}

.dealflow{display:flex;flex-direction:column;height:100vh;overflow:hidden;font-family:'DM Sans',sans-serif;background:rgb(11,11,15);color:#fff}

/* Header */
.dealflow__header{padding:20px 24px 0;flex-shrink:0}
.dealflow__title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:16px;flex-wrap:wrap}
.dealflow__title{font-family:'Outfit',sans-serif;font-size:22px;font-weight:700;margin:0;letter-spacing:-.4px}
.mode-toggle{display:flex;background:rgba(255,255,255,.06);border-radius:10px;padding:3px;gap:2px}
.mode-btn{padding:7px 16px;border:none;background:none;color:rgba(255,255,255,.45);font-size:13px;font-weight:500;cursor:pointer;border-radius:8px;transition:all .18s;font-family:'DM Sans',sans-serif}
.mode-btn--on{background:rgba(142,132,247,.18);color:#fff;border:1px solid rgba(142,132,247,.3)}

/* Metrics bar */
.metrics-bar{display:flex;gap:0;margin-bottom:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden}
.metrics-bar__item{flex:1;padding:12px 16px;border-right:1px solid rgba(255,255,255,.06);text-align:center}
.metrics-bar__item:last-child{border-right:none}
.metrics-bar__val{display:block;font-family:'Outfit',sans-serif;font-size:20px;font-weight:700;line-height:1}
.metrics-bar__label{font-size:11px;color:rgba(255,255,255,.35);display:block;margin-top:3px;text-transform:uppercase;letter-spacing:.4px}

/* Action bar */
.dealflow__actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.tab-row{display:flex;gap:4px}
.action-tab{padding:8px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:9px;color:rgba(255,255,255,.5);font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.action-tab--on{background:rgba(142,132,247,.14);border-color:rgba(142,132,247,.3);color:#c4bef7}
.dealflow__right-actions{display:flex;gap:8px;align-items:center}
.search-input{padding:8px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:8px;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;min-width:180px}
.search-input::placeholder{color:rgba(255,255,255,.2)}
.filter-select{padding:8px 11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:8px;color:rgba(255,255,255,.65);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;outline:none}
.add-btn{padding:8px 18px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 12px rgba(142,132,247,.25);white-space:nowrap}

/* Body */
.dealflow__body{flex:1;overflow:hidden;display:flex;gap:0;position:relative;padding:0 24px 24px}

/* Kanban */
.kanban-board{display:flex;gap:10px;overflow-x:auto;flex:1;padding-bottom:8px}
.kanban-board::-webkit-scrollbar{height:4px}
.kanban-board::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
.stage-col{min-width:220px;max-width:240px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-top:3px solid;border-radius:12px;display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.stage-col--collapsed{min-width:44px;max-width:44px}
.stage-col__header{display:flex;align-items:center;gap:6px;padding:10px 12px;cursor:pointer;user-select:none;min-height:40px}
.stage-col--collapsed .stage-col__header{flex-direction:column;padding:10px 6px;align-items:center}
.stage-col__chevron{font-size:10px;color:rgba(255,255,255,.3);flex-shrink:0}
.stage-col__label{font-size:12px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stage-col--collapsed .stage-col__label{writing-mode:vertical-rl;text-orientation:mixed;transform:rotate(180deg);white-space:nowrap;max-height:120px}
.stage-col__count{font-size:11px;background:rgba(255,255,255,.1);border-radius:10px;padding:1px 7px;flex-shrink:0}
.stage-col__amount{font-size:10px;color:rgba(255,255,255,.35);flex-shrink:0}
.stage-col__cards{padding:8px;display:flex;flex-direction:column;gap:7px;overflow-y:auto;flex:1}
.stage-col__empty{height:48px;border:1.5px dashed rgba(255,255,255,.08);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;color:rgba(255,255,255,.2)}

/* Prospect card */
.prospect-card{background:rgba(24,24,32,.95);border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:12px;cursor:pointer;transition:border-color .18s}
.prospect-card:hover{border-color:rgba(142,132,247,.35)}
.prospect-card__header{display:flex;gap:9px;align-items:center;margin-bottom:8px}
.prospect-card__logo{width:32px;height:32px;border-radius:6px;object-fit:cover;flex-shrink:0}
.prospect-card__logo-fallback{width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,#8e84f7,#c8aa82);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
.prospect-card__info{flex:1;min-width:0}
.prospect-card__name{font-size:13px;font-weight:600;color:#fff;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prospect-card__email{font-size:11px;color:rgba(255,255,255,.4);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prospect-card__email--missing{color:rgba(239,68,68,.5);font-style:italic}
.prospect-card__prob{font-size:13px;font-weight:700;flex-shrink:0}
.prospect-card__details{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.prospect-card__tag{padding:2px 7px;background:rgba(255,255,255,.07);border-radius:10px;font-size:10px;color:rgba(255,255,255,.55)}
.prospect-card__tag--gold{background:rgba(200,170,130,.12);color:#c8aa82}
.prospect-card__tag--geo{background:rgba(93,202,165,.1);color:rgba(93,202,165,.9)}
.prospect-card__tags{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px}
.prospect-card__chip{padding:2px 7px;background:rgba(142,132,247,.1);border:1px solid rgba(142,132,247,.2);border-radius:10px;font-size:10px;color:rgba(142,132,247,.9)}
.prospect-card__footer{display:flex;align-items:center;justify-content:space-between}
.stars{display:flex;gap:1px}
.star{font-size:13px;color:rgba(255,255,255,.15);transition:color .1s}
.star--on{color:#c8aa82}
.prospect-card__memo-btn{padding:3px 9px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;font-size:10px;color:rgba(255,255,255,.45);cursor:pointer;font-family:'DM Sans',sans-serif}
.prospect-card__memo-btn--exists{background:rgba(142,132,247,.1);border-color:rgba(142,132,247,.25);color:#c4bef7}

/* Modal */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:flex-end;z-index:100;padding:0;backdrop-filter:blur(4px)}
.modal{background:rgb(16,16,22);border-left:1px solid rgba(255,255,255,.1);width:520px;max-width:100%;height:100vh;overflow-y:auto;display:flex;flex-direction:column}
.modal__header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
.modal__title{font-family:'Outfit',sans-serif;font-size:17px;font-weight:700;color:#fff;margin:0}
.modal__close{background:none;border:none;color:rgba(255,255,255,.4);font-size:22px;cursor:pointer;line-height:1;padding:0}
.modal__sections{display:flex;gap:4px;padding:12px 24px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;flex-wrap:wrap}
.modal__section-tab{padding:7px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:rgba(255,255,255,.45);font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s;display:flex;align-items:center;gap:6px}
.modal__section-tab--on{background:rgba(142,132,247,.14);border-color:rgba(142,132,247,.3);color:#c4bef7}
.modal__body{flex:1;padding:20px 24px;overflow-y:auto}
.modal__footer{padding:16px 24px;border-top:1px solid rgba(255,255,255,.07);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.modal__cancel{padding:10px 18px;background:none;border:1px solid rgba(255,255,255,.12);border-radius:9px;color:rgba(255,255,255,.5);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif}
.modal__submit{padding:10px 22px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 12px rgba(142,132,247,.25)}
.modal__submit:disabled{opacity:.5;cursor:not-allowed}

/* AI assistant */
.ai-assistant{margin:16px 24px;background:linear-gradient(135deg,rgba(142,132,247,.08),rgba(200,170,130,.06));border:1px solid rgba(142,132,247,.2);border-radius:12px;padding:16px}
.ai-assistant__header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.ai-assistant__icon{color:#8e84f7;font-size:16px}
.ai-assistant__label{font-size:14px;font-weight:600;color:#c4bef7}
.ai-assistant__desc{font-size:12px;color:rgba(255,255,255,.45);margin:0 0 10px;line-height:1.5}
.ai-assistant__textarea{width:100%;padding:10px 12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;resize:none;outline:none;line-height:1.5;margin-bottom:10px}
.ai-assistant__textarea::placeholder{color:rgba(255,255,255,.2);font-style:italic}
.ai-assistant__btn{width:100%;padding:10px;background:rgba(142,132,247,.18);border:1px solid rgba(142,132,247,.35);border-radius:9px;color:#c4bef7;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:7px}
.ai-assistant__btn:disabled{opacity:.5;cursor:not-allowed}

/* Modal fields */
.modal-field{margin-bottom:16px}
.modal-field__label{display:block;font-size:12px;font-weight:500;color:rgba(255,255,255,.5);margin-bottom:7px}
.modal-input{width:100%;padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .18s}
.modal-input::placeholder{color:rgba(255,255,255,.2)}
.modal-input:focus{border-color:rgba(142,132,247,.5);box-shadow:0 0 0 3px rgba(142,132,247,.1)}
.modal-input--ta{resize:vertical;line-height:1.5}
.modal-input--sel{cursor:pointer;appearance:auto}
.logo-upload{height:80px;border:1.5px dashed rgba(255,255,255,.12);border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .18s}
.logo-upload:hover{border-color:rgba(142,132,247,.4)}
.logo-upload__placeholder{font-size:13px;color:rgba(255,255,255,.3);display:flex;flex-direction:column;align-items:center;gap:4px}
.logo-upload__preview{height:60px;object-fit:contain;border-radius:6px}

/* Memo panel */
.memo-panel{position:absolute;right:0;top:0;bottom:0;width:420px;background:rgb(16,16,22);border-left:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;z-index:50}
.memo-panel__header{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;justify-content:space-between;align-items:flex-start;flex-shrink:0}
.memo-panel__title{font-size:15px;font-weight:600;color:#fff;margin:0 0 8px}
.memo-panel__types{display:flex;gap:5px;flex-wrap:wrap}
.memo-type-btn{padding:4px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:20px;font-size:11px;color:rgba(255,255,255,.45);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.memo-type-btn--on{background:rgba(142,132,247,.14);border-color:rgba(142,132,247,.3);color:#c4bef7}
.memo-panel__close{background:none;border:none;color:rgba(255,255,255,.4);font-size:20px;cursor:pointer;padding:0;line-height:1;flex-shrink:0}
.memo-panel__body{flex:1;padding:16px 20px;overflow-y:auto}
.memo-panel__empty{text-align:center;padding:40px 20px;color:rgba(255,255,255,.38);font-size:13px;line-height:1.6}
.memo-panel__empty-sub{font-size:12px;margin-top:8px;opacity:.7}
.memo-panel__content{display:flex;flex-direction:column;gap:12px}
.memo-panel__markdown{font-size:13px;color:rgba(255,255,255,.75);line-height:1.7;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:16px}
.memo-panel__actions{display:flex;gap:8px}
.memo-panel__generate{margin:0 20px 20px;padding:12px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:7px;flex-shrink:0}
.memo-panel__generate:disabled{opacity:.55}
.memo-action-btn{padding:8px 16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:rgba(255,255,255,.65);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif}
.memo-action-btn--primary{background:rgba(142,132,247,.18);border-color:rgba(142,132,247,.3);color:#c4bef7}

/* Memos tab */
.memos-tab{flex:1;padding-top:4px;overflow-y:auto}
.memos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.memo-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;cursor:pointer;transition:border-color .18s}
.memo-card:hover{border-color:rgba(142,132,247,.3)}
.memo-card--exists{border-color:rgba(142,132,247,.2)}
.memo-card__header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.memo-card__name{font-size:13px;font-weight:600;color:#fff;margin:0}
.memo-card__stage{font-size:11px;font-weight:500}
.memo-card__exists{display:flex;align-items:center;gap:6px}
.memo-card__status{font-size:12px;color:#8e84f7}
.memo-card__empty{font-size:12px;color:rgba(255,255,255,.3);margin-top:4px}

/* Outreach tab */
.outreach-tab{flex:1;overflow:hidden}
.outreach-tab__split{display:grid;grid-template-columns:1fr 1fr;gap:16px;height:100%}
@media(max-width:768px){.outreach-tab__split{grid-template-columns:1fr}}
.outreach-tab__left,.outreach-tab__right{display:flex;flex-direction:column;gap:12px;overflow-y:auto}
.outreach-section-label{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.7px;color:rgba(255,255,255,.35);margin:0}
.outreach-list{display:flex;flex-direction:column;gap:6px}
.outreach-item{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;cursor:pointer;transition:all .18s}
.outreach-item--on{background:rgba(142,132,247,.09);border-color:rgba(142,132,247,.25)}
.outreach-item__name{font-size:13px;font-weight:500;color:#fff;margin:0}
.outreach-item__meta{font-size:11px;color:rgba(255,255,255,.38);margin:0}
.outreach-item__email{color:rgba(93,202,165,.8);flex-shrink:0}
.template-chips{display:flex;flex-wrap:wrap;gap:6px}
.template-chip{padding:6px 13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:20px;color:rgba(255,255,255,.45);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.template-chip--on{background:rgba(142,132,247,.14);border-color:rgba(142,132,247,.3);color:#c4bef7}
.generate-outreach-btn{padding:11px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:7px}
.generate-outreach-btn:disabled{opacity:.5;cursor:not-allowed}
.outreach-preview{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;flex:1;overflow-y:auto}
.outreach-preview__content{font-size:13px;color:rgba(255,255,255,.7);line-height:1.7;white-space:pre-wrap;margin-bottom:12px}
.outreach-preview__actions{display:flex;gap:8px}

.spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
`;
