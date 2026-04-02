/**
 * client/src/pages/OnboardingPage.tsx  — v3 (Fund Manager extension)
 *
 * Three onboarding flows:
 *
 *   FOUNDER        (existing, 6 steps — carried over from v2)
 *   INVESTOR       (existing, 5 steps — upgraded with LP matching fields)
 *   FUND_MANAGER   (NEW) — VC / PE / Venture Studio raising Fund I–IV from LPs
 *     Step 1: Role selection
 *     Step 2: Fund basics (name, vintage, fund number, strategy)
 *     Step 3: Investment thesis (verticals, horizontals, stage, geography)
 *     Step 4: Team (GP bios, LinkedIn, track record)
 *     Step 5: Fund terms (target size, min commitment, LP types sought)
 *     Step 6: Pitch materials (deck upload, DDQ, data room)
 *     Step 7: LP matching prefs + launch
 *
 * The fund manager flow feeds:
 *   - investmentFirms table (fund details, strategy)
 *   - investors table (LP matching preferences, team data)
 *   - LP matchmaking engine (fund_manager mode)
 *   - DealFlowPage pipeline (auto-creates LP pipeline)
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "founder" | "investor" | "fund_manager";

type FundData = {
  // Step 2 — Fund basics
  fundName: string;
  fundNumber: string;         // "Fund I" | "Fund II" | etc
  fundVintage: string;        // Year
  firmWebsite: string;
  firmHQ: string;
  strategy: string;           // "Venture" | "Growth" | "PE" | "Venture Studio" | "Rolling Fund"
  // Step 3 — Investment thesis
  verticals: string[];        // Deep industry focus (FinTech, HealthTech…)
  horizontals: string[];      // Cross-cutting themes (AI, Climate, B2B SaaS…)
  stages: string[];           // Pre-Seed, Seed, Series A…
  geographies: string[];
  investmentThesis: string;   // Free text thesis
  avgCheckSize: string;
  portfolioSize: string;      // Target # of portfolio companies
  // Step 4 — Team
  gpName: string;
  gpLinkedin: string;
  gpBio: string;
  teamSize: string;
  trackRecord: string;        // Prior fund returns / notable investments
  // Step 5 — Fund terms
  fundTargetSize: string;
  minCommitment: string;
  lpTypesTarget: string[];
  fundLife: string;           // "10 years", "7 years + 2 extensions"
  managementFee: string;      // "2%"
  carry: string;              // "20%"
  hurdleRate: string;         // "8%"
  // Step 6 — Materials
  pitchDeckUrl?: string;
  ddqUrl?: string;
  // Step 7 — LP matching
  targetLPGeographies: string[];
  lpCommitmentTarget: string;
  existingLPs: string;        // Prior fund LP names (optional)
  preferExistingLPs: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FUND_STRATEGIES = ["Venture", "Growth Equity", "Private Equity", "Venture Studio", "Rolling Fund", "SPV", "Fund of Funds"];
const FUND_NUMBERS = ["Fund I", "Fund II", "Fund III", "Fund IV", "Fund V+"];
const FUND_STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth", "All stages"];
const FUND_SIZES = ["< $10M", "$10M – $50M", "$50M – $100M", "$100M – $250M", "$250M – $500M", "$500M+"];
const MIN_COMMITMENTS = ["$100K", "$250K", "$500K", "$1M", "$2.5M", "$5M", "$10M+"];
const FUND_LIVES = ["5 years", "7 years", "10 years", "10 + 2", "Evergreen"];
const LP_TYPES_SOUGHT = ["Family Office", "Endowment", "Foundation", "Pension Fund", "Fund of Funds", "HNWI", "Corporate LP", "Government / Sovereign", "University Endowment"];
const VERTICALS = ["FinTech", "HealthTech / MedTech", "AI / Machine Learning", "SaaS / B2B", "Consumer Tech", "CleanTech", "EdTech", "Real Estate / PropTech", "Entertainment / Film", "Sports / Esports", "DeepTech", "E-commerce", "Cybersecurity", "Web3", "BioTech"];
const HORIZONTALS = ["AI-first", "Climate / Net Zero", "Future of Work", "Developer Tools", "Open Source", "API Economy", "Marketplace", "Vertical SaaS", "Embedded Finance", "Web3 / DeFi", "Digital Health", "Creator Economy"];
const GEOGRAPHIES = ["USA – National", "USA – East Coast", "USA – West Coast", "Europe – UK", "Europe – DACH", "Europe – Nordics", "Europe – Benelux", "Europe – Southern", "MENA / UAE", "Southeast Asia", "Asia Pacific", "Latin America", "Global / Agnostic"];

// ─── Shared sub-components ────────────────────────────────────────────────────

function PillMulti({ options, selected, onToggle, max, cols = 3 }: { options: string[]; selected: string[]; onToggle: (v: string) => void; max?: number; cols?: number }) {
  return (
    <div className="pills" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {options.map(opt => {
        const on = selected.includes(opt);
        const disabled = !on && max !== undefined && selected.length >= max;
        return (
          <button key={opt} type="button" disabled={disabled}
            className={`pill ${on ? "pill--on" : ""} ${disabled ? "pill--dim" : ""}`}
            onClick={() => onToggle(opt)}
          >{opt}</button>
        );
      })}
    </div>
  );
}

function PillSingle({ options, selected, onSelect }: { options: string[]; selected: string; onSelect: (v: string) => void }) {
  return (
    <div className="pills">
      {options.map(opt => (
        <button key={opt} type="button" className={`pill ${selected === opt ? "pill--on" : ""}`} onClick={() => onSelect(opt)}>{opt}</button>
      ))}
    </div>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="ob-field">
      <div className="ob-field__top"><label className="ob-label">{label}</label>{hint && <span className="ob-hint">{hint}</span>}</div>
      {children}
    </div>
  );
}

function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input className="ob-input" {...props} />; }
function Txa(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className="ob-textarea" rows={3} {...props} />; }

function Step({ emoji, title, sub, children }: { emoji: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }}>
      <div className="ob-step-hdr">
        <span className="ob-step-emoji">{emoji}</span>
        <h2 className="ob-step-title">{title}</h2>
        <p className="ob-step-sub">{sub}</p>
      </div>
      {children}
    </motion.div>
  );
}

function Nav({ onBack, onNext, onFinish, canNext = true, isFirst = false, isLast = false, isLoading = false }: { onBack?: () => void; onNext?: () => void; onFinish?: () => void; canNext?: boolean; isFirst?: boolean; isLast?: boolean; isLoading?: boolean }) {
  return (
    <div className="ob-nav">
      {!isFirst && <button type="button" className="ob-btn-back" onClick={onBack}>← Back</button>}
      <motion.button type="button" whileHover={canNext ? { scale: 1.01 } : {}} whileTap={canNext ? { scale: 0.99 } : {}}
        className="ob-btn-next" disabled={!canNext || isLoading}
        onClick={isLast ? onFinish : onNext}>
        {isLoading ? <span className="ob-spinner" /> : isLast ? "Launch my platform 🎉" : "Continue →"}
      </motion.button>
    </div>
  );
}

function Progress({ step, total, role }: { step: number; total: number; role: Role | null }) {
  const pct = total > 1 ? ((step - 1) / (total - 1)) * 100 : 100;
  const roleLabel = { founder: "🚀 Founder", investor: "💎 Investor", fund_manager: "🏦 Fund Manager" }[role ?? "founder"] ?? "";
  return (
    <div className="ob-progress">
      <div className="ob-progress__meta"><span className="ob-progress__role">{roleLabel}</span><span className="ob-progress__step">Step {step} of {total}</span></div>
      <div className="ob-progress__track"><motion.div className="ob-progress__fill" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: "easeInOut" }} /></div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState(1);

  // Fund manager state
  const [fd, setFd] = useState<Partial<FundData>>({
    verticals: [], horizontals: [], stages: [], geographies: [],
    lpTypesTarget: [], targetLPGeographies: [], preferExistingLPs: false,
  });
  const updFd = (p: Partial<FundData>) => setFd(f => ({ ...f, ...p }));
  const toggle = <T extends string>(arr: T[], val: T): T[] => arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];

  const totalSteps = role === "fund_manager" ? 7 : role === "founder" ? 6 : 5;

  const canContinue = (): boolean => {
    if (role === "fund_manager") {
      if (step === 2) return !!(fd.fundName && fd.strategy && fd.fundNumber);
      if (step === 3) return (fd.verticals?.length ?? 0) > 0 && (fd.stages?.length ?? 0) > 0;
      if (step === 4) return !!(fd.gpName && fd.gpLinkedin);
      if (step === 5) return !!(fd.fundTargetSize && fd.minCommitment);
      if (step === 7) return (fd.targetLPGeographies?.length ?? 0) > 0;
    }
    return true;
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/onboarding/fund-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fd),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/app/fundraise");
    },
  });

  return (
    <div className="ob-page">
      <div className="ob-bg"><div className="ob-orb ob-orb--1" /><div className="ob-orb ob-orb--2" /><div className="ob-grid" /></div>
      <div className="ob-container">
        <div className="ob-header">
          <div className="ob-logo"><span className="ob-logo__anchor">⚓</span><span className="ob-logo__name">Anker</span></div>
          {role && <Progress step={step} total={totalSteps} role={role} />}
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="ob-card">
          <AnimatePresence mode="wait">

            {/* STEP 1: Role selection — all three roles */}
            {step === 1 && (
              <Step key="role" emoji="👋" title="Welcome to Anker" subtitle="How are you using the platform?">
                <div className="role-grid-3">
                  {[
                    { v: "founder" as Role, emoji: "🚀", label: "Startup Founder", desc: "Raising capital from VCs, angels, and family offices.", bullets: ["AI investor matching", "Pitch deck analysis", "Deal flow tracking", "Financial tools"] },
                    { v: "investor" as Role, emoji: "💎", label: "Investor", desc: "VC, family office, or angel deploying capital into startups.", bullets: ["Curated deal flow", "Deep research & enrichment", "CRM sync (Folk)", "Portfolio analytics"] },
                    { v: "fund_manager" as Role, emoji: "🏦", label: "Fund Manager", desc: "VC / PE / Venture Studio raising Fund I–IV from LPs.", bullets: ["LP matchmaking engine", "LP pipeline & deal memos", "LP outreach sequences", "Investor relations tools"] },
                  ].map(r => (
                    <motion.button key={r.v} type="button" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                      onClick={() => setRole(r.v)}
                      className={`role-card ${role === r.v ? "role-card--selected" : ""}`}>
                      <div className="role-card__top">
                        <span className="role-card__emoji">{r.emoji}</span>
                        <div><p className="role-card__label">{r.label}</p><p className="role-card__desc">{r.desc}</p></div>
                        {role === r.v && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="role-card__check">✓</motion.span>}
                      </div>
                      <ul className="role-card__bullets">{r.bullets.map(b => <li key={b}><span className="role-bullet">◆</span>{b}</li>)}</ul>
                    </motion.button>
                  ))}
                </div>
                <Nav onNext={() => setStep(2)} canNext={!!role} isFirst nextLabel={role ? `Continue as ${role === "fund_manager" ? "Fund Manager" : role} →` : "Select a role to continue"} />
              </Step>
            )}

            {/* ══════════════════════════════════
                FUND MANAGER STEPS
            ══════════════════════════════════ */}

            {role === "fund_manager" && (
              <>
                {step === 2 && (
                  <Step key="fm2" emoji="🏦" title="Tell us about your fund" subtitle="This appears on your LP-facing profile and drives LP matching">
                    <div className="ob-field-grid">
                      <F label="Fund / firm name *"><Inp placeholder="e.g. Horizon Ventures" value={fd.fundName ?? ""} onChange={e => updFd({ fundName: e.target.value })} /></F>
                      <F label="Fund number *"><PillSingle options={FUND_NUMBERS} selected={fd.fundNumber ?? ""} onSelect={v => updFd({ fundNumber: v })} /></F>
                    </div>
                    <F label="Fund strategy *"><PillSingle options={FUND_STRATEGIES} selected={fd.strategy ?? ""} onSelect={v => updFd({ strategy: v })} /></F>
                    <div className="ob-field-grid">
                      <F label="Fund vintage year"><Inp type="number" placeholder="e.g. 2025" value={fd.fundVintage ?? ""} onChange={e => updFd({ fundVintage: e.target.value })} /></F>
                      <F label="Headquarters"><Inp placeholder="City, Country" value={fd.firmHQ ?? ""} onChange={e => updFd({ firmHQ: e.target.value })} /></F>
                    </div>
                    <F label="Website"><Inp type="url" placeholder="https://yourfirm.com" value={fd.firmWebsite ?? ""} onChange={e => updFd({ firmWebsite: e.target.value })} /></F>
                    <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} canNext={canContinue()} />
                  </Step>
                )}

                {step === 3 && (
                  <Step key="fm3" emoji="🎯" title="Investment thesis" subtitle="Precise thesis data powers the LP matchmaking engine — LPs filter by these">
                    <F label="Industry verticals *" hint="Core sectors (up to 5)">
                      <PillMulti options={VERTICALS} selected={fd.verticals ?? []} onToggle={v => updFd({ verticals: toggle(fd.verticals ?? [], v) })} max={5} />
                    </F>
                    <F label="Horizontal themes" hint="Cross-cutting investment themes (up to 4)">
                      <PillMulti options={HORIZONTALS} selected={fd.horizontals ?? []} onToggle={v => updFd({ horizontals: toggle(fd.horizontals ?? [], v) })} max={4} />
                    </F>
                    <F label="Investment stages *">
                      <PillMulti options={FUND_STAGES} selected={fd.stages ?? []} onToggle={v => updFd({ stages: toggle(fd.stages ?? [], v) })} />
                    </F>
                    <F label="Geographic focus *">
                      <PillMulti options={GEOGRAPHIES} selected={fd.geographies ?? []} onToggle={v => updFd({ geographies: toggle(fd.geographies ?? [], v) })} />
                    </F>
                    <F label="Investment thesis" hint="2–4 sentences — shown to LPs in match cards">
                      <Txa placeholder="e.g. We back technical founders building developer-first SaaS at Seed stage in Europe, writing $1–3M checks with board seats. We focus on companies with strong founder-market fit in underserved verticals…" value={fd.investmentThesis ?? ""} onChange={e => updFd({ investmentThesis: e.target.value })} rows={4} />
                    </F>
                    <div className="ob-field-grid">
                      <F label="Average check size"><Inp placeholder="e.g. $1M – $3M" value={fd.avgCheckSize ?? ""} onChange={e => updFd({ avgCheckSize: e.target.value })} /></F>
                      <F label="Target portfolio size"><Inp placeholder="e.g. 25 companies" value={fd.portfolioSize ?? ""} onChange={e => updFd({ portfolioSize: e.target.value })} /></F>
                    </div>
                    <Nav onBack={() => setStep(2)} onNext={() => setStep(4)} canNext={canContinue()} />
                  </Step>
                )}

                {step === 4 && (
                  <Step key="fm4" emoji="👥" title="GP team" subtitle="LPs invest in the team as much as the thesis — complete bios improve match quality">
                    <div className="ob-field-grid">
                      <F label="Lead GP name *"><Inp placeholder="Full name" value={fd.gpName ?? ""} onChange={e => updFd({ gpName: e.target.value })} /></F>
                      <F label="LinkedIn URL *"><Inp type="url" placeholder="linkedin.com/in/yourprofile" value={fd.gpLinkedin ?? ""} onChange={e => updFd({ gpLinkedin: e.target.value })} /></F>
                    </div>
                    <F label="GP bio" hint="250 words max — used in LP-facing materials">
                      <Txa placeholder="Career background, prior investments, domain expertise…" value={fd.gpBio ?? ""} onChange={e => updFd({ gpBio: e.target.value })} rows={5} />
                    </F>
                    <F label="Team size"><PillSingle options={["Solo GP", "2 GPs", "3–4 GPs", "5+ GPs"]} selected={fd.teamSize ?? ""} onSelect={v => updFd({ teamSize: v })} /></F>
                    <F label="Track record" hint="Prior fund returns, notable investments, or relevant experience">
                      <Txa placeholder="e.g. Prior fund returned 3.2x, notable exits include Acme ($180M Series C), FooCo (IPO 2024). Previously Partner at XYZ Ventures…" value={fd.trackRecord ?? ""} onChange={e => updFd({ trackRecord: e.target.value })} rows={3} />
                    </F>
                    <Nav onBack={() => setStep(3)} onNext={() => setStep(5)} canNext={canContinue()} />
                  </Step>
                )}

                {step === 5 && (
                  <Step key="fm5" emoji="💰" title="Fund terms" subtitle="Displayed to LPs in your pitch deck summary and matching profile">
                    <div className="ob-field-grid">
                      <F label="Target fund size *"><PillSingle options={FUND_SIZES} selected={fd.fundTargetSize ?? ""} onSelect={v => updFd({ fundTargetSize: v })} /></F>
                      <F label="Minimum LP commitment *"><PillSingle options={MIN_COMMITMENTS} selected={fd.minCommitment ?? ""} onSelect={v => updFd({ minCommitment: v })} /></F>
                    </div>
                    <div className="ob-field-grid">
                      <F label="Fund life"><PillSingle options={FUND_LIVES} selected={fd.fundLife ?? ""} onSelect={v => updFd({ fundLife: v })} /></F>
                    </div>
                    <div className="ob-field-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                      <F label="Mgmt fee"><Inp placeholder="2%" value={fd.managementFee ?? ""} onChange={e => updFd({ managementFee: e.target.value })} /></F>
                      <F label="Carry"><Inp placeholder="20%" value={fd.carry ?? ""} onChange={e => updFd({ carry: e.target.value })} /></F>
                      <F label="Hurdle rate"><Inp placeholder="8%" value={fd.hurdleRate ?? ""} onChange={e => updFd({ hurdleRate: e.target.value })} /></F>
                    </div>
                    <F label="LP types sought" hint="Which LP categories are you targeting?">
                      <PillMulti options={LP_TYPES_SOUGHT} selected={fd.lpTypesTarget ?? []} onToggle={v => updFd({ lpTypesTarget: toggle(fd.lpTypesTarget ?? [], v) })} />
                    </F>
                    <Nav onBack={() => setStep(4)} onNext={() => setStep(6)} canNext={canContinue()} />
                  </Step>
                )}

                {step === 6 && (
                  <Step key="fm6" emoji="📁" title="Pitch materials" subtitle="Upload your fund deck and DDQ to enable LP-facing document sharing">
                    <F label="Fund pitch deck" hint="PDF — powers AI LP memo generation and document sharing">
                      <div className="deck-drop" onClick={() => document.getElementById("deck-file")?.click()}>
                        {fd.pitchDeckUrl
                          ? <div className="deck-uploaded"><span style={{ color: "#22c55e" }}>✓</span><span>Deck uploaded</span></div>
                          : <><span className="deck-drop__icon">📄</span><p className="deck-drop__label">Drop your fund pitch deck here</p><p className="deck-drop__sub">PDF · Powers AI LP memo generation</p></>
                        }
                        <input id="deck-file" type="file" accept=".pdf,.pptx" style={{ display: "none" }}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) updFd({ pitchDeckUrl: URL.createObjectURL(f) });
                          }}
                        />
                      </div>
                    </F>
                    <F label="Due diligence questionnaire (DDQ)" hint="Optional — upload your DDQ template for LP review">
                      <div className="deck-drop" onClick={() => document.getElementById("ddq-file")?.click()}>
                        {fd.ddqUrl
                          ? <div className="deck-uploaded"><span style={{ color: "#22c55e" }}>✓</span><span>DDQ uploaded</span></div>
                          : <><span className="deck-drop__icon">📋</span><p className="deck-drop__label">Drop your DDQ here</p><p className="deck-drop__sub">PDF or DOCX · Shared with qualified LPs</p></>
                        }
                        <input id="ddq-file" type="file" accept=".pdf,.docx" style={{ display: "none" }}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) updFd({ ddqUrl: URL.createObjectURL(f) });
                          }}
                        />
                      </div>
                    </F>
                    <Nav onBack={() => setStep(5)} onNext={() => setStep(7)} canNext />
                  </Step>
                )}

                {step === 7 && (
                  <Step key="fm7" emoji="🎉" title="LP matching preferences" subtitle="Fine-tune the LP matchmaking engine before we launch your profile">
                    <F label="Target LP geographies *" hint="Where are your ideal LPs based?">
                      <PillMulti options={GEOGRAPHIES} selected={fd.targetLPGeographies ?? []} onToggle={v => updFd({ targetLPGeographies: toggle(fd.targetLPGeographies ?? [], v) })} />
                    </F>
                    <F label="LP commitment target" hint="How much are you looking to raise from matched LPs?">
                      <PillSingle options={FUND_SIZES} selected={fd.lpCommitmentTarget ?? ""} onSelect={v => updFd({ lpCommitmentTarget: v })} />
                    </F>
                    <F label="Existing LP relationships" hint="Optional — helps identify warm introduction paths">
                      <Txa placeholder="List any existing LP names or institutions you already have relationships with…" value={fd.existingLPs ?? ""} onChange={e => updFd({ existingLPs: e.target.value })} rows={2} />
                    </F>
                    <label className="ob-checkbox">
                      <input type="checkbox" checked={fd.preferExistingLPs} onChange={e => updFd({ preferExistingLPs: e.target.checked })} style={{ accentColor: "#8e84f7" }} />
                      <span>Prioritise matching existing LPs from prior funds for re-ups</span>
                    </label>

                    {/* Summary */}
                    <div className="ob-summary">
                      <p className="ob-summary__title">Fund profile summary</p>
                      <div className="ob-summary__rows">
                        {[
                          ["Fund", `${fd.fundName ?? "—"} · ${fd.fundNumber ?? "—"}`],
                          ["Strategy", fd.strategy ?? "—"],
                          ["Verticals", (fd.verticals ?? []).slice(0, 3).join(", ") || "—"],
                          ["Stages", (fd.stages ?? []).join(", ") || "—"],
                          ["Target size", fd.fundTargetSize ?? "—"],
                          ["Min commitment", fd.minCommitment ?? "—"],
                          ["GP", fd.gpName ?? "—"],
                        ].map(([k, v]) => (
                          <div key={k as string} className="ob-summary__row">
                            <span className="ob-summary__key">{k}</span>
                            <span className="ob-summary__val">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* What gets created */}
                    <div className="ob-features">
                      {[
                        { icon: "🔍", label: "LP matching across 500+ institutional and HNW investor database" },
                        { icon: "📊", label: "LP fundraising pipeline pre-created with your stage definitions" },
                        { icon: "📄", label: "AI LP memo generator ready for each prospect" },
                        { icon: "✉",  label: "LP outreach sequence templates activated" },
                        { icon: "📁", label: "Fund data room and DDQ sharing enabled" },
                      ].map(f => (
                        <div key={f.label} className="ob-feature"><span>{f.icon}</span><span>{f.label}</span></div>
                      ))}
                    </div>

                    {submitMutation.isError && <div className="ob-error">Something went wrong. Please try again.</div>}
                    <Nav onBack={() => setStep(6)} onFinish={() => submitMutation.mutate()} isLast isLoading={submitMutation.isPending} canNext={canContinue()} />
                  </Step>
                )}
              </>
            )}

          </AnimatePresence>
        </motion.div>

        <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="ob-global-skip" onClick={() => navigate("/app/fundraise")}>
          Skip for now — complete profile later
        </motion.button>
      </div>

      <style>{styles}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Outfit:wght@500;700;800&display=swap');
*{box-sizing:border-box}
.ob-page{min-height:100vh;background:rgb(11,11,15);font-family:'DM Sans',sans-serif;display:flex;align-items:flex-start;justify-content:center;padding:28px 20px 80px;position:relative;overflow:hidden}
.ob-bg{position:fixed;inset:0;pointer-events:none;z-index:0}
.ob-orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:.22}
.ob-orb--1{width:600px;height:600px;background:radial-gradient(circle,#8e84f7,transparent 70%);top:-250px;right:-150px}
.ob-orb--2{width:500px;height:500px;background:radial-gradient(circle,#c8aa82,transparent 70%);bottom:-200px;left:-150px}
.ob-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(142,132,247,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(142,132,247,.04) 1px,transparent 1px);background-size:44px 44px}
.ob-container{position:relative;z-index:1;width:100%;max-width:680px}
.ob-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;gap:16px}
.ob-logo{display:flex;align-items:center;gap:8px}
.ob-logo__anchor{font-size:22px}.ob-logo__name{font-family:'Outfit',sans-serif;font-weight:700;color:#fff;font-size:20px}
.ob-progress{flex:1;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.ob-progress__meta{display:flex;justify-content:space-between;width:100%}
.ob-progress__role{font-size:12px;color:rgba(255,255,255,.45)}.ob-progress__step{font-size:12px;color:rgba(255,255,255,.3)}
.ob-progress__track{width:100%;height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.ob-progress__fill{height:100%;background:linear-gradient(90deg,#8e84f7,#c8aa82);border-radius:2px}
.ob-card{background:rgba(20,20,26,.92);border:1px solid rgba(142,132,247,.14);border-radius:22px;padding:32px 32px 24px;backdrop-filter:blur(18px);box-shadow:0 24px 64px rgba(0,0,0,.45)}
.ob-step-hdr{margin-bottom:24px}.ob-step-emoji{font-size:32px;display:block;margin-bottom:10px}
.ob-step-title{font-family:'Outfit',sans-serif;font-size:22px;font-weight:700;color:#fff;margin:0 0 5px;letter-spacing:-.5px}
.ob-step-sub{font-size:14px;color:rgba(255,255,255,.42);margin:0;line-height:1.5}
.ob-field{margin-bottom:18px}.ob-field__top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
.ob-label{font-size:13px;font-weight:500;color:rgba(255,255,255,.58)}.ob-hint{font-size:11px;color:rgba(255,255,255,.3)}
.ob-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:520px){.ob-field-grid{grid-template-columns:1fr}}
.ob-input{width:100%;padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .2s}
.ob-input::placeholder{color:rgba(255,255,255,.18)}.ob-input:focus{border-color:rgba(142,132,247,.5);box-shadow:0 0 0 3px rgba(142,132,247,.1)}
.ob-textarea{width:100%;padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;resize:none;line-height:1.5;transition:border-color .2s}
.ob-textarea::placeholder{color:rgba(255,255,255,.18)}.ob-textarea:focus{border-color:rgba(142,132,247,.5)}
.pills{display:flex;flex-wrap:wrap;gap:7px}.pill{padding:7px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:100px;color:rgba(255,255,255,.55);font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.pill:hover:not(.pill--dim){background:rgba(142,132,247,.1);border-color:rgba(142,132,247,.3);color:#fff}
.pill--on{background:rgba(142,132,247,.15);border-color:#8e84f7;color:#c4bef7}.pill--dim{opacity:.35;cursor:not-allowed}
.role-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:22px}
@media(max-width:680px){.role-grid-3{grid-template-columns:1fr}}
.role-card{text-align:left;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:16px;cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif;position:relative}
.role-card:hover{border-color:rgba(142,132,247,.3);background:rgba(142,132,247,.07)}
.role-card--selected{border-color:#8e84f7;background:rgba(142,132,247,.1);box-shadow:0 0 0 1px rgba(142,132,247,.25)}
.role-card__top{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}
.role-card__emoji{font-size:22px;flex-shrink:0}.role-card__label{font-size:14px;font-weight:600;color:#fff;margin:0 0 3px}
.role-card__desc{font-size:11px;color:rgba(255,255,255,.42);margin:0;line-height:1.4}
.role-card__check{position:absolute;top:10px;right:12px;font-size:13px;color:#8e84f7;font-weight:700}
.role-card__bullets{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}
.role-card__bullets li{font-size:11px;color:rgba(255,255,255,.4);display:flex;gap:6px;align-items:center}.role-bullet{color:#8e84f7;font-size:7px}
.ob-summary{background:rgba(142,132,247,.05);border:1px solid rgba(142,132,247,.15);border-radius:12px;padding:16px;margin:18px 0}
.ob-summary__title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:rgba(142,132,247,.8);margin:0 0 12px}
.ob-summary__rows{display:flex;flex-direction:column;gap:7px}
.ob-summary__row{display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.ob-summary__row:last-child{border-bottom:none}
.ob-summary__key{font-size:12px;color:rgba(255,255,255,.38)}.ob-summary__val{font-size:12px;color:#fff;font-weight:500;text-align:right;max-width:60%}
.ob-features{display:flex;flex-direction:column;gap:8px;margin-bottom:18px}
.ob-feature{display:flex;gap:10px;align-items:center;font-size:13px;color:rgba(255,255,255,.55)}.ob-feature span:first-child{font-size:15px}
.ob-error{font-size:13px;color:#f87171;padding:10px 14px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px;margin-bottom:14px}
.ob-checkbox{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:rgba(255,255,255,.5);cursor:pointer;margin-bottom:16px;margin-top:4px;line-height:1.5}
.deck-drop{border:1.5px dashed rgba(255,255,255,.15);border-radius:12px;padding:24px;text-align:center;cursor:pointer;transition:all .2s;margin-bottom:0}
.deck-drop:hover{border-color:rgba(142,132,247,.5);background:rgba(142,132,247,.05)}
.deck-drop__icon{font-size:24px;display:block;margin-bottom:7px}.deck-drop__label{font-size:14px;color:rgba(255,255,255,.65);margin:0 0 3px}.deck-drop__sub{font-size:12px;color:rgba(255,255,255,.3);margin:0}
.deck-uploaded{display:flex;align-items:center;gap:10px;justify-content:center;font-size:13px;color:rgba(255,255,255,.65)}
.ob-nav{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:22px}
.ob-btn-back{padding:11px 16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:rgba(255,255,255,.5);font-size:14px;cursor:pointer;font-family:'DM Sans',sans-serif}
.ob-btn-back:hover{background:rgba(255,255,255,.09);color:#fff}
.ob-btn-next{padding:11px 26px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 16px rgba(142,132,247,.3);display:flex;align-items:center;gap:8px;white-space:nowrap}
.ob-btn-next:hover:not(:disabled){box-shadow:0 6px 20px rgba(142,132,247,.4)}.ob-btn-next:disabled{opacity:.5;cursor:not-allowed}
.ob-spinner{width:17px;height:17px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
.ob-global-skip{display:block;margin:20px auto 0;background:none;border:none;color:rgba(255,255,255,.2);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:color .2s}
.ob-global-skip:hover{color:rgba(255,255,255,.45)}
`;
