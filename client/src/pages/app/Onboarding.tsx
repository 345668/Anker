import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "AI / Machine Learning", "FinTech", "HealthTech / MedTech",
  "SaaS / B2B Software", "Consumer Tech", "CleanTech / ClimateTech",
  "EdTech", "Real Estate Tech", "Entertainment / Film / Media",
  "Sports & Wellness", "DeepTech / Hardware", "E-commerce / D2C",
  "Cybersecurity", "Web3 / Crypto", "Other",
];

const NICHE_INDUSTRIES = [
  { value: "film", label: "Film / Slate Financing", emoji: "🎬" },
  { value: "realestate", label: "Real Estate / PropTech", emoji: "🏢" },
  { value: "sports", label: "Sports / Esports", emoji: "⚽" },
];

const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth"];

const FUNDING_TARGETS = [
  "< $250K", "$250K – $500K", "$500K – $1M",
  "$1M – $3M", "$3M – $5M", "$5M – $10M", "$10M+",
];

const INVESTOR_TYPES = [
  "VC Fund", "Angel Investor", "Family Office",
  "Corporate VC", "PE / Growth Equity", "Syndicate", "Any",
];

const FIRM_TYPES = ["VC Fund", "Family Office", "Angel Group", "PE / Growth", "Corporate VC", "Syndicate"];

const CHECK_SIZES = [
  "$10K – $50K", "$50K – $250K", "$250K – $500K",
  "$500K – $1M", "$1M – $5M", "$5M – $25M", "$25M+",
];

const GEOGRAPHIES = [
  "USA – East Coast", "USA – West Coast", "USA – National",
  "Europe – UK", "Europe – DACH", "Europe – Benelux",
  "Europe – Nordics", "Europe – France", "Europe – Southern",
  "MENA / UAE", "Asia Pacific", "Latin America", "Global",
];

const TEAM_SIZES = ["Solo founder", "2–3", "4–10", "11–25", "25+"];

// ─── Fund Manager constants ───────────────────────────────────────────────────
const FM_STRATEGIES = ["Venture", "Growth Equity", "Private Equity", "Venture Studio", "Rolling Fund", "SPV", "Fund of Funds"];
const FM_FUND_NUMBERS = ["Fund I", "Fund II", "Fund III", "Fund IV", "Fund V+"];
const FM_STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth", "All stages"];
const FM_SIZES = ["< $10M", "$10M – $50M", "$50M – $100M", "$100M – $250M", "$250M – $500M", "$500M+"];
const FM_MIN_COMMITMENTS = ["$100K", "$250K", "$500K", "$1M", "$2.5M", "$5M", "$10M+"];
const FM_LIVES = ["5 years", "7 years", "10 years", "10 + 2", "Evergreen"];
const FM_LP_TYPES = ["Family Office", "Endowment", "Foundation", "Pension Fund", "Fund of Funds", "HNWI", "Corporate LP", "Government / Sovereign", "University Endowment"];
const FM_VERTICALS = ["FinTech", "HealthTech / MedTech", "AI / Machine Learning", "SaaS / B2B", "Consumer Tech", "CleanTech", "EdTech", "Real Estate / PropTech", "Entertainment / Film", "Sports / Esports", "DeepTech", "E-commerce", "Cybersecurity", "Web3", "BioTech"];
const FM_HORIZONTALS = ["AI-first", "Climate / Net Zero", "Future of Work", "Developer Tools", "Open Source", "API Economy", "Marketplace", "Vertical SaaS", "Embedded Finance", "Web3 / DeFi", "Digital Health", "Creator Economy"];
const FM_GEOS = ["USA – National", "USA – East Coast", "USA – West Coast", "Europe – UK", "Europe – DACH", "Europe – Nordics", "Europe – Benelux", "Europe – Southern", "MENA / UAE", "Southeast Asia", "Asia Pacific", "Latin America", "Global / Agnostic"];

type FundManagerData = {
  fundName: string; fundNumber: string; fundVintage: string;
  firmWebsite: string; firmHQ: string; strategy: string;
  verticals: string[]; horizontals: string[]; stages: string[]; geographies: string[];
  investmentThesis: string; avgCheckSize: string; portfolioSize: string;
  gpName: string; gpLinkedin: string; gpBio: string; teamSize: string; trackRecord: string;
  fundTargetSize: string; minCommitment: string; lpTypesTarget: string[];
  fundLife: string; managementFee: string; carry: string; hurdleRate: string;
  pitchDeckUrl?: string; ddqUrl?: string;
  targetLPGeographies: string[]; lpCommitmentTarget: string;
  existingLPs: string; preferExistingLPs: boolean;
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "founder" | "investor" | "fund_manager";

type FounderData = {
  companyName: string;
  website: string;
  shortBio: string;
  hqLocation: string;
  industry: string;
  niche: string | null;
  stage: string;
  fundingTarget: string;
  teamSize: string;
  linkedinUrl: string;
  pitchDeckUploaded: boolean;
  pitchDeckUrl?: string;
  targetGeographies: string[];
  preferredInvestorTypes: string[];
  keyMilestone: string;
};

type InvestorData = {
  firmName: string;
  firmType: string;
  website: string;
  hqLocation: string;
  preferredStages: string[];
  preferredSectors: string[];
  typicalCheckSize: string;
  aum: string;
  investmentThesis: string;
  focusNiches: string[];
  geographyFocus: string[];
  portfolioCount: string;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function PillMulti({ options, selected, onToggle, max }: {
  options: string[]; selected: string[]; onToggle: (v: string) => void; max?: number;
}) {
  return (
    <div className="ob-pill-wrap">
      {options.map((opt) => {
        const isSelected = selected.includes(opt);
        const isDisabled = !isSelected && max !== undefined && selected.length >= max;
        return (
          <button key={opt} type="button" disabled={isDisabled} onClick={() => onToggle(opt)}
            className={`ob-pill ${isSelected ? "ob-pill--on" : ""} ${isDisabled ? "ob-pill--disabled" : ""}`}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function PillSingle({ options, selected, onSelect }: {
  options: string[]; selected: string; onSelect: (v: string) => void;
}) {
  return (
    <div className="ob-pill-wrap">
      {options.map((opt) => (
        <button key={opt} type="button" onClick={() => onSelect(opt)}
          className={`ob-pill ${selected === opt ? "ob-pill--on" : ""}`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function OBField({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="ob-field">
      <div className="ob-field__top">
        <label className="ob-label">{label}</label>
        {hint && <span className="ob-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function OBInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="ob-input" {...props} />;
}

function OBTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="ob-textarea" rows={3} {...props} />;
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="ob-summary-row">
      <span className="ob-summary-row__key">{label}</span>
      <span className="ob-summary-row__val">{value}</span>
    </div>
  );
}

// ─── Pitch deck uploader ──────────────────────────────────────────────────────

function PitchDeckUploader({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f || (!f.name.endsWith(".pdf") && !f.name.endsWith(".pptx"))) return;
    setFile(f);
    setUploading(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((p) => { if (p >= 95) { clearInterval(interval); return p; } return p + Math.random() * 15; });
    }, 150);

    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch("/api/upload/pitch-deck", { method: "POST", body: formData });
      clearInterval(interval);
      if (res.ok) {
        const { url } = await res.json();
        setProgress(100);
        setDone(true);
        onUploaded(url);
      } else {
        // Still mark as done locally even if upload fails — won't block onboarding
        setProgress(100);
        setDone(true);
        onUploaded("");
      }
    } catch {
      clearInterval(interval);
      setUploading(false);
      setFile(null);
    }
  }, [onUploaded]);

  if (done && file) {
    return (
      <div className="ob-deck-uploaded">
        <span style={{ fontSize: 18, color: "#22c55e" }}>✓</span>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 14, color: "#fff", fontWeight: 500 }}>{file.name}</p>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.4)" }}>Ready for AI pitch analysis</p>
        </div>
        <button type="button" onClick={() => { setDone(false); setFile(null); setUploading(false); setProgress(0); }}
          style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(255,255,255,.4)", fontSize: 12, cursor: "pointer" }}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className={`ob-deck-drop ${isDragging ? "ob-deck-drop--active" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => fileRef.current?.click()}
    >
      <input ref={fileRef} type="file" accept=".pdf,.pptx" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {uploading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.65)" }}>{file?.name}</p>
          <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "linear-gradient(90deg,#8e84f7,#c8aa82)", width: `${Math.round(progress)}%`, transition: "width .1s", borderRadius: 2 }} />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#8e84f7" }}>{Math.round(progress)}%</p>
        </div>
      ) : (
        <>
          <span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>📄</span>
          <p style={{ margin: "0 0 4px", fontSize: 14, color: "rgba(255,255,255,.65)" }}>Drop your pitch deck here</p>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.3)" }}>PDF or PPTX · Powers AI pitch analysis</p>
        </>
      )}
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function Progress({ step, total, role }: { step: number; total: number; role: Role | null }) {
  const pct = total > 1 ? ((step - 1) / (total - 1)) * 100 : 100;
  return (
    <div className="ob-progress">
      <div className="ob-progress__meta">
        <span className="ob-progress__role">{role === "founder" ? "🚀 Founder" : role === "investor" ? "💎 Investor" : role === "fund_manager" ? "🏦 Fund Manager" : ""}</span>
        <span className="ob-progress__step">Step {step} of {total}</span>
      </div>
      <div className="ob-progress__track">
        <motion.div className="ob-progress__fill" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: "easeInOut" }} />
      </div>
    </div>
  );
}

// ─── Step wrapper ─────────────────────────────────────────────────────────────

function OBStep({ emoji, title, subtitle, children }: { emoji: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
      <div className="ob-step-hdr">
        <span className="ob-step-emoji">{emoji}</span>
        <h2 className="ob-step-title">{title}</h2>
        <p className="ob-step-sub">{subtitle}</p>
      </div>
      {children}
    </motion.div>
  );
}

// ─── Nav bar ──────────────────────────────────────────────────────────────────

function OBNav({ onBack, onNext, onFinish, canNext = true, isFirst = false, isLast = false, isLoading = false, nextLabel = "Continue →" }: {
  onBack?: () => void; onNext?: () => void; onFinish?: () => void;
  canNext?: boolean; isFirst?: boolean; isLast?: boolean; isLoading?: boolean; nextLabel?: string;
}) {
  return (
    <div className="ob-nav">
      {!isFirst && (
        <button type="button" className="ob-btn-back" onClick={onBack}>← Back</button>
      )}
      <motion.button type="button" whileHover={canNext ? { scale: 1.02 } : {}} whileTap={canNext ? { scale: 0.98 } : {}}
        className="ob-btn-next" disabled={!canNext || isLoading} onClick={isLast ? onFinish : onNext}>
        {isLoading ? <span className="ob-spinner" /> : isLast ? "Launch my profile 🎉" : nextLabel}
      </motion.button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Onboarding() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState(1);

  const [fd, setFd] = useState<Partial<FounderData>>({
    targetGeographies: [], preferredInvestorTypes: [], niche: null,
  });
  const [iv, setIv] = useState<Partial<InvestorData>>({
    preferredStages: [], preferredSectors: [], focusNiches: [], geographyFocus: [],
  });
  const [fm, setFm] = useState<Partial<FundManagerData>>({
    verticals: [], horizontals: [], stages: [], geographies: [],
    lpTypesTarget: [], targetLPGeographies: [], preferExistingLPs: false,
  });

  const founderSteps = 6;
  const investorSteps = 5;
  const fundManagerSteps = 7;
  const totalSteps = role === "founder" ? founderSteps : role === "investor" ? investorSteps : role === "fund_manager" ? fundManagerSteps : 1;

  const updateFd = (patch: Partial<FounderData>) => setFd((p) => ({ ...p, ...patch }));
  const updateIv = (patch: Partial<InvestorData>) => setIv((p) => ({ ...p, ...patch }));
  const updateFm = (patch: Partial<FundManagerData>) => setFm((p) => ({ ...p, ...patch }));
  const toggleArr = <T extends string>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const founderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/founder", fd);
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], (old: any) =>
        old ? { ...old, onboardingCompleted: true } : old,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/app/dashboard");
    },
  });

  const investorMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/investor", iv);
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], (old: any) =>
        old ? { ...old, onboardingCompleted: true } : old,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/app/dashboard");
    },
  });

  const fundManagerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/fund-manager", fm);
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], (old: any) =>
        old ? { ...old, onboardingCompleted: true } : old,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/app/fundraise");
    },
  });

  const next = () => setStep((s) => Math.min(s + 1, totalSteps));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const canProceedFounder = (): boolean => {
    if (step === 2) return !!(fd.companyName?.trim() && fd.hqLocation);
    if (step === 3) return !!(fd.industry && fd.stage && fd.fundingTarget);
    if (step === 4) return !!(fd.teamSize && fd.linkedinUrl?.trim());
    if (step === 5) return (fd.targetGeographies?.length ?? 0) > 0;
    return true;
  };

  const canProceedInvestor = (): boolean => {
    if (step === 2) return !!(iv.firmName?.trim() && iv.firmType && iv.hqLocation);
    if (step === 3) return (iv.preferredStages?.length ?? 0) > 0 && (iv.preferredSectors?.length ?? 0) > 0 && !!iv.typicalCheckSize;
    if (step === 4) return (iv.geographyFocus?.length ?? 0) > 0;
    return true;
  };

  const canProceedFundManager = (): boolean => {
    if (step === 2) return !!(fm.fundName?.trim() && fm.strategy && fm.fundNumber);
    if (step === 3) return (fm.verticals?.length ?? 0) > 0 && (fm.stages?.length ?? 0) > 0;
    if (step === 4) return !!(fm.gpName?.trim() && fm.gpLinkedin?.trim());
    if (step === 5) return !!(fm.fundTargetSize && fm.minCommitment);
    if (step === 7) return (fm.targetLPGeographies?.length ?? 0) > 0;
    return true;
  };

  const canProceed = role === "founder" ? canProceedFounder() : role === "investor" ? canProceedInvestor() : role === "fund_manager" ? canProceedFundManager() : false;

  return (
    <div className="ob-page">
      <div className="ob-bg">
        <div className="ob-orb ob-orb--1" />
        <div className="ob-orb ob-orb--2" />
        <div className="ob-grid" />
      </div>

      <div className="ob-container">
        <div className="ob-header">
          <div className="ob-logo">
            <span style={{ fontSize: 22 }}>⚓</span>
            <span className="ob-logo__name">Anker</span>
          </div>
          {role && <Progress step={step} total={totalSteps} role={role} />}
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="ob-card">
          <AnimatePresence mode="wait">

            {/* ── STEP 1: Role selection ── */}
            {step === 1 && (
              <OBStep key="role" emoji="👋" title="Welcome to Anker" subtitle="How are you planning to use the platform?">
                <div className="ob-role-grid ob-role-grid--3col">
                  {[
                    { value: "founder" as Role, emoji: "🚀", label: "I'm a founder", desc: "I'm raising capital and want to connect with the right investors for my startup.",
                      bullets: ["AI-powered investor matching", "Pitch deck analysis", "Deal room & document storage", "Financial tools & forecasting"] },
                    { value: "investor" as Role, emoji: "💎", label: "I'm an investor", desc: "I'm a VC, family office, or angel looking for exceptional deal flow.",
                      bullets: ["Curated founder deal flow", "Deep research & enrichment", "CRM sync (Folk)", "Portfolio analytics"] },
                    { value: "fund_manager" as Role, emoji: "🏦", label: "I'm a fund manager", desc: "I manage a fund and want to streamline fundraising, LP relations, and deal flow.",
                      bullets: ["Fund profile & LP targeting", "Fundraising pipeline tools", "Forecasting & fund models", "MBB-style reporting"] },
                  ].map((r) => (
                    <motion.button key={r.value} type="button" whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}
                      onClick={() => setRole(r.value)}
                      className={`ob-role-card ${role === r.value ? "ob-role-card--selected" : ""}`}>
                      <div className="ob-role-card__top">
                        <span className="ob-role-card__emoji">{r.emoji}</span>
                        <div>
                          <p className="ob-role-card__label">{r.label}</p>
                          <p className="ob-role-card__desc">{r.desc}</p>
                        </div>
                        {role === r.value && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="ob-role-card__check">✓</motion.span>
                        )}
                      </div>
                      <ul className="ob-role-card__bullets">
                        {r.bullets.map((b) => (
                          <li key={b}><span style={{ color: "#8e84f7", fontSize: 7 }}>◆</span>{b}</li>
                        ))}
                      </ul>
                    </motion.button>
                  ))}
                </div>
                <OBNav onNext={next} canNext={!!role} isFirst
                  nextLabel={role ? `Continue as ${role === "founder" ? "Founder" : role === "investor" ? "Investor" : "Fund Manager"} →` : "Select a role to continue"} />
              </OBStep>
            )}

            {/* ═══════════ FOUNDER STEPS ═══════════ */}
            {role === "founder" && (
              <>
                {step === 2 && (
                  <OBStep key="f2" emoji="🏢" title="Tell us about your company" subtitle="This powers your investor profile and matching engine">
                    <OBField label="Company name *">
                      <OBInput placeholder="e.g. NovaSphere" value={fd.companyName || ""} onChange={(e) => updateFd({ companyName: e.target.value })} />
                    </OBField>
                    <OBField label="Website" hint="optional">
                      <OBInput placeholder="https://yourcompany.com" value={fd.website || ""} onChange={(e) => updateFd({ website: e.target.value })} />
                    </OBField>
                    <OBField label="Headquarters *" hint="City, Country">
                      <OBInput placeholder="e.g. Amsterdam, Netherlands" value={fd.hqLocation || ""} onChange={(e) => updateFd({ hqLocation: e.target.value })} />
                    </OBField>
                    <OBField label="One-line description" hint="Used in your investor pitch">
                      <OBTextarea placeholder="e.g. AI-powered supply chain optimisation for logistics SMBs." value={fd.shortBio || ""} onChange={(e) => updateFd({ shortBio: e.target.value })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedFounder()} />
                  </OBStep>
                )}

                {step === 3 && (
                  <OBStep key="f3" emoji="📊" title="Industry, stage & funding" subtitle="Drives the matchmaking algorithm — be precise for better matches">
                    <OBField label="Primary industry *">
                      <PillSingle options={INDUSTRIES} selected={fd.industry || ""} onSelect={(v) => updateFd({ industry: v })} />
                    </OBField>
                    <OBField label="Niche sector" hint="These have dedicated investor databases with 70–175 specialists">
                      <div className="ob-niche-grid">
                        {NICHE_INDUSTRIES.map((n) => (
                          <button key={n.value} type="button" onClick={() => updateFd({ niche: fd.niche === n.value ? null : n.value })}
                            className={`ob-niche-card ${fd.niche === n.value ? "ob-niche-card--on" : ""}`}>
                            <span>{n.emoji}</span>
                            <span>{n.label}</span>
                          </button>
                        ))}
                      </div>
                    </OBField>
                    <OBField label="Current stage *">
                      <PillSingle options={STAGES} selected={fd.stage || ""} onSelect={(v) => updateFd({ stage: v })} />
                    </OBField>
                    <OBField label="Target raise *">
                      <PillSingle options={FUNDING_TARGETS} selected={fd.fundingTarget || ""} onSelect={(v) => updateFd({ fundingTarget: v })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedFounder()} />
                  </OBStep>
                )}

                {step === 4 && (
                  <OBStep key="f4" emoji="👥" title="Team & pitch deck" subtitle="Your deck unlocks AI pitch analysis and match insights">
                    <OBField label="Team size *">
                      <PillSingle options={TEAM_SIZES} selected={fd.teamSize || ""} onSelect={(v) => updateFd({ teamSize: v })} />
                    </OBField>
                    <OBField label="Your LinkedIn *" hint="Used for founder profile enrichment">
                      <OBInput placeholder="https://linkedin.com/in/yourprofile" value={fd.linkedinUrl || ""} onChange={(e) => updateFd({ linkedinUrl: e.target.value })} />
                    </OBField>
                    <OBField label="Pitch deck" hint="Optional — PDF or PPTX, enables AI analysis">
                      <PitchDeckUploader onUploaded={(url) => updateFd({ pitchDeckUploaded: true, pitchDeckUrl: url })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedFounder()} />
                  </OBStep>
                )}

                {step === 5 && (
                  <OBStep key="f5" emoji="🎯" title="Matching preferences" subtitle="Fine-tune the algorithm — this is what separates good matches from great ones">
                    <OBField label="Target geographies *" hint="Select all that apply">
                      <PillMulti options={GEOGRAPHIES} selected={fd.targetGeographies || []}
                        onToggle={(v) => updateFd({ targetGeographies: toggleArr(fd.targetGeographies || [], v) })} />
                    </OBField>
                    <OBField label="Preferred investor types" hint="Leave blank for 'any'">
                      <PillMulti options={INVESTOR_TYPES} selected={fd.preferredInvestorTypes || []}
                        onToggle={(v) => updateFd({ preferredInvestorTypes: toggleArr(fd.preferredInvestorTypes || [], v) })} />
                    </OBField>
                    <OBField label="Key milestone" hint="The single thing you'll use this raise to achieve">
                      <OBInput placeholder="e.g. Reach $1M ARR / Launch in 3 new markets" value={fd.keyMilestone || ""} onChange={(e) => updateFd({ keyMilestone: e.target.value })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedFounder()} />
                  </OBStep>
                )}

                {step === 6 && (
                  <OBStep key="f6" emoji="🎉" title="You're all set!" subtitle="Here's what we've set up for your account">
                    <div className="ob-summary-card">
                      <div className="ob-summary-section">
                        <p className="ob-summary-section__title">Company</p>
                        <SummaryRow label="Name" value={fd.companyName} />
                        <SummaryRow label="Location" value={fd.hqLocation} />
                        <SummaryRow label="Website" value={fd.website} />
                        <SummaryRow label="Description" value={fd.shortBio} />
                      </div>
                      <div className="ob-summary-section">
                        <p className="ob-summary-section__title">Fundraise</p>
                        <SummaryRow label="Industry" value={fd.industry} />
                        <SummaryRow label="Stage" value={fd.stage} />
                        <SummaryRow label="Target" value={fd.fundingTarget} />
                        {fd.niche && <SummaryRow label="Niche" value={NICHE_INDUSTRIES.find((n) => n.value === fd.niche)?.label} />}
                      </div>
                      <div className="ob-summary-section">
                        <p className="ob-summary-section__title">Team</p>
                        <SummaryRow label="Team size" value={fd.teamSize} />
                        <SummaryRow label="LinkedIn" value={fd.linkedinUrl} />
                        <SummaryRow label="Pitch deck" value={fd.pitchDeckUploaded ? "✓ Uploaded" : "—"} />
                      </div>
                    </div>

                    <div className="ob-launch-features">
                      <p className="ob-launch-features__title">What's being created for you:</p>
                      <div className="ob-launch-features__list">
                        {[
                          { icon: "🔍", label: "Investor matches from 500+ database" },
                          { icon: "🤝", label: "Deal room with document storage" },
                          { icon: "📊", label: "Financial tools & forecasting studio" },
                          { icon: "🧠", label: fd.pitchDeckUploaded ? "AI pitch deck analysis (queued)" : "AI profile enrichment" },
                          { icon: "✅", label: "DD readiness checklist" },
                        ].map((f) => (
                          <div key={f.label} className="ob-launch-feature">
                            <span>{f.icon}</span><span>{f.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {founderMutation.isError && (
                      <div className="ob-error-banner">Something went wrong. Please try again.</div>
                    )}

                    <OBNav onBack={back} onFinish={() => founderMutation.mutate()} isLast isLoading={founderMutation.isPending} canNext={!founderMutation.isPending} />
                  </OBStep>
                )}
              </>
            )}

            {/* ═══════════ INVESTOR STEPS ═══════════ */}
            {role === "investor" && (
              <>
                {step === 2 && (
                  <OBStep key="i2" emoji="🏦" title="Tell us about your firm" subtitle="This appears on your investor profile and helps founders find you">
                    <OBField label="Firm / fund name *">
                      <OBInput placeholder="e.g. Horizon Ventures" value={iv.firmName || ""} onChange={(e) => updateIv({ firmName: e.target.value })} />
                    </OBField>
                    <OBField label="Firm type *">
                      <PillSingle options={FIRM_TYPES} selected={iv.firmType || ""} onSelect={(v) => updateIv({ firmType: v })} />
                    </OBField>
                    <OBField label="Headquarters *" hint="City, Country">
                      <OBInput placeholder="e.g. London, UK" value={iv.hqLocation || ""} onChange={(e) => updateIv({ hqLocation: e.target.value })} />
                    </OBField>
                    <OBField label="Website" hint="optional">
                      <OBInput placeholder="https://yourfirm.com" value={iv.website || ""} onChange={(e) => updateIv({ website: e.target.value })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedInvestor()} />
                  </OBStep>
                )}

                {step === 3 && (
                  <OBStep key="i3" emoji="📝" title="Investment thesis" subtitle="Powers the matchmaking engine — founders see this when you match">
                    <OBField label="Preferred stages *">
                      <PillMulti options={STAGES} selected={iv.preferredStages || []}
                        onToggle={(v) => updateIv({ preferredStages: toggleArr(iv.preferredStages || [], v) })} />
                    </OBField>
                    <OBField label="Sectors of focus *" hint="Select up to 5">
                      <PillMulti options={INDUSTRIES} selected={iv.preferredSectors || []}
                        onToggle={(v) => updateIv({ preferredSectors: toggleArr(iv.preferredSectors || [], v) })} max={5} />
                    </OBField>
                    <OBField label="Typical check size *">
                      <PillSingle options={CHECK_SIZES} selected={iv.typicalCheckSize || ""} onSelect={(v) => updateIv({ typicalCheckSize: v })} />
                    </OBField>
                    <OBField label="AUM" hint="Approximate — helps founders gauge fit">
                      <OBInput placeholder="e.g. $100M" value={iv.aum || ""} onChange={(e) => updateIv({ aum: e.target.value })} />
                    </OBField>
                    <OBField label="Investment thesis" hint="In 2–3 sentences, what excites you?">
                      <OBTextarea rows={4} placeholder="e.g. We back technical founders solving enterprise workflow problems at Series A, typically writing $2–5M checks with board seats."
                        value={iv.investmentThesis || ""} onChange={(e) => updateIv({ investmentThesis: e.target.value })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedInvestor()} />
                  </OBStep>
                )}

                {step === 4 && (
                  <OBStep key="i4" emoji="🌍" title="Niche focus & geography" subtitle="Match you to the right founders in the right places">
                    <OBField label="Niche focus areas" hint="Dedicated databases: 175 family offices · 78 film financiers · 70+ sports investors">
                      <div className="ob-niche-grid">
                        {NICHE_INDUSTRIES.map((n) => (
                          <button key={n.value} type="button"
                            onClick={() => updateIv({ focusNiches: toggleArr(iv.focusNiches || [], n.value) })}
                            className={`ob-niche-card ${(iv.focusNiches || []).includes(n.value) ? "ob-niche-card--on" : ""}`}>
                            <span>{n.emoji}</span><span>{n.label}</span>
                          </button>
                        ))}
                      </div>
                    </OBField>
                    <OBField label="Primary geography *" hint="Select your primary investment regions">
                      <PillMulti options={GEOGRAPHIES} selected={iv.geographyFocus || []}
                        onToggle={(v) => updateIv({ geographyFocus: toggleArr(iv.geographyFocus || [], v) })} />
                    </OBField>
                    <OBField label="Active portfolio companies" hint="Approximate number">
                      <OBInput type="number" placeholder="e.g. 24" value={iv.portfolioCount || ""} onChange={(e) => updateIv({ portfolioCount: e.target.value })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedInvestor()} />
                  </OBStep>
                )}

                {step === 5 && (
                  <OBStep key="i5" emoji="🎉" title="Ready to find great founders" subtitle="Your investor profile is set up and ready to go">
                    <div className="ob-summary-card">
                      <div className="ob-summary-section">
                        <p className="ob-summary-section__title">Firm</p>
                        <SummaryRow label="Name" value={iv.firmName} />
                        <SummaryRow label="Type" value={iv.firmType} />
                        <SummaryRow label="Location" value={iv.hqLocation} />
                      </div>
                      <div className="ob-summary-section">
                        <p className="ob-summary-section__title">Investment focus</p>
                        <SummaryRow label="Stages" value={iv.preferredStages?.join(", ")} />
                        <SummaryRow label="Check size" value={iv.typicalCheckSize} />
                        <SummaryRow label="AUM" value={iv.aum} />
                        <SummaryRow label="Sectors" value={iv.preferredSectors?.slice(0, 3).join(", ") + (iv.preferredSectors && iv.preferredSectors.length > 3 ? "…" : "")} />
                      </div>
                      <div className="ob-summary-section">
                        <p className="ob-summary-section__title">Geography</p>
                        <SummaryRow label="Focus" value={iv.geographyFocus?.slice(0, 3).join(", ")} />
                        <SummaryRow label="Portfolio" value={iv.portfolioCount ? `${iv.portfolioCount} companies` : undefined} />
                      </div>
                    </div>

                    <div className="ob-launch-features">
                      <p className="ob-launch-features__title">What's being set up:</p>
                      <div className="ob-launch-features__list">
                        {[
                          { icon: "🔍", label: "Founder deal flow matched to your thesis" },
                          { icon: "🤖", label: "AI enrichment on your firm profile" },
                          { icon: "📋", label: "CRM sync ready for Folk integration" },
                          { icon: "📊", label: "Forecasting studio & portfolio tools" },
                          { icon: "📩", label: "Outreach templates & bulk email tools" },
                        ].map((f) => (
                          <div key={f.label} className="ob-launch-feature"><span>{f.icon}</span><span>{f.label}</span></div>
                        ))}
                      </div>
                    </div>

                    {investorMutation.isError && (
                      <div className="ob-error-banner">Something went wrong. Please try again.</div>
                    )}

                    <OBNav onBack={back} onFinish={() => investorMutation.mutate()} isLast isLoading={investorMutation.isPending} canNext={!investorMutation.isPending} />
                  </OBStep>
                )}
              </>
            )}

            {/* ═══════════ FUND MANAGER STEPS ═══════════ */}
            {role === "fund_manager" && (
              <>
                {step === 2 && (
                  <OBStep key="fm2" emoji="🏦" title="Fund overview" subtitle="Help us understand your fund structure and strategy">
                    <OBField label="Fund / firm name *">
                      <OBInput placeholder="e.g. Horizon Capital Partners" value={fm.fundName || ""} onChange={(e) => updateFm({ fundName: e.target.value })} />
                    </OBField>
                    <OBField label="Fund number *">
                      <PillSingle options={FM_FUND_NUMBERS} selected={fm.fundNumber || ""} onSelect={(v) => updateFm({ fundNumber: v })} />
                    </OBField>
                    <OBField label="Vintage year" hint="Year the fund was / will be launched">
                      <OBInput placeholder="e.g. 2024" value={fm.fundVintage || ""} onChange={(e) => updateFm({ fundVintage: e.target.value })} />
                    </OBField>
                    <OBField label="Fund strategy *">
                      <PillSingle options={FM_STRATEGIES} selected={fm.strategy || ""} onSelect={(v) => updateFm({ strategy: v })} />
                    </OBField>
                    <OBField label="Firm website" hint="optional">
                      <OBInput placeholder="https://yourfirm.com" value={fm.firmWebsite || ""} onChange={(e) => updateFm({ firmWebsite: e.target.value })} />
                    </OBField>
                    <OBField label="Headquarters" hint="City, Country">
                      <OBInput placeholder="e.g. London, UK" value={fm.firmHQ || ""} onChange={(e) => updateFm({ firmHQ: e.target.value })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedFundManager()} />
                  </OBStep>
                )}

                {step === 3 && (
                  <OBStep key="fm3" emoji="🎯" title="Investment focus" subtitle="Define your thesis — this powers LP targeting and deal flow">
                    <OBField label="Target verticals *" hint="Select up to 5">
                      <PillMulti options={FM_VERTICALS} selected={fm.verticals || []} onToggle={(v) => updateFm({ verticals: toggleArr(fm.verticals || [], v) })} max={5} />
                    </OBField>
                    <OBField label="Horizontal themes" hint="Cross-cutting investment themes (optional)">
                      <PillMulti options={FM_HORIZONTALS} selected={fm.horizontals || []} onToggle={(v) => updateFm({ horizontals: toggleArr(fm.horizontals || [], v) })} max={4} />
                    </OBField>
                    <OBField label="Target stages *">
                      <PillMulti options={FM_STAGES} selected={fm.stages || []} onToggle={(v) => updateFm({ stages: toggleArr(fm.stages || [], v) })} />
                    </OBField>
                    <OBField label="Target geographies">
                      <PillMulti options={FM_GEOS} selected={fm.geographies || []} onToggle={(v) => updateFm({ geographies: toggleArr(fm.geographies || [], v) })} max={5} />
                    </OBField>
                    <OBField label="Investment thesis" hint="2–4 sentences describing your investment lens">
                      <OBTextarea rows={4} placeholder="e.g. We back exceptional founders building AI-native vertical SaaS tools at Seed and Series A across Europe and the US..." value={fm.investmentThesis || ""} onChange={(e) => updateFm({ investmentThesis: e.target.value })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedFundManager()} />
                  </OBStep>
                )}

                {step === 4 && (
                  <OBStep key="fm4" emoji="👤" title="General partner profile" subtitle="Your GP profile increases LP trust and matching quality">
                    <OBField label="GP full name *">
                      <OBInput placeholder="e.g. Sophie Müller" value={fm.gpName || ""} onChange={(e) => updateFm({ gpName: e.target.value })} />
                    </OBField>
                    <OBField label="GP LinkedIn *">
                      <OBInput placeholder="https://linkedin.com/in/..." value={fm.gpLinkedin || ""} onChange={(e) => updateFm({ gpLinkedin: e.target.value })} />
                    </OBField>
                    <OBField label="GP bio / background" hint="Briefly describe your investment background">
                      <OBTextarea rows={3} placeholder="e.g. Former Goldman TMT banker. Led Series A at XYZ Ventures. 3 exits." value={fm.gpBio || ""} onChange={(e) => updateFm({ gpBio: e.target.value })} />
                    </OBField>
                    <OBField label="Team size">
                      <PillSingle options={["Solo GP", "2", "3–5", "6–10", "10+"]} selected={fm.teamSize || ""} onSelect={(v) => updateFm({ teamSize: v })} />
                    </OBField>
                    <OBField label="Track record / prior portfolio" hint="Notable companies backed or exits (optional)">
                      <OBTextarea rows={2} placeholder="e.g. Early investor in Stripe, Revolut (via prior fund). 2× fund returned via exits." value={fm.trackRecord || ""} onChange={(e) => updateFm({ trackRecord: e.target.value })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedFundManager()} />
                  </OBStep>
                )}

                {step === 5 && (
                  <OBStep key="fm5" emoji="💰" title="Fund economics" subtitle="Key terms that LPs will want to know before they commit">
                    <OBField label="Target fund size *">
                      <PillSingle options={FM_SIZES} selected={fm.fundTargetSize || ""} onSelect={(v) => updateFm({ fundTargetSize: v })} />
                    </OBField>
                    <OBField label="Minimum LP commitment *">
                      <PillSingle options={FM_MIN_COMMITMENTS} selected={fm.minCommitment || ""} onSelect={(v) => updateFm({ minCommitment: v })} />
                    </OBField>
                    <OBField label="Fund life">
                      <PillSingle options={FM_LIVES} selected={fm.fundLife || ""} onSelect={(v) => updateFm({ fundLife: v })} />
                    </OBField>
                    <OBField label="Average portfolio check size">
                      <PillSingle options={["$25K–$100K", "$100K–$500K", "$500K–$1M", "$1M–$3M", "$3M–$10M", "$10M+"]} selected={fm.avgCheckSize || ""} onSelect={(v) => updateFm({ avgCheckSize: v })} />
                    </OBField>
                    <OBField label="Target portfolio size" hint="Number of companies">
                      <OBInput placeholder="e.g. 20–25 companies" value={fm.portfolioSize || ""} onChange={(e) => updateFm({ portfolioSize: e.target.value })} />
                    </OBField>
                    <OBField label="Management fee" hint="e.g. 2%">
                      <OBInput placeholder="2%" value={fm.managementFee || ""} onChange={(e) => updateFm({ managementFee: e.target.value })} />
                    </OBField>
                    <OBField label="Carry" hint="e.g. 20%">
                      <OBInput placeholder="20%" value={fm.carry || ""} onChange={(e) => updateFm({ carry: e.target.value })} />
                    </OBField>
                    <OBField label="Hurdle rate" hint="optional — e.g. 8%">
                      <OBInput placeholder="8%" value={fm.hurdleRate || ""} onChange={(e) => updateFm({ hurdleRate: e.target.value })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={canProceedFundManager()} />
                  </OBStep>
                )}

                {step === 6 && (
                  <OBStep key="fm6" emoji="📄" title="Fund documents" subtitle="Optional — upload documents to accelerate LP due diligence">
                    <OBField label="Pitch deck URL" hint="Google Drive, Dropbox, Notion, or direct link">
                      <OBInput placeholder="https://..." value={fm.pitchDeckUrl || ""} onChange={(e) => updateFm({ pitchDeckUrl: e.target.value })} />
                    </OBField>
                    <OBField label="DDQ / data room URL" hint="optional">
                      <OBInput placeholder="https://..." value={fm.ddqUrl || ""} onChange={(e) => updateFm({ ddqUrl: e.target.value })} />
                    </OBField>
                    <OBNav onBack={back} onNext={next} canNext={true} />
                  </OBStep>
                )}

                {step === 7 && (
                  <OBStep key="fm7" emoji="🎉" title="LP targeting" subtitle="Define who you want to raise from — we'll align your pipeline accordingly">
                    <OBField label="Target LP types" hint="Select all that apply">
                      <PillMulti options={FM_LP_TYPES} selected={fm.lpTypesTarget || []} onToggle={(v) => updateFm({ lpTypesTarget: toggleArr(fm.lpTypesTarget || [], v) })} />
                    </OBField>
                    <OBField label="Target LP geographies *">
                      <PillMulti options={FM_GEOS} selected={fm.targetLPGeographies || []} onToggle={(v) => updateFm({ targetLPGeographies: toggleArr(fm.targetLPGeographies || [], v) })} max={5} />
                    </OBField>
                    <OBField label="Target raise from LP commitments" hint="How much do you want to raise from LPs sourced via Anker?">
                      <OBInput placeholder="e.g. $30M–$50M" value={fm.lpCommitmentTarget || ""} onChange={(e) => updateFm({ lpCommitmentTarget: e.target.value })} />
                    </OBField>
                    <OBField label="Existing LP names" hint="Anchor LPs already committed (optional — helps signal momentum)">
                      <OBTextarea rows={2} placeholder="e.g. Partners for Growth, ABC Family Office..." value={fm.existingLPs || ""} onChange={(e) => updateFm({ existingLPs: e.target.value })} />
                    </OBField>
                    <OBField label="Open to re-engaging existing LPs?" hint="We can prioritize connecting you to your prior LP network">
                      <div className="ob-pill-wrap">
                        {["Yes, prioritize warm intros", "No, new LPs only", "Both is fine"].map((opt) => (
                          <button key={opt} type="button" className={`ob-pill ${fm.existingLPs && opt.startsWith("Yes") ? "ob-pill--on" : ""}`}
                            onClick={() => updateFm({ preferExistingLPs: opt.startsWith("Yes") })}>{opt}</button>
                        ))}
                      </div>
                    </OBField>
                    <div className="ob-launch-features">
                      <p className="ob-launch-features__title">You're set to launch 🏦</p>
                      <div className="ob-launch-features__list">
                        {[
                          { icon: "🎯", label: "LP targeting engine calibrated to your fund profile" },
                          { icon: "📊", label: "Forecasting studio & fund model tools activated" },
                          { icon: "🤖", label: "AI enrichment ready for your firm profile" },
                          { icon: "📋", label: "Deal flow pipeline (dual-mode: LP & Startup)" },
                          { icon: "📩", label: "Outreach templates & bulk email for LP engagement" },
                        ].map((f) => (
                          <div key={f.label} className="ob-launch-feature"><span>{f.icon}</span><span>{f.label}</span></div>
                        ))}
                      </div>
                    </div>

                    {fundManagerMutation.isError && (
                      <div className="ob-error-banner">Something went wrong. Please try again.</div>
                    )}

                    <OBNav onBack={back} onFinish={() => fundManagerMutation.mutate()} isLast isLoading={fundManagerMutation.isPending} canNext={!fundManagerMutation.isPending && canProceedFundManager()} />
                  </OBStep>
                )}
              </>
            )}

          </AnimatePresence>
        </motion.div>

        <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
          className="ob-global-skip" onClick={() => navigate("/app/dashboard")}>
          Skip for now — complete profile later
        </motion.button>
      </div>

      <style>{obStyles}</style>
    </div>
  );
}

const obStyles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Outfit:wght@500;700;800&display=swap');
*{box-sizing:border-box}
.ob-page{min-height:100vh;background:rgb(11,11,15);font-family:'DM Sans',sans-serif;display:flex;align-items:flex-start;justify-content:center;padding:28px 20px 80px;position:relative;overflow:hidden}
.ob-bg{position:fixed;inset:0;pointer-events:none;z-index:0}
.ob-orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:.22}
.ob-orb--1{width:600px;height:600px;background:radial-gradient(circle,#8e84f7,transparent 70%);top:-250px;right:-150px}
.ob-orb--2{width:500px;height:500px;background:radial-gradient(circle,#c8aa82,transparent 70%);bottom:-200px;left:-150px}
.ob-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(142,132,247,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(142,132,247,.04) 1px,transparent 1px);background-size:44px 44px}

.ob-container{position:relative;z-index:1;width:100%;max-width:640px}
.ob-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;gap:16px}
.ob-logo{display:flex;align-items:center;gap:8px}
.ob-logo__name{font-family:'Outfit',sans-serif;font-weight:700;color:#fff;font-size:20px}

.ob-progress{flex:1;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.ob-progress__meta{display:flex;justify-content:space-between;width:100%}
.ob-progress__role{font-size:12px;color:rgba(255,255,255,.45)}
.ob-progress__step{font-size:12px;color:rgba(255,255,255,.3)}
.ob-progress__track{width:100%;height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.ob-progress__fill{height:100%;background:linear-gradient(90deg,#8e84f7,#c8aa82);border-radius:2px}

.ob-card{background:rgba(20,20,26,.92);border:1px solid rgba(142,132,247,.14);border-radius:22px;padding:36px 36px 28px;backdrop-filter:blur(18px);box-shadow:0 24px 64px rgba(0,0,0,.45),0 0 0 1px rgba(142,132,247,.06);min-height:420px}
@media(max-width:520px){.ob-card{padding:24px 20px 20px}}

.ob-step-hdr{margin-bottom:28px}
.ob-step-emoji{font-size:34px;display:block;margin-bottom:10px}
.ob-step-title{font-family:'Outfit',sans-serif;font-size:24px;font-weight:700;color:#fff;margin:0 0 5px;letter-spacing:-.5px}
.ob-step-sub{font-size:14px;color:rgba(255,255,255,.42);margin:0;line-height:1.5}

.ob-field{margin-bottom:20px}
.ob-field__top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
.ob-label{font-size:13px;font-weight:500;color:rgba(255,255,255,.58)}
.ob-hint{font-size:11px;color:rgba(255,255,255,.3)}
.ob-error-banner{padding:10px 14px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;font-size:13px;color:#f87171;margin-bottom:14px}
.ob-input{width:100%;padding:10px 13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .2s,box-shadow .2s}
.ob-input::placeholder{color:rgba(255,255,255,.18)}
.ob-input:focus{border-color:rgba(142,132,247,.5);box-shadow:0 0 0 3px rgba(142,132,247,.1)}
.ob-textarea{width:100%;padding:10px 13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;resize:none;line-height:1.5;transition:border-color .2s}
.ob-textarea::placeholder{color:rgba(255,255,255,.18)}
.ob-textarea:focus{border-color:rgba(142,132,247,.5)}

.ob-pill-wrap{display:flex;flex-wrap:wrap;gap:7px}
.ob-pill{padding:7px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:100px;color:rgba(255,255,255,.55);font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.ob-pill:hover:not(.ob-pill--disabled){background:rgba(142,132,247,.1);border-color:rgba(142,132,247,.3);color:#fff}
.ob-pill--on{background:rgba(142,132,247,.15);border-color:#8e84f7;color:#c4bef7}
.ob-pill--disabled{opacity:.35;cursor:not-allowed}

.ob-niche-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
@media(max-width:420px){.ob-niche-grid{grid-template-columns:1fr 1fr}}
.ob-niche-card{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.04);cursor:pointer;font-size:12px;color:rgba(255,255,255,.5);font-family:'DM Sans',sans-serif;transition:all .18s;text-align:center}
.ob-niche-card:hover{border-color:rgba(142,132,247,.35);background:rgba(142,132,247,.08);color:#fff}
.ob-niche-card--on{border-color:#8e84f7;background:rgba(142,132,247,.14);color:#c4bef7}

.ob-role-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
.ob-role-grid--3col{grid-template-columns:repeat(3,1fr)}
@media(max-width:640px){.ob-role-grid--3col{grid-template-columns:1fr 1fr}}
@media(max-width:480px){.ob-role-grid,.ob-role-grid--3col{grid-template-columns:1fr}}
.ob-role-card{text-align:left;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:18px 16px;cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif;position:relative}
.ob-role-card:hover{border-color:rgba(142,132,247,.3);background:rgba(142,132,247,.07)}
.ob-role-card--selected{border-color:#8e84f7;background:rgba(142,132,247,.1);box-shadow:0 0 0 1px rgba(142,132,247,.25)}
.ob-role-card__top{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
.ob-role-card__emoji{font-size:26px;flex-shrink:0;margin-top:1px}
.ob-role-card__label{font-size:15px;font-weight:600;color:#fff;margin:0 0 4px}
.ob-role-card__desc{font-size:12px;color:rgba(255,255,255,.42);margin:0;line-height:1.4}
.ob-role-card__check{position:absolute;top:12px;right:14px;font-size:14px;color:#8e84f7;font-weight:700}
.ob-role-card__bullets{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.ob-role-card__bullets li{font-size:12px;color:rgba(255,255,255,.45);display:flex;gap:7px;align-items:center}

.ob-deck-drop{border:1.5px dashed rgba(255,255,255,.15);border-radius:12px;padding:28px 20px;text-align:center;cursor:pointer;transition:all .2s}
.ob-deck-drop:hover,.ob-deck-drop--active{border-color:rgba(142,132,247,.5);background:rgba(142,132,247,.05)}
.ob-deck-uploaded{display:flex;align-items:center;gap:12px;padding:14px 16px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:12px}

.ob-summary-card{background:rgba(142,132,247,.05);border:1px solid rgba(142,132,247,.15);border-radius:14px;padding:20px;margin-bottom:20px;display:flex;flex-direction:column;gap:16px}
.ob-summary-section__title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:rgba(142,132,247,.8);margin:0 0 10px}
.ob-summary-row{display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.ob-summary-row:last-child{border-bottom:none}
.ob-summary-row__key{font-size:13px;color:rgba(255,255,255,.4)}
.ob-summary-row__val{font-size:13px;color:#fff;font-weight:500;text-align:right;max-width:65%;word-break:break-word}

.ob-launch-features{margin-bottom:20px}
.ob-launch-features__title{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:rgba(255,255,255,.3);margin:0 0 12px}
.ob-launch-features__list{display:flex;flex-direction:column;gap:9px}
.ob-launch-feature{display:flex;gap:11px;align-items:center;font-size:13px;color:rgba(255,255,255,.6)}
.ob-launch-feature span:first-child{font-size:16px}

.ob-nav{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:24px}
.ob-btn-back{padding:11px 18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:rgba(255,255,255,.5);font-size:14px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.ob-btn-back:hover{background:rgba(255,255,255,.09);color:#fff}
.ob-btn-next{padding:11px 26px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 16px rgba(142,132,247,.3);transition:all .18s;display:flex;align-items:center;gap:8px;white-space:nowrap}
.ob-btn-next:hover:not(:disabled){box-shadow:0 6px 20px rgba(142,132,247,.4)}
.ob-btn-next:disabled{opacity:.5;cursor:not-allowed}
.ob-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:obSpin .7s linear infinite;display:inline-block}
@keyframes obSpin{to{transform:rotate(360deg)}}

.ob-global-skip{display:block;margin:20px auto 0;background:none;border:none;color:rgba(255,255,255,.22);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:color .18s}
.ob-global-skip:hover{color:rgba(255,255,255,.5)}
`;
