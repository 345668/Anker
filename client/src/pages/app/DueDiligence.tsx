/**
 * client/src/pages/app/DueDiligence.tsx
 *
 * Consolidated Due Diligence hub.
 * REPLACES:
 *   /app/dd-checklist          (DDChecklist.tsx)
 *   /app/data-room-checklist   (DataRoomChecklist.tsx)
 *   /app/eoy-review            (EOYFundHealthReview.tsx)
 *
 * ROUTE: /app/due-diligence
 * Deep-link tabs via ?tab=readiness|checklist|data-room|eoy
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";

type Tab = "readiness" | "checklist" | "data-room" | "eoy";

const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
  { id: "readiness",  label: "DD Readiness",      icon: "🩺", desc: "17-question diagnostic with weighted scoring" },
  { id: "checklist",  label: "Full DD Checklist",  icon: "📋", desc: "39-item early stage legal & corporate checklist" },
  { id: "data-room",  label: "Data Room",          icon: "📁", desc: "Fund I & Fund II+ data room prep" },
  { id: "eoy",        label: "Year-End Review",    icon: "📅", desc: "Annual fund health review for LP reporting" },
];

export default function DueDiligence() {
  const [location, navigate] = useLocation();

  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const urlTab = params.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(urlTab ?? "readiness");

  const switchTab = (t: Tab) => {
    setTab(t);
    navigate(`/app/due-diligence?tab=${t}`, { replace: true });
  };

  return (
    <AppLayout showHero={false}>
      <div className="dd-hub">
        <div className="dd-hub__header">
          <h1 className="dd-hub__title">Due Diligence</h1>
          <p className="dd-hub__sub">Readiness diagnostic · Full checklist · Data room prep · Year-end review</p>
        </div>

        <Link href="/app/pitch-deck-analysis" data-testid="link-pitch-analysis-banner">
          <div className="dd-pitch-banner">
            <div className="dd-pitch-banner__icon">🎯</div>
            <div className="dd-pitch-banner__body">
              <div className="dd-pitch-banner__title">AI Pitch Deck Analysis</div>
              <div className="dd-pitch-banner__desc">Upload your pitch deck for MBB-style scoring across 3 evaluator perspectives (VC, Consulting, Operator), risk mapping, and professional PDF report download.</div>
            </div>
            <div className="dd-pitch-banner__cta">Analyse Deck →</div>
          </div>
        </Link>

        <div className="dd-hub__tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`dd-hub__tab ${tab === t.id ? "dd-hub__tab--on" : ""}`}
              onClick={() => switchTab(t.id)}
            >
              <span className="dd-hub__tab-icon">{t.icon}</span>
              <div>
                <div className="dd-hub__tab-label">{t.label}</div>
                <div className="dd-hub__tab-desc">{t.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <DDTabContent tab={tab} />
          </motion.div>
        </AnimatePresence>

        <style>{ddStyles}</style>
      </div>
    </AppLayout>
  );
}

function DDTabContent({ tab }: { tab: Tab }) {
  if (tab === "readiness") return <ReadinessTab />;
  if (tab === "checklist") return <FullChecklistTab />;
  if (tab === "data-room") return <DataRoomTab />;
  if (tab === "eoy") return <EOYTab />;
  return null;
}

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, { credentials: "include", ...opts });
}

function useChecklist(type: string) {
  return useQuery({
    queryKey: ["/api/checklists", type],
    queryFn: () => apiFetch(`/api/checklists/${type}`).then(r => r.json()),
  });
}

function useSaveChecklist(type: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch(`/api/checklists/${type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/checklists", type] }),
  });
}

const DIAGNOSTIC_QUESTIONS = [
  { id: "d-legal-1",  category: "Legal",     question: "Has the company completed a Delaware C-Corp or equivalent incorporation?", weight: 2 },
  { id: "d-legal-2",  category: "Legal",     question: "Are all co-founder agreements, IP assignments, and vesting schedules signed?", weight: 3 },
  { id: "d-legal-3",  category: "Legal",     question: "Is the cap table clean with no unresolved convertible instruments?", weight: 3 },
  { id: "d-legal-4",  category: "Legal",     question: "Are there any pending lawsuits, claims, or regulatory issues?", weight: 2 },
  { id: "d-fin-1",    category: "Financial", question: "Does the company have audited or reviewed financials for the last 2 fiscal years?", weight: 2 },
  { id: "d-fin-2",    category: "Financial", question: "Are there clean bank statements and reconciled accounts?", weight: 2 },
  { id: "d-fin-3",    category: "Financial", question: "Has the company prepared investor-ready financial projections (3–5 years)?", weight: 1 },
  { id: "d-team-1",   category: "Team",      question: "Do all founders have signed employment or advisory agreements?", weight: 3 },
  { id: "d-team-2",   category: "Team",      question: "Are all key employees on standard offer letters with IP assignment clauses?", weight: 2 },
  { id: "d-team-3",   category: "Team",      question: "Is there a documented organizational chart?", weight: 1 },
  { id: "d-prod-1",   category: "Product",   question: "Is core IP (patents, trademarks, or trade secrets) documented and protected?", weight: 3 },
  { id: "d-prod-2",   category: "Product",   question: "Are there signed contracts with all technical vendors and SaaS providers?", weight: 2 },
  { id: "d-prod-3",   category: "Product",   question: "Is there a product roadmap with prioritized milestones?", weight: 1 },
  { id: "d-mkt-1",    category: "Market",    question: "Is there a documented go-to-market strategy with customer acquisition channels?", weight: 2 },
  { id: "d-mkt-2",    category: "Market",    question: "Are there signed LOIs or customer contracts demonstrating traction?", weight: 3 },
  { id: "d-mkt-3",    category: "Market",    question: "Is there a competitive analysis with differentiation clearly stated?", weight: 1 },
  { id: "d-data-1",   category: "Data",      question: "Does the company have GDPR/CCPA compliant data handling policies?", weight: 2 },
];

const READINESS_LABELS = ["Not ready", "Early stage", "Progressing", "Nearly ready", "DD ready"];

function ReadinessTab() {
  const { data: saved, isLoading } = useChecklist("dd-readiness");
  const { mutate: save } = useSaveChecklist("dd-readiness");
  const { toast } = useToast();

  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    save(next);
  };

  const categories = [...new Set(DIAGNOSTIC_QUESTIONS.map(q => q.category))];
  const totalWeight = DIAGNOSTIC_QUESTIONS.reduce((a, q) => a + q.weight, 0);
  const earnedWeight = DIAGNOSTIC_QUESTIONS.filter(q => checked[q.id]).reduce((a, q) => a + q.weight, 0);
  const pct = Math.round((earnedWeight / totalWeight) * 100);
  const labelIdx = Math.floor(pct / 25);

  if (isLoading) return <div className="dd-loading">Loading…</div>;

  return (
    <div className="dd-section">
      <div className="dd-score-card">
        <div className="dd-score-card__left">
          <p className="dd-score-card__label">DD Readiness</p>
          <p className="dd-score-card__val" style={{ color: pct >= 80 ? "#22c55e" : pct >= 50 ? "#c8aa82" : "#ef4444" }}>{pct}%</p>
          <p className="dd-score-card__status">{READINESS_LABELS[Math.min(labelIdx, 4)]}</p>
        </div>
        <div className="dd-score-card__bar-wrap">
          <div className="dd-score-card__bar">
            <div className="dd-score-card__fill" style={{ width: `${pct}%`, background: pct >= 80 ? "#22c55e" : pct >= 50 ? "#c8aa82" : "#ef4444" }} />
          </div>
          <p className="dd-score-card__note">{earnedWeight}/{totalWeight} weighted points</p>
        </div>
      </div>

      {categories.map(cat => (
        <div key={cat} className="dd-category">
          <h3 className="dd-category__title">{cat}</h3>
          <div className="dd-items">
            {DIAGNOSTIC_QUESTIONS.filter(q => q.category === cat).map(q => (
              <label key={q.id} className="dd-item">
                <input
                  type="checkbox"
                  checked={!!checked[q.id]}
                  onChange={() => toggle(q.id)}
                  style={{ accentColor: "#8e84f7" }}
                />
                <span className="dd-item__text">{q.question}</span>
                <span className={`dd-item__weight ${q.weight === 3 ? "critical" : q.weight === 2 ? "important" : "nice"}`}>
                  {q.weight === 3 ? "Critical" : q.weight === 2 ? "Important" : "Nice to have"}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const DD_CHECKLIST_SECTIONS = [
  {
    id: "corp",
    title: "Corporate Structure",
    items: [
      { id: "c1", label: "Certificate of Incorporation (Delaware C-Corp)", priority: "high" },
      { id: "c2", label: "Bylaws, as amended", priority: "high" },
      { id: "c3", label: "Stockholder agreements", priority: "high" },
      { id: "c4", label: "Board meeting minutes (all)", priority: "medium" },
      { id: "c5", label: "Foreign qualification documents", priority: "low" },
    ],
  },
  {
    id: "founder",
    title: "Founder Stock",
    items: [
      { id: "f1", label: "Founder stock purchase agreements (all founders)", priority: "high" },
      { id: "f2", label: "Restricted stock agreements with vesting schedules", priority: "high" },
      { id: "f3", label: "Founder IP assignment agreements", priority: "high" },
      { id: "f4", label: "83(b) elections (if applicable)", priority: "medium" },
    ],
  },
  {
    id: "options",
    title: "Option Plan",
    items: [
      { id: "o1", label: "Equity incentive plan (as adopted by board)", priority: "high" },
      { id: "o2", label: "All option grant notices and agreements", priority: "high" },
      { id: "o3", label: "Option exercise notices (if any)", priority: "medium" },
    ],
  },
  {
    id: "captable",
    title: "Cap Table",
    items: [
      { id: "ct1", label: "Fully diluted cap table (current)", priority: "high" },
      { id: "ct2", label: "All SAFE/convertible note agreements", priority: "high" },
      { id: "ct3", label: "Warrant agreements (if any)", priority: "medium" },
      { id: "ct4", label: "409A valuation report", priority: "medium" },
    ],
  },
  {
    id: "board",
    title: "Board Consents",
    items: [
      { id: "b1", label: "All written consents of the board (last 3 years)", priority: "high" },
      { id: "b2", label: "Observer rights agreements", priority: "low" },
      { id: "b3", label: "Board committee charters (if any)", priority: "low" },
    ],
  },
  {
    id: "litigation",
    title: "Litigation & Regulatory",
    items: [
      { id: "l1", label: "List of all pending or threatened claims/litigation", priority: "high" },
      { id: "l2", label: "Regulatory correspondence (FDA, FCC, etc.)", priority: "high" },
      { id: "l3", label: "Any settlement agreements", priority: "medium" },
    ],
  },
  {
    id: "securities",
    title: "Securities Law",
    items: [
      { id: "s1", label: "SEC exemption filings (Form D, state blue sky)", priority: "high" },
      { id: "s2", label: "Accredited investor representations from all investors", priority: "high" },
    ],
  },
  {
    id: "ip",
    title: "IP Assignment",
    items: [
      { id: "ip1", label: "IP assignment agreements from all founders, employees, contractors", priority: "high" },
      { id: "ip2", label: "Open source software audit (any copyleft licenses?)", priority: "medium" },
      { id: "ip3", label: "Third-party IP licenses (in-bound and out-bound)", priority: "medium" },
    ],
  },
  {
    id: "contracts",
    title: "Key Contracts",
    items: [
      { id: "k1", label: "Top 10 customer contracts", priority: "high" },
      { id: "k2", label: "Key vendor / supplier agreements", priority: "medium" },
      { id: "k3", label: "Office lease or property agreements", priority: "low" },
      { id: "k4", label: "Insurance policies (D&O, E&O, general liability)", priority: "medium" },
      { id: "k5", label: "Banking and credit facility agreements", priority: "medium" },
    ],
  },
];

function FullChecklistTab() {
  const { data: saved, isLoading } = useChecklist("dd-checklist");
  const { mutate: save } = useSaveChecklist("dd-checklist");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set(DD_CHECKLIST_SECTIONS.map(s => s.id)));

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    save(next);
  };

  const allItems = DD_CHECKLIST_SECTIONS.flatMap(s => s.items);
  const total = allItems.length;
  const done = allItems.filter(i => checked[i.id]).length;
  const pct = Math.round((done / total) * 100);

  if (isLoading) return <div className="dd-loading">Loading…</div>;

  return (
    <div className="dd-section">
      <div className="dd-progress-header">
        <span className="dd-progress-label">{done}/{total} items complete</span>
        <div className="dd-progress-bar">
          <div className="dd-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="dd-progress-pct">{pct}%</span>
      </div>

      {DD_CHECKLIST_SECTIONS.map(section => {
        const sectionDone = section.items.filter(i => checked[i.id]).length;
        const isExpanded = expanded.has(section.id);
        return (
          <div key={section.id} className="dd-category">
            <button
              className="dd-category__toggle"
              onClick={() => setExpanded(p => {
                const n = new Set(p);
                n.has(section.id) ? n.delete(section.id) : n.add(section.id);
                return n;
              })}
            >
              <h3 className="dd-category__title">{section.title}</h3>
              <span className="dd-category__count">{sectionDone}/{section.items.length}</span>
              <span style={{ marginLeft: "auto", color: "rgba(255,255,255,.3)", fontSize: 12 }}>{isExpanded ? "▲" : "▼"}</span>
            </button>
            {isExpanded && (
              <div className="dd-items">
                {section.items.map(item => (
                  <label key={item.id} className="dd-item">
                    <input
                      type="checkbox"
                      checked={!!checked[item.id]}
                      onChange={() => toggle(item.id)}
                      style={{ accentColor: "#8e84f7" }}
                    />
                    <span className="dd-item__text">{item.label}</span>
                    <span className={`dd-item__weight ${item.priority}`}>
                      {item.priority === "high" ? "High" : item.priority === "medium" ? "Medium" : "Low"}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const FUND_I_SECTIONS = [
  { id: "story",   title: "The Fund's Story",    icon: "📖", items: ["Fund Pitch Deck", "Fund Narrative Memo", "Track Record Summary"] },
  { id: "access",  title: "Access to Deals",     icon: "🔗", items: ["Deal sourcing strategy doc", "Pipeline / deal log", "Portfolio company list"] },
  { id: "decision",title: "Decision Making",     icon: "⚖️",  items: ["Investment Memo template", "Investment Committee docs", "Risk management framework"] },
  { id: "finance", title: "Financials",          icon: "💰", items: ["Audited fund financials", "Management fee schedule", "LP distribution schedule"] },
  { id: "legal",   title: "Legal",               icon: "📜", items: ["Limited Partnership Agreement", "Subscription documents", "Side letter templates"] },
  { id: "lp",      title: "LP Communications",   icon: "📨", items: ["Quarterly LP reports (last 4)", "Annual LP report", "Advisory board minutes"] },
];

const FUND_II_EXTRA = [
  { id: "prior",  title: "Prior Fund Performance", icon: "📈", items: ["DPI, TVPI, IRR by vintage", "Portfolio company updates", "Full realized/unrealized breakdown"] },
  { id: "testi",  title: "LP Testimonials",        icon: "⭐", items: ["Reference list (3–5 LPs)", "Written testimonials or quotes", "Key LP re-up letters"] },
  { id: "biz-ops",title: "Business Operations",    icon: "🏢", items: ["Org chart & team bios", "Back-office vendor list", "Compliance policies"] },
];

function DataRoomTab() {
  const { data: savedEM, isLoading: loadEM } = useChecklist("data-room-em");
  const { data: savedF2, isLoading: loadF2 } = useChecklist("data-room-fund2");
  const { mutate: saveEM } = useSaveChecklist("data-room-em");
  const { mutate: saveF2 } = useSaveChecklist("data-room-fund2");

  const [mode, setMode] = useState<"em" | "f2">("em");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const sections = mode === "em" ? FUND_I_SECTIONS : [...FUND_I_SECTIONS, ...FUND_II_EXTRA];
  const allItems = sections.flatMap(s => s.items.map((label, i) => ({ id: `${s.id}-${i}`, label })));
  const done = allItems.filter(i => checked[i.id]).length;
  const pct = Math.round((done / allItems.length) * 100);

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    mode === "em" ? saveEM(next) : saveF2(next);
  };

  if (loadEM || loadF2) return <div className="dd-loading">Loading…</div>;

  return (
    <div className="dd-section">
      <div className="dd-mode-toggle">
        <button className={`dd-mode-btn ${mode === "em" ? "dd-mode-btn--on" : ""}`} onClick={() => setMode("em")}>
          Emerging Manager / Fund I
        </button>
        <button className={`dd-mode-btn ${mode === "f2" ? "dd-mode-btn--on" : ""}`} onClick={() => setMode("f2")}>
          Fund II+
        </button>
      </div>

      <div className="dd-progress-header">
        <span className="dd-progress-label">{done}/{allItems.length} items complete</span>
        <div className="dd-progress-bar">
          <div className="dd-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="dd-progress-pct">{pct}%</span>
      </div>

      {sections.map(section => (
        <div key={section.id} className="dd-category">
          <h3 className="dd-category__title">{section.icon} {section.title}</h3>
          <div className="dd-items">
            {section.items.map((label, i) => {
              const id = `${section.id}-${i}`;
              return (
                <label key={id} className="dd-item">
                  <input
                    type="checkbox"
                    checked={!!checked[id]}
                    onChange={() => toggle(id)}
                    style={{ accentColor: "#8e84f7" }}
                  />
                  <span className="dd-item__text">{label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const EOY_SECTIONS = [
  {
    id: "story",
    title: "Story of the Year",
    items: [
      { id: "story-summary", label: "Write a 2–3 sentence summary of the fund's year", type: "textarea" },
    ],
  },
  {
    id: "portfolio",
    title: "Portfolio Updates",
    items: [
      { id: "port-updates",   label: "Have all portfolio companies submitted updates?", type: "checkbox" },
      { id: "port-status",    label: "Has each company's status (active/inactive) been confirmed?", type: "checkbox" },
      { id: "port-valuation", label: "Has valuation policy been applied consistently?", type: "checkbox" },
    ],
  },
  {
    id: "stats",
    title: "Key Stats",
    items: [
      { id: "stats-deals",    label: "Total deals made this year", type: "number" },
      { id: "stats-active",   label: "Active portfolio companies", type: "number" },
      { id: "stats-nav",      label: "Current NAV ($M)", type: "number" },
      { id: "stats-moic",     label: "Blended MOIC (×)", type: "number" },
      { id: "stats-tvpi",     label: "TVPI", type: "number" },
      { id: "stats-dpi",      label: "DPI", type: "number" },
    ],
  },
  {
    id: "pacing",
    title: "Pacing Review",
    items: [
      { id: "pacing-model",       label: "Has the deployment model been updated?", type: "checkbox" },
      { id: "pacing-on-pace",     label: "Are we on pace for fund deployment?", type: "text" },
      { id: "pacing-2025-deals",  label: "Target deals for next year", type: "number" },
    ],
  },
  {
    id: "docs",
    title: "Document Review",
    items: [
      { id: "docs-executed",  label: "All investment documents executed and filed?", type: "checkbox" },
      { id: "docs-board",     label: "Board consents filed for all investments?", type: "checkbox" },
      { id: "docs-lp-report", label: "Annual LP report drafted?", type: "checkbox" },
    ],
  },
  {
    id: "service",
    title: "Service Provider Check-ins",
    items: [
      { id: "svc-lawyer",  label: "Fund counsel review completed?", type: "checkbox" },
      { id: "svc-auditor", label: "Audit firm engaged for next cycle?", type: "checkbox" },
      { id: "svc-admin",   label: "Fund administrator updated?", type: "checkbox" },
    ],
  },
];

function EOYTab() {
  const { data: saved, isLoading } = useChecklist("eoy-review");
  const { mutate: save } = useSaveChecklist("eoy-review");
  const [values, setValues] = useState<Record<string, any>>({});

  const setValue = (id: string, val: any) => {
    const next = { ...values, [id]: val };
    setValues(next);
    save(next);
  };

  const allCheckboxes = EOY_SECTIONS.flatMap(s => s.items.filter(i => i.type === "checkbox"));
  const done = allCheckboxes.filter(i => values[i.id]).length;
  const pct = Math.round((done / allCheckboxes.length) * 100);

  if (isLoading) return <div className="dd-loading">Loading…</div>;

  return (
    <div className="dd-section">
      <div className="dd-progress-header">
        <span className="dd-progress-label">Checkbox progress: {done}/{allCheckboxes.length}</span>
        <div className="dd-progress-bar">
          <div className="dd-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="dd-progress-pct">{pct}%</span>
      </div>

      {EOY_SECTIONS.map(section => (
        <div key={section.id} className="dd-category">
          <h3 className="dd-category__title">{section.title}</h3>
          <div className="dd-items">
            {section.items.map(item => (
              <div key={item.id} className="dd-eoy-item">
                {item.type === "checkbox" ? (
                  <label className="dd-item">
                    <input
                      type="checkbox"
                      checked={!!values[item.id]}
                      onChange={e => setValue(item.id, e.target.checked)}
                      style={{ accentColor: "#8e84f7" }}
                    />
                    <span className="dd-item__text">{item.label}</span>
                  </label>
                ) : item.type === "textarea" ? (
                  <div className="dd-field">
                    <label className="dd-field__label">{item.label}</label>
                    <textarea
                      className="dd-field__input dd-field__input--ta"
                      rows={3}
                      value={values[item.id] ?? ""}
                      onChange={e => setValue(item.id, e.target.value)}
                      placeholder="Write here…"
                    />
                  </div>
                ) : item.type === "number" ? (
                  <div className="dd-field dd-field--inline">
                    <label className="dd-field__label">{item.label}</label>
                    <input
                      type="number"
                      className="dd-field__input dd-field__input--num"
                      value={values[item.id] ?? ""}
                      onChange={e => setValue(item.id, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                ) : (
                  <div className="dd-field dd-field--inline">
                    <label className="dd-field__label">{item.label}</label>
                    <input
                      type="text"
                      className="dd-field__input"
                      value={values[item.id] ?? ""}
                      onChange={e => setValue(item.id, e.target.value)}
                      placeholder="Enter value…"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const ddStyles = `
.dd-hub{padding:28px 32px;font-family:'DM Sans',sans-serif;min-height:100vh;color:#fff}
@media(max-width:768px){.dd-hub{padding:16px}}
.dd-hub__header{margin-bottom:20px}
.dd-hub__title{font-family:'Outfit',sans-serif;font-size:26px;font-weight:700;margin:0 0 4px;letter-spacing:-.5px}
.dd-hub__sub{font-size:13px;color:rgba(255,255,255,.38);margin:0}

.dd-hub__tabs{display:flex;gap:10px;margin-bottom:28px;flex-wrap:wrap}
.dd-hub__tab{display:flex;align-items:center;gap:12px;padding:14px 18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:14px;cursor:pointer;transition:all .18s;text-align:left;flex:1;min-width:160px}
.dd-hub__tab--on{background:rgba(142,132,247,.1);border-color:#8e84f7}
.dd-hub__tab:hover:not(.dd-hub__tab--on){border-color:rgba(255,255,255,.2)}
.dd-hub__tab-icon{font-size:20px;flex-shrink:0}
.dd-hub__tab-label{font-size:13px;font-weight:600;color:#fff;display:block;margin-bottom:2px}
.dd-hub__tab-desc{font-size:11px;color:rgba(255,255,255,.38)}
@media(max-width:640px){.dd-hub__tab{min-width:calc(50% - 5px)}}

.dd-section{display:flex;flex-direction:column;gap:16px}
.dd-loading{padding:40px;text-align:center;color:rgba(255,255,255,.3);font-size:14px}

.dd-score-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:20px;display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.dd-score-card__left{flex-shrink:0}
.dd-score-card__label{font-size:12px;color:rgba(255,255,255,.4);margin:0 0 4px}
.dd-score-card__val{font-family:'Outfit',sans-serif;font-size:36px;font-weight:700;margin:0;line-height:1}
.dd-score-card__status{font-size:12px;color:rgba(255,255,255,.5);margin:4px 0 0}
.dd-score-card__bar-wrap{flex:1;min-width:200px}
.dd-score-card__bar{height:8px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden;margin-bottom:8px}
.dd-score-card__fill{height:100%;border-radius:4px;transition:width .6s ease}
.dd-score-card__note{font-size:12px;color:rgba(255,255,255,.35);margin:0}

.dd-progress-header{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.dd-progress-label{font-size:12px;color:rgba(255,255,255,.4);flex-shrink:0}
.dd-progress-bar{flex:1;height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}
.dd-progress-fill{height:100%;background:#8e84f7;border-radius:3px;transition:width .4s ease}
.dd-progress-pct{font-size:12px;font-weight:600;color:#8e84f7;flex-shrink:0;min-width:36px;text-align:right}

.dd-category{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px;overflow:hidden}
.dd-category__toggle{display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;cursor:pointer;padding:0;margin-bottom:12px}
.dd-category__title{font-size:14px;font-weight:600;color:rgba(255,255,255,.85);margin:0}
.dd-category__count{font-size:11px;padding:2px 8px;background:rgba(142,132,247,.12);border:1px solid rgba(142,132,247,.2);border-radius:20px;color:#c4bef7;flex-shrink:0}

.dd-items{display:flex;flex-direction:column;gap:8px}
.dd-item{display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:6px 8px;border-radius:8px;transition:background .15s}
.dd-item:hover{background:rgba(255,255,255,.03)}
.dd-item__text{font-size:13px;color:rgba(255,255,255,.7);flex:1;line-height:1.4}
.dd-item__weight{font-size:10px;padding:2px 7px;border-radius:20px;flex-shrink:0;font-weight:500}
.dd-item__weight.critical{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#f87171}
.dd-item__weight.important{background:rgba(200,170,130,.1);border:1px solid rgba(200,170,130,.2);color:#c8aa82}
.dd-item__weight.nice{background:rgba(142,132,247,.08);border:1px solid rgba(142,132,247,.15);color:#a8a0f0}
.dd-item__weight.high{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#f87171}
.dd-item__weight.medium{background:rgba(200,170,130,.1);border:1px solid rgba(200,170,130,.2);color:#c8aa82}
.dd-item__weight.low{background:rgba(142,132,247,.08);border:1px solid rgba(142,132,247,.15);color:#a8a0f0}

.dd-mode-toggle{display:flex;gap:8px;margin-bottom:20px}
.dd-mode-btn{padding:8px 18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:rgba(255,255,255,.5);font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.dd-mode-btn--on{background:rgba(142,132,247,.14);border-color:#8e84f7;color:#c4bef7}

.dd-eoy-item{padding:4px 0}
.dd-field{display:flex;flex-direction:column;gap:6px}
.dd-field--inline{flex-direction:row;align-items:center;gap:12px}
.dd-field__label{font-size:13px;color:rgba(255,255,255,.6);flex:1;min-width:200px}
.dd-field__input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;padding:8px 12px;width:100%;transition:border-color .18s}
.dd-field__input:focus{border-color:rgba(142,132,247,.5)}
.dd-field__input::placeholder{color:rgba(255,255,255,.2)}
.dd-field__input--ta{resize:none;line-height:1.5}
.dd-field__input--num{width:100px;flex-shrink:0}

.dd-pitch-banner{display:flex;align-items:center;gap:20px;padding:20px 24px;background:linear-gradient(135deg,rgba(142,132,247,.14) 0%,rgba(196,227,230,.08) 100%);border:1px solid rgba(142,132,247,.3);border-radius:14px;cursor:pointer;transition:all .2s;margin-bottom:8px;text-decoration:none}
.dd-pitch-banner:hover{background:linear-gradient(135deg,rgba(142,132,247,.22) 0%,rgba(196,227,230,.14) 100%);border-color:rgba(142,132,247,.5);transform:translateY(-1px)}
.dd-pitch-banner__icon{font-size:32px;flex-shrink:0;line-height:1}
.dd-pitch-banner__body{flex:1;min-width:0}
.dd-pitch-banner__title{font-size:16px;font-weight:600;color:#fff;margin:0 0 4px;letter-spacing:-.01em}
.dd-pitch-banner__desc{font-size:13px;color:rgba(255,255,255,.5);margin:0;line-height:1.5}
.dd-pitch-banner__cta{font-size:13px;font-weight:600;color:#8e84f7;white-space:nowrap;flex-shrink:0;padding:8px 16px;background:rgba(142,132,247,.12);border:1px solid rgba(142,132,247,.25);border-radius:8px;transition:all .2s}
.dd-pitch-banner:hover .dd-pitch-banner__cta{background:rgba(142,132,247,.2);border-color:rgba(142,132,247,.4)}
`;
