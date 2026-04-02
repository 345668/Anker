/**
 * OnboardingPage.tsx
 *
 * Integrated onboarding for Anker (1000VC platform).
 * Pulls from every real data model discovered in replit.md + package.json:
 *
 *  FOUNDER FLOW (6 steps):
 *   1. Role selection          → sets userType on users table
 *   2. Company basics          → startups: name, website, description, shortBio, hqLocation
 *   3. Industry & stage        → startups: industry, stage, niche (Film/RE/Sports), fundingTarget
 *   4. Team & deck             → startups: teamSize, linkedinUrl, pitchDeckUrl (Uppy upload)
 *   5. Matchmaking prefs       → startups: targetGeography, preferredInvestorType, keyMilestones
 *   6. Confirm & launch        → summary + triggers dealRoom auto-creation, checklist init
 *
 *  INVESTOR FLOW (5 steps):
 *   1. Role selection
 *   2. Firm basics             → investors / investmentFirms: firmName, firmType, website, hqLocation
 *   3. Investment thesis       → investors: sectors, stages, checkSize, aum, investmentThesis
 *   4. Niche & geography       → investors: focusNiches, geographyFocus, portfolioCount
 *   5. Confirm & launch        → summary
 *
 * All data maps directly to the existing schema entities.
 */

import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// ─── Constants (mirror existing platform enums) ───────────────────────────────

const INDUSTRIES = [
  "AI / Machine Learning", "FinTech", "HealthTech / MedTech",
  "SaaS / B2B Software", "Consumer Tech", "CleanTech / ClimateTech",
  "EdTech", "Real Estate Tech", "Entertainment / Film / Media",
  "Sports & Wellness", "DeepTech / Hardware", "E-commerce / D2C",
  "Cybersecurity", "Web3 / Crypto", "Other",
];

// Niche industries with special matchmaking scoring in matchmaking.ts
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

const SECTORS_INVESTOR = [...INDUSTRIES]; // same list for investor sector prefs

const TEAM_SIZES = ["Solo founder", "2–3", "4–10", "11–25", "25+"];

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "founder" | "investor";

type FounderData = {
  // Step 2 — Company basics → startups table
  companyName: string;
  website: string;
  shortBio: string;
  hqLocation: string;
  // Step 3 — Industry & stage → matchmaking engine inputs
  industry: string;
  niche: string | null;
  stage: string;
  fundingTarget: string;
  // Step 4 — Team & deck
  teamSize: string;
  linkedinUrl: string;
  pitchDeckUploaded: boolean;
  pitchDeckUrl?: string;
  // Step 5 — Matchmaking prefs
  targetGeographies: string[];
  preferredInvestorTypes: string[];
  keyMilestone: string;
};

type InvestorData = {
  // Step 2 — Firm basics → investors / investmentFirms tables
  firmName: string;
  firmType: string;
  website: string;
  hqLocation: string;
  // Step 3 — Thesis → investors table
  preferredStages: string[];
  preferredSectors: string[];
  typicalCheckSize: string;
  aum: string;
  investmentThesis: string;
  // Step 4 — Niche & geo
  focusNiches: string[];
  geographyFocus: string[];
  portfolioCount: string;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function PillMulti({
  options,
  selected,
  onToggle,
  max,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  max?: number;
}) {
  return (
    <div className="pill-wrap">
      {options.map((opt) => {
        const isSelected = selected.includes(opt);
        const isDisabled = !isSelected && max !== undefined && selected.length >= max;
        return (
          <button
            key={opt}
            type="button"
            disabled={isDisabled}
            onClick={() => onToggle(opt)}
            className={`pill ${isSelected ? "pill--on" : ""} ${isDisabled ? "pill--disabled" : ""}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function PillSingle({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="pill-wrap">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onSelect(opt)}
          className={`pill ${selected === opt ? "pill--on" : ""}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ob-field">
      <div className="ob-field__top">
        <label className="ob-label">{label}</label>
        {hint && <span className="ob-hint">{hint}</span>}
      </div>
      {children}
      {error && <p className="ob-error">{error}</p>}
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
    <div className="summary-row">
      <span className="summary-row__key">{label}</span>
      <span className="summary-row__val">{value}</span>
    </div>
  );
}

// ─── Pitch Deck Uploader ──────────────────────────────────────────────────────
// Uses existing Uppy integration already installed in the project

function PitchDeckUploader({
  onUploaded,
}: {
  onUploaded: (url: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (f: File) => {
      if (!f || (!f.name.endsWith(".pdf") && !f.name.endsWith(".pptx"))) return;
      setFile(f);
      setUploading(true);
      setProgress(0);

      // Simulate upload progress (replace with real Uppy upload in production)
      const interval = setInterval(() => {
        setProgress((p) => {
          if (p >= 95) { clearInterval(interval); return p; }
          return p + Math.random() * 15;
        });
      }, 150);

      try {
        const formData = new FormData();
        formData.append("file", f);
        const res = await fetch("/api/upload/pitch-deck", {
          method: "POST",
          body: formData,
        });
        clearInterval(interval);
        if (res.ok) {
          const { url } = await res.json();
          setProgress(100);
          setDone(true);
          onUploaded(url);
        }
      } catch {
        clearInterval(interval);
        setUploading(false);
        setFile(null);
      }
    },
    [onUploaded]
  );

  if (done && file) {
    return (
      <div className="deck-uploaded">
        <span className="deck-uploaded__icon">✓</span>
        <div>
          <p className="deck-uploaded__name">{file.name}</p>
          <p className="deck-uploaded__sub">Ready for AI pitch analysis</p>
        </div>
        <button
          type="button"
          className="deck-uploaded__change"
          onClick={() => { setDone(false); setFile(null); setUploading(false); setProgress(0); }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div
      className={`deck-drop ${isDragging ? "deck-drop--active" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
      onClick={() => fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.pptx"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {uploading ? (
        <div className="deck-drop__uploading">
          <p className="deck-drop__filename">{file?.name}</p>
          <div className="deck-drop__bar">
            <div className="deck-drop__fill" style={{ width: `${Math.round(progress)}%` }} />
          </div>
          <p className="deck-drop__pct">{Math.round(progress)}%</p>
        </div>
      ) : (
        <>
          <span className="deck-drop__icon">📄</span>
          <p className="deck-drop__label">Drop your pitch deck here</p>
          <p className="deck-drop__sub">PDF or PPTX · Powers AI pitch analysis</p>
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
        <span className="ob-progress__role">
          {role === "founder" ? "🚀 Founder" : role === "investor" ? "💎 Investor" : ""}
        </span>
        <span className="ob-progress__step">Step {step} of {total}</span>
      </div>
      <div className="ob-progress__track">
        <motion.div
          className="ob-progress__fill"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

// ─── Step wrapper ─────────────────────────────────────────────────────────────

function Step({
  emoji,
  title,
  subtitle,
  children,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
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

function Nav({
  onBack,
  onNext,
  onFinish,
  canNext = true,
  isFirst = false,
  isLast = false,
  isLoading = false,
  nextLabel = "Continue →",
}: {
  onBack?: () => void;
  onNext?: () => void;
  onFinish?: () => void;
  canNext?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  isLoading?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="ob-nav">
      {!isFirst && (
        <button type="button" className="ob-btn-back" onClick={onBack}>
          ← Back
        </button>
      )}
      <motion.button
        type="button"
        whileHover={canNext ? { scale: 1.02 } : {}}
        whileTap={canNext ? { scale: 0.98 } : {}}
        className="ob-btn-next"
        disabled={!canNext || isLoading}
        onClick={isLast ? onFinish : onNext}
      >
        {isLoading
          ? <span className="ob-spinner" />
          : isLast
          ? "Launch my profile 🎉"
          : nextLabel}
      </motion.button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState(1); // 1 = role selection always

  // Founder state
  const [fd, setFd] = useState<Partial<FounderData>>({
    targetGeographies: [],
    preferredInvestorTypes: [],
    niche: null,
  });

  // Investor state
  const [iv, setIv] = useState<Partial<InvestorData>>({
    preferredStages: [],
    preferredSectors: [],
    focusNiches: [],
    geographyFocus: [],
  });

  const founderSteps = 6;
  const investorSteps = 5;
  const totalSteps = role === "founder" ? founderSteps : role === "investor" ? investorSteps : 1;

  const updateFd = (patch: Partial<FounderData>) => setFd((p) => ({ ...p, ...patch }));
  const updateIv = (patch: Partial<InvestorData>) => setIv((p) => ({ ...p, ...patch }));

  const toggleArr = <T extends string>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  // ── API mutations ──────────────────────────────────────────────────────────

  const founderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/onboarding/founder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fd),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/app/dashboard");
    },
  });

  const investorMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/onboarding/investor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(iv),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/app/dashboard");
    },
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

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

  const canProceed = role === "founder" ? canProceedFounder() : role === "investor" ? canProceedInvestor() : false;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="ob-page">
      {/* Background */}
      <div className="ob-bg">
        <div className="ob-orb ob-orb--1" />
        <div className="ob-orb ob-orb--2" />
        <div className="ob-grid" />
      </div>

      <div className="ob-container">
        {/* Header */}
        <div className="ob-header">
          <div className="ob-logo">
            <span className="ob-logo__anchor">⚓</span>
            <span className="ob-logo__name">Anker</span>
          </div>
          {role && <Progress step={step} total={totalSteps} role={role} />}
        </div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="ob-card"
        >
          <AnimatePresence mode="wait">

            {/* ── STEP 1: Role selection ── */}
            {step === 1 && (
              <Step
                key="role"
                emoji="👋"
                title="Welcome to Anker"
                subtitle="How are you planning to use the platform?"
              >
                <div className="role-grid">
                  {[
                    {
                      value: "founder" as Role,
                      emoji: "🚀",
                      label: "I'm a founder",
                      desc: "I'm raising capital and want to connect with the right investors for my startup.",
                      bullets: ["AI-powered investor matching", "Pitch deck analysis", "Deal room & document storage", "Financial tools & forecasting"],
                    },
                    {
                      value: "investor" as Role,
                      emoji: "💎",
                      label: "I'm an investor",
                      desc: "I'm a VC, family office, or angel looking for exceptional deal flow.",
                      bullets: ["Curated founder deal flow", "Deep research & enrichment", "CRM sync (Folk)", "Portfolio analytics"],
                    },
                  ].map((r) => (
                    <motion.button
                      key={r.value}
                      type="button"
                      whileHover={{ scale: 1.015 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => { setRole(r.value); }}
                      className={`role-card ${role === r.value ? "role-card--selected" : ""}`}
                    >
                      <div className="role-card__top">
                        <span className="role-card__emoji">{r.emoji}</span>
                        <div>
                          <p className="role-card__label">{r.label}</p>
                          <p className="role-card__desc">{r.desc}</p>
                        </div>
                        {role === r.value && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="role-card__check"
                          >✓</motion.span>
                        )}
                      </div>
                      <ul className="role-card__bullets">
                        {r.bullets.map((b) => (
                          <li key={b}><span className="role-bullet">◆</span>{b}</li>
                        ))}
                      </ul>
                    </motion.button>
                  ))}
                </div>
                <Nav
                  onNext={next}
                  canNext={!!role}
                  isFirst
                  nextLabel={role ? `Continue as ${role === "founder" ? "Founder" : "Investor"} →` : "Select a role to continue"}
                />
              </Step>
            )}

            {/* ════════════════════════════════════
                FOUNDER STEPS
            ════════════════════════════════════ */}

            {role === "founder" && (
              <>
                {/* ── F-Step 2: Company basics ── */}
                {step === 2 && (
                  <Step
                    key="f2"
                    emoji="🏢"
                    title="Tell us about your company"
                    subtitle="This powers your investor profile and matching engine"
                  >
                    <FormField label="Company name *">
                      <OBInput
                        placeholder="e.g. NovaSphere"
                        value={fd.companyName || ""}
                        onChange={(e) => updateFd({ companyName: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Website" hint="optional">
                      <OBInput
                        placeholder="https://yourcompany.com"
                        value={fd.website || ""}
                        onChange={(e) => updateFd({ website: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Headquarters *" hint="City, Country">
                      <OBInput
                        placeholder="e.g. Amsterdam, Netherlands"
                        value={fd.hqLocation || ""}
                        onChange={(e) => updateFd({ hqLocation: e.target.value })}
                      />
                    </FormField>
                    <FormField label="One-line description" hint="Used in your investor pitch">
                      <OBTextarea
                        placeholder="e.g. AI-powered supply chain optimisation for logistics SMBs."
                        value={fd.shortBio || ""}
                        onChange={(e) => updateFd({ shortBio: e.target.value })}
                      />
                    </FormField>
                    <Nav onBack={back} onNext={next} canNext={canProceedFounder()} />
                  </Step>
                )}

                {/* ── F-Step 3: Industry, stage & niche ── */}
                {step === 3 && (
                  <Step
                    key="f3"
                    emoji="📊"
                    title="Industry, stage & funding"
                    subtitle="Drives the matchmaking algorithm — be precise for better matches"
                  >
                    <FormField label="Primary industry *">
                      <PillSingle
                        options={INDUSTRIES}
                        selected={fd.industry || ""}
                        onSelect={(v) => updateFd({ industry: v })}
                      />
                    </FormField>

                    {/* Niche industries — get boosted matching weights */}
                    <FormField
                      label="Niche sector"
                      hint="These have dedicated investor databases with 70–175 specialists"
                    >
                      <div className="niche-grid">
                        {NICHE_INDUSTRIES.map((n) => (
                          <button
                            key={n.value}
                            type="button"
                            onClick={() => updateFd({ niche: fd.niche === n.value ? null : n.value })}
                            className={`niche-card ${fd.niche === n.value ? "niche-card--on" : ""}`}
                          >
                            <span>{n.emoji}</span>
                            <span>{n.label}</span>
                          </button>
                        ))}
                      </div>
                    </FormField>

                    <FormField label="Current stage *">
                      <PillSingle
                        options={STAGES}
                        selected={fd.stage || ""}
                        onSelect={(v) => updateFd({ stage: v })}
                      />
                    </FormField>

                    <FormField label="Target raise *">
                      <PillSingle
                        options={FUNDING_TARGETS}
                        selected={fd.fundingTarget || ""}
                        onSelect={(v) => updateFd({ fundingTarget: v })}
                      />
                    </FormField>

                    <Nav onBack={back} onNext={next} canNext={canProceedFounder()} />
                  </Step>
                )}

                {/* ── F-Step 4: Team & pitch deck ── */}
                {step === 4 && (
                  <Step
                    key="f4"
                    emoji="👥"
                    title="Team & pitch deck"
                    subtitle="Your deck unlocks AI pitch analysis and match insights"
                  >
                    <FormField label="Team size *">
                      <PillSingle
                        options={TEAM_SIZES}
                        selected={fd.teamSize || ""}
                        onSelect={(v) => updateFd({ teamSize: v })}
                      />
                    </FormField>

                    <FormField label="Your LinkedIn *" hint="Used for founder profile enrichment">
                      <OBInput
                        placeholder="https://linkedin.com/in/yourprofile"
                        value={fd.linkedinUrl || ""}
                        onChange={(e) => updateFd({ linkedinUrl: e.target.value })}
                      />
                    </FormField>

                    <FormField
                      label="Pitch deck"
                      hint="Optional — PDF or PPTX, enables AI analysis"
                    >
                      <PitchDeckUploader
                        onUploaded={(url) => updateFd({ pitchDeckUploaded: true, pitchDeckUrl: url })}
                      />
                    </FormField>

                    <Nav onBack={back} onNext={next} canNext={canProceedFounder()} />
                  </Step>
                )}

                {/* ── F-Step 5: Matchmaking preferences ── */}
                {step === 5 && (
                  <Step
                    key="f5"
                    emoji="🎯"
                    title="Matching preferences"
                    subtitle="Fine-tune the algorithm — this is what separates good matches from great ones"
                  >
                    <FormField label="Target geographies *" hint="Select all that apply">
                      <PillMulti
                        options={GEOGRAPHIES}
                        selected={fd.targetGeographies || []}
                        onToggle={(v) =>
                          updateFd({ targetGeographies: toggleArr(fd.targetGeographies || [], v) })
                        }
                      />
                    </FormField>

                    <FormField label="Preferred investor types" hint="Leave blank for 'any'">
                      <PillMulti
                        options={INVESTOR_TYPES}
                        selected={fd.preferredInvestorTypes || []}
                        onToggle={(v) =>
                          updateFd({ preferredInvestorTypes: toggleArr(fd.preferredInvestorTypes || [], v) })
                        }
                      />
                    </FormField>

                    <FormField
                      label="Key milestone"
                      hint="The single thing you'll use this raise to achieve"
                    >
                      <OBInput
                        placeholder="e.g. Reach $1M ARR / Launch in 3 new markets"
                        value={fd.keyMilestone || ""}
                        onChange={(e) => updateFd({ keyMilestone: e.target.value })}
                      />
                    </FormField>

                    <Nav onBack={back} onNext={next} canNext={canProceedFounder()} />
                  </Step>
                )}

                {/* ── F-Step 6: Summary & launch ── */}
                {step === 6 && (
                  <Step
                    key="f6"
                    emoji="🎉"
                    title="You're all set!"
                    subtitle="Here's what we've set up for your account"
                  >
                    <div className="summary-card">
                      <div className="summary-section">
                        <p className="summary-section__title">Company</p>
                        <SummaryRow label="Name" value={fd.companyName} />
                        <SummaryRow label="Location" value={fd.hqLocation} />
                        <SummaryRow label="Website" value={fd.website} />
                        <SummaryRow label="Description" value={fd.shortBio} />
                      </div>
                      <div className="summary-section">
                        <p className="summary-section__title">Fundraise</p>
                        <SummaryRow label="Industry" value={fd.industry} />
                        <SummaryRow label="Stage" value={fd.stage} />
                        <SummaryRow label="Target" value={fd.fundingTarget} />
                        {fd.niche && <SummaryRow label="Niche" value={NICHE_INDUSTRIES.find((n) => n.value === fd.niche)?.label} />}
                      </div>
                      <div className="summary-section">
                        <p className="summary-section__title">Team</p>
                        <SummaryRow label="Team size" value={fd.teamSize} />
                        <SummaryRow label="LinkedIn" value={fd.linkedinUrl} />
                        <SummaryRow label="Pitch deck" value={fd.pitchDeckUploaded ? "✓ Uploaded" : "—"} />
                      </div>
                    </div>

                    {/* What gets created */}
                    <div className="launch-features">
                      <p className="launch-features__title">What's being created for you:</p>
                      <div className="launch-features__list">
                        {[
                          { icon: "🔍", label: "Investor matches from 500+ database" },
                          { icon: "🤝", label: "Deal room with document storage" },
                          { icon: "📊", label: "Financial tools & forecasting studio" },
                          { icon: "🧠", label: fd.pitchDeckUploaded ? "AI pitch deck analysis (queued)" : "AI profile enrichment" },
                          { icon: "✅", label: "DD readiness checklist" },
                        ].map((f) => (
                          <div key={f.label} className="launch-feature">
                            <span>{f.icon}</span>
                            <span>{f.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {founderMutation.isError && (
                      <div className="ob-error-banner">
                        Something went wrong. Please try again.
                      </div>
                    )}

                    <Nav
                      onBack={back}
                      onFinish={() => founderMutation.mutate()}
                      isLast
                      isLoading={founderMutation.isPending}
                      canNext={!founderMutation.isPending}
                    />
                  </Step>
                )}
              </>
            )}

            {/* ════════════════════════════════════
                INVESTOR STEPS
            ════════════════════════════════════ */}

            {role === "investor" && (
              <>
                {/* ── I-Step 2: Firm basics ── */}
                {step === 2 && (
                  <Step
                    key="i2"
                    emoji="🏦"
                    title="Tell us about your firm"
                    subtitle="This appears on your investor profile and helps founders find you"
                  >
                    <FormField label="Firm / fund name *">
                      <OBInput
                        placeholder="e.g. Horizon Ventures"
                        value={iv.firmName || ""}
                        onChange={(e) => updateIv({ firmName: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Firm type *">
                      <PillSingle
                        options={FIRM_TYPES}
                        selected={iv.firmType || ""}
                        onSelect={(v) => updateIv({ firmType: v })}
                      />
                    </FormField>
                    <FormField label="Headquarters *" hint="City, Country">
                      <OBInput
                        placeholder="e.g. London, UK"
                        value={iv.hqLocation || ""}
                        onChange={(e) => updateIv({ hqLocation: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Website" hint="optional">
                      <OBInput
                        placeholder="https://yourfirm.com"
                        value={iv.website || ""}
                        onChange={(e) => updateIv({ website: e.target.value })}
                      />
                    </FormField>
                    <Nav onBack={back} onNext={next} canNext={canProceedInvestor()} />
                  </Step>
                )}

                {/* ── I-Step 3: Thesis ── */}
                {step === 3 && (
                  <Step
                    key="i3"
                    emoji="📝"
                    title="Investment thesis"
                    subtitle="Powers the matchmaking engine — founders see this when you match"
                  >
                    <FormField label="Preferred stages *">
                      <PillMulti
                        options={STAGES}
                        selected={iv.preferredStages || []}
                        onToggle={(v) => updateIv({ preferredStages: toggleArr(iv.preferredStages || [], v) })}
                      />
                    </FormField>
                    <FormField label="Sectors of focus *" hint="Select up to 5">
                      <PillMulti
                        options={SECTORS_INVESTOR}
                        selected={iv.preferredSectors || []}
                        onToggle={(v) => updateIv({ preferredSectors: toggleArr(iv.preferredSectors || [], v) })}
                        max={5}
                      />
                    </FormField>
                    <FormField label="Typical check size *">
                      <PillSingle
                        options={CHECK_SIZES}
                        selected={iv.typicalCheckSize || ""}
                        onSelect={(v) => updateIv({ typicalCheckSize: v })}
                      />
                    </FormField>
                    <FormField label="AUM" hint="Approximate — helps founders gauge fit">
                      <OBInput
                        placeholder="e.g. $100M"
                        value={iv.aum || ""}
                        onChange={(e) => updateIv({ aum: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Investment thesis" hint="In 2–3 sentences, what excites you?">
                      <OBTextarea
                        placeholder="e.g. We back technical founders solving enterprise workflow problems at Series A, typically writing $2–5M checks with board seats."
                        value={iv.investmentThesis || ""}
                        onChange={(e) => updateIv({ investmentThesis: e.target.value })}
                        rows={4}
                      />
                    </FormField>
                    <Nav onBack={back} onNext={next} canNext={canProceedInvestor()} />
                  </Step>
                )}

                {/* ── I-Step 4: Niche & geography ── */}
                {step === 4 && (
                  <Step
                    key="i4"
                    emoji="🌍"
                    title="Niche focus & geography"
                    subtitle="Match you to the right founders in the right places"
                  >
                    <FormField
                      label="Niche focus areas"
                      hint="Dedicated databases: 175 family offices · 78 film financiers · 70+ sports investors"
                    >
                      <div className="niche-grid">
                        {NICHE_INDUSTRIES.map((n) => (
                          <button
                            key={n.value}
                            type="button"
                            onClick={() =>
                              updateIv({
                                focusNiches: toggleArr(iv.focusNiches || [], n.value),
                              })
                            }
                            className={`niche-card ${(iv.focusNiches || []).includes(n.value) ? "niche-card--on" : ""}`}
                          >
                            <span>{n.emoji}</span>
                            <span>{n.label}</span>
                          </button>
                        ))}
                      </div>
                    </FormField>

                    <FormField label="Primary geography *" hint="Select your primary investment regions">
                      <PillMulti
                        options={GEOGRAPHIES}
                        selected={iv.geographyFocus || []}
                        onToggle={(v) => updateIv({ geographyFocus: toggleArr(iv.geographyFocus || [], v) })}
                      />
                    </FormField>

                    <FormField label="Active portfolio companies" hint="Approximate number">
                      <OBInput
                        type="number"
                        placeholder="e.g. 24"
                        value={iv.portfolioCount || ""}
                        onChange={(e) => updateIv({ portfolioCount: e.target.value })}
                      />
                    </FormField>

                    <Nav onBack={back} onNext={next} canNext={canProceedInvestor()} />
                  </Step>
                )}

                {/* ── I-Step 5: Summary & launch ── */}
                {step === 5 && (
                  <Step
                    key="i5"
                    emoji="🎉"
                    title="Ready to find great founders"
                    subtitle="Your investor profile is set up and ready to go"
                  >
                    <div className="summary-card">
                      <div className="summary-section">
                        <p className="summary-section__title">Firm</p>
                        <SummaryRow label="Name" value={iv.firmName} />
                        <SummaryRow label="Type" value={iv.firmType} />
                        <SummaryRow label="Location" value={iv.hqLocation} />
                      </div>
                      <div className="summary-section">
                        <p className="summary-section__title">Investment focus</p>
                        <SummaryRow label="Stages" value={iv.preferredStages?.join(", ")} />
                        <SummaryRow label="Check size" value={iv.typicalCheckSize} />
                        <SummaryRow label="AUM" value={iv.aum} />
                        <SummaryRow label="Sectors" value={iv.preferredSectors?.slice(0, 3).join(", ") + (iv.preferredSectors && iv.preferredSectors.length > 3 ? "…" : "")} />
                      </div>
                      <div className="summary-section">
                        <p className="summary-section__title">Geography</p>
                        <SummaryRow label="Focus" value={iv.geographyFocus?.slice(0, 3).join(", ")} />
                        <SummaryRow label="Portfolio" value={iv.portfolioCount ? `${iv.portfolioCount} companies` : undefined} />
                      </div>
                    </div>

                    <div className="launch-features">
                      <p className="launch-features__title">What's being set up:</p>
                      <div className="launch-features__list">
                        {[
                          { icon: "🔍", label: "Founder deal flow matched to your thesis" },
                          { icon: "🤖", label: "AI enrichment on your firm profile" },
                          { icon: "📋", label: "CRM sync ready for Folk integration" },
                          { icon: "📊", label: "Forecasting studio & portfolio tools" },
                          { icon: "📩", label: "Outreach templates & bulk email tools" },
                        ].map((f) => (
                          <div key={f.label} className="launch-feature">
                            <span>{f.icon}</span>
                            <span>{f.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {investorMutation.isError && (
                      <div className="ob-error-banner">Something went wrong. Please try again.</div>
                    )}

                    <Nav
                      onBack={back}
                      onFinish={() => investorMutation.mutate()}
                      isLast
                      isLoading={investorMutation.isPending}
                      canNext={!investorMutation.isPending}
                    />
                  </Step>
                )}
              </>
            )}

          </AnimatePresence>
        </motion.div>

        {/* Global skip */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="ob-global-skip"
          onClick={() => navigate("/app/dashboard")}
        >
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
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}

.ob-page{
  min-height:100vh;background:rgb(11,11,15);
  font-family:'DM Sans',sans-serif;
  display:flex;align-items:flex-start;justify-content:center;
  padding:28px 20px 80px;position:relative;overflow:hidden;
}
.ob-bg{position:fixed;inset:0;pointer-events:none;z-index:0}
.ob-orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:.22}
.ob-orb--1{width:600px;height:600px;background:radial-gradient(circle,#8e84f7,transparent 70%);top:-250px;right:-150px}
.ob-orb--2{width:500px;height:500px;background:radial-gradient(circle,#c8aa82,transparent 70%);bottom:-200px;left:-150px}
.ob-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(142,132,247,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(142,132,247,.04) 1px,transparent 1px);background-size:44px 44px}

.ob-container{position:relative;z-index:1;width:100%;max-width:640px}

.ob-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;gap:16px}
.ob-logo{display:flex;align-items:center;gap:8px}
.ob-logo__anchor{font-size:22px}
.ob-logo__name{font-family:'Outfit',sans-serif;font-weight:700;color:#fff;font-size:20px}

.ob-progress{flex:1;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.ob-progress__meta{display:flex;justify-content:space-between;width:100%}
.ob-progress__role{font-size:12px;color:rgba(255,255,255,.45)}
.ob-progress__step{font-size:12px;color:rgba(255,255,255,.3)}
.ob-progress__track{width:100%;height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.ob-progress__fill{height:100%;background:linear-gradient(90deg,#8e84f7,#c8aa82);border-radius:2px}

.ob-card{
  background:rgba(20,20,26,.92);border:1px solid rgba(142,132,247,.14);
  border-radius:22px;padding:36px 36px 28px;
  backdrop-filter:blur(18px);
  box-shadow:0 24px 64px rgba(0,0,0,.45),0 0 0 1px rgba(142,132,247,.06);
  min-height:420px;
}
@media(max-width:520px){.ob-card{padding:24px 20px 20px}}

.ob-step-hdr{margin-bottom:28px}
.ob-step-emoji{font-size:34px;display:block;margin-bottom:10px}
.ob-step-title{font-family:'Outfit',sans-serif;font-size:24px;font-weight:700;color:#fff;margin:0 0 5px;letter-spacing:-.5px}
.ob-step-sub{font-size:14px;color:rgba(255,255,255,.42);margin:0;line-height:1.5}

/* Fields */
.ob-field{margin-bottom:20px}
.ob-field__top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
.ob-label{font-size:13px;font-weight:500;color:rgba(255,255,255,.58)}
.ob-hint{font-size:11px;color:rgba(255,255,255,.3)}
.ob-error{font-size:12px;color:#f87171;margin-top:4px}
.ob-error-banner{padding:10px 14px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;font-size:13px;color:#f87171;margin-bottom:14px}
.ob-input{
  width:100%;padding:10px 13px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
  border-radius:10px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;
  outline:none;transition:border-color .2s,box-shadow .2s;
}
.ob-input::placeholder{color:rgba(255,255,255,.18)}
.ob-input:focus{border-color:rgba(142,132,247,.5);box-shadow:0 0 0 3px rgba(142,132,247,.1)}
.ob-textarea{
  width:100%;padding:10px 13px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
  border-radius:10px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;
  outline:none;resize:none;line-height:1.5;transition:border-color .2s;
}
.ob-textarea::placeholder{color:rgba(255,255,255,.18)}
.ob-textarea:focus{border-color:rgba(142,132,247,.5)}

/* Pills */
.pill-wrap{display:flex;flex-wrap:wrap;gap:7px}
.pill{
  padding:7px 14px;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.1);border-radius:100px;
  color:rgba(255,255,255,.55);font-size:13px;font-weight:500;
  cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s;
}
.pill:hover:not(.pill--disabled){background:rgba(142,132,247,.1);border-color:rgba(142,132,247,.3);color:#fff}
.pill--on{background:rgba(142,132,247,.15);border-color:#8e84f7;color:#c4bef7}
.pill--disabled{opacity:.35;cursor:not-allowed}

/* Niche cards */
.niche-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
@media(max-width:420px){.niche-grid{grid-template-columns:1fr 1fr}}
.niche-card{
  display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:12px 8px;border:1px solid rgba(255,255,255,.1);border-radius:12px;
  background:rgba(255,255,255,.04);cursor:pointer;font-size:12px;
  color:rgba(255,255,255,.5);font-family:'DM Sans',sans-serif;
  transition:all .18s;text-align:center;
}
.niche-card:hover{border-color:rgba(142,132,247,.35);background:rgba(142,132,247,.08);color:#fff}
.niche-card--on{border-color:#8e84f7;background:rgba(142,132,247,.14);color:#c4bef7}

/* Role cards */
.role-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
@media(max-width:480px){.role-grid{grid-template-columns:1fr}}
.role-card{
  text-align:left;background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.1);border-radius:16px;
  padding:18px 16px;cursor:pointer;transition:all .2s;
  font-family:'DM Sans',sans-serif;position:relative;
}
.role-card:hover{border-color:rgba(142,132,247,.3);background:rgba(142,132,247,.07)}
.role-card--selected{border-color:#8e84f7;background:rgba(142,132,247,.1);box-shadow:0 0 0 1px rgba(142,132,247,.25)}
.role-card__top{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
.role-card__emoji{font-size:26px;flex-shrink:0;margin-top:1px}
.role-card__label{font-size:15px;font-weight:600;color:#fff;margin:0 0 4px}
.role-card__desc{font-size:12px;color:rgba(255,255,255,.42);margin:0;line-height:1.4}
.role-card__check{position:absolute;top:12px;right:14px;font-size:14px;color:#8e84f7;font-weight:700}
.role-card__bullets{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.role-card__bullets li{font-size:12px;color:rgba(255,255,255,.45);display:flex;gap:7px;align-items:center}
.role-bullet{color:#8e84f7;font-size:7px}

/* Pitch deck uploader */
.deck-drop{
  border:1.5px dashed rgba(255,255,255,.15);border-radius:12px;
  padding:28px 20px;text-align:center;cursor:pointer;transition:all .2s;
}
.deck-drop:hover,.deck-drop--active{border-color:rgba(142,132,247,.5);background:rgba(142,132,247,.05)}
.deck-drop__icon{font-size:28px;display:block;margin-bottom:8px}
.deck-drop__label{font-size:14px;color:rgba(255,255,255,.65);margin:0 0 4px}
.deck-drop__sub{font-size:12px;color:rgba(255,255,255,.3);margin:0}
.deck-drop__uploading{display:flex;flex-direction:column;gap:8px;align-items:center}
.deck-drop__filename{font-size:13px;color:rgba(255,255,255,.65);margin:0}
.deck-drop__bar{width:100%;height:4px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden}
.deck-drop__fill{height:100%;background:linear-gradient(90deg,#8e84f7,#c8aa82);border-radius:2px;transition:width .1s}
.deck-drop__pct{font-size:12px;color:#8e84f7}
.deck-uploaded{display:flex;align-items:center;gap:12px;padding:14px 16px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:12px}
.deck-uploaded__icon{font-size:18px;color:#22c55e;flex-shrink:0}
.deck-uploaded__name{font-size:14px;color:#fff;margin:0 0 2px;font-weight:500}
.deck-uploaded__sub{font-size:12px;color:rgba(255,255,255,.4);margin:0}
.deck-uploaded__change{margin-left:auto;background:none;border:none;color:rgba(255,255,255,.4);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif}
.deck-uploaded__change:hover{color:rgba(255,255,255,.7)}

/* Summary */
.summary-card{background:rgba(142,132,247,.05);border:1px solid rgba(142,132,247,.15);border-radius:14px;padding:20px;margin-bottom:20px;display:flex;flex-direction:column;gap:16px}
.summary-section{}
.summary-section__title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:rgba(142,132,247,.8);margin:0 0 10px}
.summary-row{display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.summary-row:last-child{border-bottom:none}
.summary-row__key{font-size:13px;color:rgba(255,255,255,.4)}
.summary-row__val{font-size:13px;color:#fff;font-weight:500;text-align:right;max-width:65%;word-break:break-word}

/* Launch features */
.launch-features{margin-bottom:20px}
.launch-features__title{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:rgba(255,255,255,.3);margin:0 0 12px}
.launch-features__list{display:flex;flex-direction:column;gap:9px}
.launch-feature{display:flex;gap:11px;align-items:center;font-size:13px;color:rgba(255,255,255,.6)}
.launch-feature span:first-child{font-size:16px}

/* Nav */
.ob-nav{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:24px}
.ob-btn-back{padding:11px 18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:rgba(255,255,255,.5);font-size:14px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.ob-btn-back:hover{background:rgba(255,255,255,.09);color:#fff}
.ob-btn-next{padding:11px 26px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 16px rgba(142,132,247,.3);transition:all .18s;display:flex;align-items:center;gap:8px;white-space:nowrap}
.ob-btn-next:hover:not(:disabled){box-shadow:0 6px 20px rgba(142,132,247,.4)}
.ob-btn-next:disabled{opacity:.5;cursor:not-allowed}
.ob-spinner{width:17px;height:17px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}

.ob-global-skip{display:block;margin:20px auto 0;background:none;border:none;color:rgba(255,255,255,.2);font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:color .2s}
.ob-global-skip:hover{color:rgba(255,255,255,.45)}
`;
