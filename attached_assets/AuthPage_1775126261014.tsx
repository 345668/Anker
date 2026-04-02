/**
 * client/src/pages/AuthPage.tsx
 *
 * Unified auth page for Anker.
 * - Tab toggle: Sign In ↔ Create Account
 * - OAuth: Google, GitHub, LinkedIn (all already in package.json)
 * - Email/password with 3-step signup wizard
 * - Role selection feeds userType → onboarding redirect
 * - Uses useAuth() hook for all mutations
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../hooks/use-auth";

// ─── OAuth button ─────────────────────────────────────────────────────────────

interface OAuthBtnProps {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}
function OAuthBtn({ onClick, children, label }: OAuthBtnProps) {
  return (
    <button type="button" onClick={onClick} className="auth-oauth-btn">
      <span className="auth-oauth-btn__icon">{children}</span>
      <span>{label}</span>
    </button>
  );
}

// ─── Password strength meter ──────────────────────────────────────────────────

function PasswordStrength({ pw }: { pw: string }) {
  if (!pw) return null;
  const checks = [
    pw.length >= 8,
    /[A-Z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ];
  const score = checks.filter(Boolean).length;
  const color = ["", "#ef4444", "#f59e0b", "#3b82f6", "#22c55e"][score];
  const label = ["", "Weak", "Fair", "Good", "Strong"][score];
  return (
    <div className="pw-meter">
      <div className="pw-meter__bars">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="pw-meter__bar"
            style={{ background: i <= score ? color : "rgba(255,255,255,0.1)" }}
          />
        ))}
      </div>
      <span className="pw-meter__label" style={{ color }}>{label}</span>
    </div>
  );
}

// ─── Step dots ────────────────────────────────────────────────────────────────

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="step-dots">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`step-dot ${i + 1 === step ? "step-dot--active" : ""} ${i + 1 < step ? "step-dot--done" : ""}`}
        />
      ))}
    </div>
  );
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908C16.658 14.251 17.64 11.945 17.64 9.2z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

const GitHubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23a11.5 11.5 0 0 1 3-.405c1.02.005 2.045.138 3 .405 2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

// ─── Main component ───────────────────────────────────────────────────────────

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState(1);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "",
    password: "", confirmPassword: "",
    role: "" as "founder" | "investor" | "",
    agreeTerms: false,
  });
  const [fieldError, setFieldError] = useState("");

  const { login, signup, loginWithGoogle, loginWithGitHub, loginWithLinkedIn } = useAuth();

  const upd = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  // ── Login submit ───────────────────────────────────────────────────────────
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError("");
    if (!form.email || !form.password) {
      setFieldError("Please fill in all fields.");
      return;
    }
    login.mutate({ email: form.email, password: form.password });
  };

  // ── Signup step validation ─────────────────────────────────────────────────
  const nextStep = () => {
    setFieldError("");
    if (step === 1) {
      if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
        setFieldError("Please fill in all fields.");
        return;
      }
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
      if (!emailOk) { setFieldError("Please enter a valid email address."); return; }
    }
    if (step === 2) {
      if (!form.password) { setFieldError("Please enter a password."); return; }
      if (form.password.length < 8) { setFieldError("Password must be at least 8 characters."); return; }
      if (form.password !== form.confirmPassword) { setFieldError("Passwords do not match."); return; }
    }
    setStep((s) => s + 1);
  };

  // ── Signup submit ──────────────────────────────────────────────────────────
  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError("");
    if (!form.role) { setFieldError("Please select your role."); return; }
    if (!form.agreeTerms) { setFieldError("Please accept the terms to continue."); return; }
    signup.mutate({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      password: form.password,
      role: form.role as "founder" | "investor",
    });
  };

  const switchMode = (m: "login" | "signup") => {
    setMode(m);
    setStep(1);
    setFieldError("");
    login.reset?.();
    signup.reset?.();
  };

  const errorMsg =
    fieldError ||
    (login.isError ? (login.error as Error).message : "") ||
    (signup.isError ? (signup.error as Error).message : "");

  return (
    <div className="auth-page">
      {/* Animated background */}
      <div className="auth-bg">
        <div className="auth-bg__orb auth-bg__orb--1" />
        <div className="auth-bg__orb auth-bg__orb--2" />
        <div className="auth-bg__orb auth-bg__orb--3" />
        <div className="auth-bg__grid" />
      </div>

      <div className="auth-layout">
        {/* ── Left brand panel ── */}
        <motion.div
          initial={{ opacity: 0, x: -32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          className="auth-brand"
        >
          <div className="auth-brand__logo">
            <span>⚓</span>
            <span className="auth-brand__name">Anker</span>
          </div>
          <h1 className="auth-brand__headline">
            Fueling<br />
            <span className="auth-brand__accent">Founders</span><br />
            with Capital
          </h1>
          <p className="auth-brand__sub">
            AI-powered investor matching. MBB-grade deal intelligence. Built for the next generation of exceptional founders.
          </p>
          <div className="auth-brand__stats">
            {[
              { n: "500+", l: "Investors" },
              { n: "3 niches", l: "Film · RE · Sports" },
              { n: "94%", l: "Match accuracy" },
            ].map((s) => (
              <div key={s.l} className="auth-brand__stat">
                <span className="auth-brand__stat-n">{s.n}</span>
                <span className="auth-brand__stat-l">{s.l}</span>
              </div>
            ))}
          </div>
          <div className="auth-brand__testimonial">
            <p className="auth-brand__quote">
              "Anker matched us with our Series A lead in 11 days. The AI pitch analysis flagged exactly what we needed to fix."
            </p>
            <div className="auth-brand__author">
              <div className="auth-brand__avatar">JR</div>
              <div>
                <p className="auth-brand__author-name">Jordan Rivera</p>
                <p className="auth-brand__author-role">CEO, NovaSphere · $4M Series A</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Right form panel ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="auth-card"
        >
          {/* Mode tabs */}
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === "login" ? "auth-tab--on" : ""}`}
              onClick={() => switchMode("login")}
            >Sign In</button>
            <button
              className={`auth-tab ${mode === "signup" ? "auth-tab--on" : ""}`}
              onClick={() => switchMode("signup")}
            >Create Account</button>
            <div className={`auth-tabs__slider ${mode === "signup" ? "auth-tabs__slider--right" : ""}`} />
          </div>

          <AnimatePresence mode="wait">
            {/* ════ LOGIN ════ */}
            {mode === "login" && (
              <motion.div
                key="login"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <p className="auth-heading">Welcome back</p>
                <p className="auth-sub">Sign in to your Anker account</p>

                <OAuthRow
                  onGoogle={loginWithGoogle}
                  onGitHub={loginWithGitHub}
                  onLinkedIn={loginWithLinkedIn}
                />
                <Divider />

                <form onSubmit={handleLogin}>
                  <Field label="Email">
                    <input
                      className="auth-input"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => upd({ email: e.target.value })}
                    />
                  </Field>
                  <Field label="Password" action={<a href="/forgot-password" className="auth-link">Forgot?</a>}>
                    <div className="auth-input-wrap">
                      <input
                        className="auth-input"
                        type={showPw ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        value={form.password}
                        onChange={(e) => upd({ password: e.target.value })}
                      />
                      <button type="button" className="auth-eye" onClick={() => setShowPw(!showPw)}>
                        {showPw ? "🙈" : "👁"}
                      </button>
                    </div>
                  </Field>

                  {errorMsg && <p className="auth-error">{errorMsg}</p>}

                  <PrimaryBtn type="submit" loading={login.isPending}>
                    Sign In
                  </PrimaryBtn>
                </form>
              </motion.div>
            )}

            {/* ════ SIGNUP ════ */}
            {mode === "signup" && (
              <motion.div
                key="signup"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <div className="auth-signup-hdr">
                  <div>
                    <p className="auth-heading">
                      {step === 1 && "Create your account"}
                      {step === 2 && "Secure your account"}
                      {step === 3 && "Who are you?"}
                    </p>
                    <p className="auth-sub">
                      {step === 1 && "Quick to set up — or use OAuth below"}
                      {step === 2 && "Choose a strong password"}
                      {step === 3 && "This determines your dashboard and matching"}
                    </p>
                  </div>
                  <StepDots step={step} total={3} />
                </div>

                {/* OAuth — step 1 only */}
                {step === 1 && (
                  <>
                    <OAuthRow
                      onGoogle={loginWithGoogle}
                      onGitHub={loginWithGitHub}
                      onLinkedIn={loginWithLinkedIn}
                    />
                    <Divider />
                  </>
                )}

                <form onSubmit={step === 3 ? handleSignup : (e) => { e.preventDefault(); nextStep(); }}>
                  <AnimatePresence mode="wait">
                    {/* Step 1 — name + email */}
                    {step === 1 && (
                      <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
                        <div className="auth-row">
                          <Field label="First name">
                            <input className="auth-input" placeholder="Jane" value={form.firstName} onChange={(e) => upd({ firstName: e.target.value })} autoComplete="given-name" />
                          </Field>
                          <Field label="Last name">
                            <input className="auth-input" placeholder="Smith" value={form.lastName} onChange={(e) => upd({ lastName: e.target.value })} autoComplete="family-name" />
                          </Field>
                        </div>
                        <Field label="Email address">
                          <input className="auth-input" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => upd({ email: e.target.value })} autoComplete="email" />
                        </Field>
                        {errorMsg && <p className="auth-error">{errorMsg}</p>}
                        <PrimaryBtn type="submit">Continue →</PrimaryBtn>
                      </motion.div>
                    )}

                    {/* Step 2 — password */}
                    {step === 2 && (
                      <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
                        <Field label="Password">
                          <div className="auth-input-wrap">
                            <input className="auth-input" type={showPw ? "text" : "password"} placeholder="Min 8 characters" value={form.password} onChange={(e) => upd({ password: e.target.value })} autoComplete="new-password" />
                            <button type="button" className="auth-eye" onClick={() => setShowPw(!showPw)}>{showPw ? "🙈" : "👁"}</button>
                          </div>
                          <PasswordStrength pw={form.password} />
                        </Field>
                        <Field label="Confirm password">
                          <input className="auth-input" type={showPw ? "text" : "password"} placeholder="Repeat password" value={form.confirmPassword} onChange={(e) => upd({ confirmPassword: e.target.value })} autoComplete="new-password" />
                        </Field>
                        {errorMsg && <p className="auth-error">{errorMsg}</p>}
                        <div className="auth-btn-row">
                          <button type="button" className="auth-back-btn" onClick={() => setStep(1)}>← Back</button>
                          <PrimaryBtn type="submit" flex>Continue →</PrimaryBtn>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 3 — role selection */}
                    {step === 3 && (
                      <motion.div key="s3" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
                        <div className="auth-roles">
                          {[
                            { v: "founder" as const, emoji: "🚀", label: "Founder", desc: "I'm raising capital" },
                            { v: "investor" as const, emoji: "💎", label: "Investor", desc: "I'm deploying capital" },
                          ].map((r) => (
                            <motion.button
                              key={r.v}
                              type="button"
                              whileTap={{ scale: 0.97 }}
                              onClick={() => upd({ role: r.v })}
                              className={`auth-role-card ${form.role === r.v ? "auth-role-card--on" : ""}`}
                            >
                              <span className="auth-role-card__emoji">{r.emoji}</span>
                              <span className="auth-role-card__label">{r.label}</span>
                              <span className="auth-role-card__desc">{r.desc}</span>
                              {form.role === r.v && <span className="auth-role-card__check">✓</span>}
                            </motion.button>
                          ))}
                        </div>
                        <label className="auth-terms">
                          <input
                            type="checkbox"
                            checked={form.agreeTerms}
                            onChange={(e) => upd({ agreeTerms: e.target.checked })}
                            style={{ accentColor: "#8e84f7" }}
                          />
                          <span>
                            I agree to the{" "}
                            <a href="/terms" className="auth-link">Terms of Service</a>
                            {" "}and{" "}
                            <a href="/privacy" className="auth-link">Privacy Policy</a>
                          </span>
                        </label>
                        {errorMsg && <p className="auth-error">{errorMsg}</p>}
                        <div className="auth-btn-row">
                          <button type="button" className="auth-back-btn" onClick={() => setStep(2)}>← Back</button>
                          <PrimaryBtn type="submit" loading={signup.isPending} flex>
                            Create Account
                          </PrimaryBtn>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <style>{authStyles}</style>
    </div>
  );
}

// ─── Small shared components ──────────────────────────────────────────────────

function OAuthRow({ onGoogle, onGitHub, onLinkedIn }: { onGoogle: () => void; onGitHub: () => void; onLinkedIn: () => void }) {
  return (
    <div className="auth-oauth-row">
      <OAuthBtn onClick={onGoogle} label="Google"><GoogleIcon /></OAuthBtn>
      <OAuthBtn onClick={onGitHub} label="GitHub"><GitHubIcon /></OAuthBtn>
      <OAuthBtn onClick={onLinkedIn} label="LinkedIn"><LinkedInIcon /></OAuthBtn>
    </div>
  );
}

function Divider() {
  return (
    <div className="auth-divider">
      <span>or continue with email</span>
    </div>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="auth-field">
      <div className="auth-field__hdr">
        <label className="auth-label">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

function PrimaryBtn({
  children, type = "button", loading = false, flex = false, onClick,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  loading?: boolean;
  flex?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      type={type}
      onClick={onClick}
      disabled={loading}
      className="auth-primary-btn"
      style={flex ? { flex: 1 } : {}}
    >
      {loading ? <span className="auth-spinner" /> : children}
    </motion.button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const authStyles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Outfit:wght@700;800&display=swap');
*{box-sizing:border-box}
.auth-page{min-height:100vh;background:rgb(11,11,15);display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;padding:24px;position:relative;overflow:hidden}
.auth-bg{position:fixed;inset:0;pointer-events:none;z-index:0}
.auth-bg__orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.3;animation:authOrb 9s ease-in-out infinite}
.auth-bg__orb--1{width:520px;height:520px;background:radial-gradient(circle,#8e84f7,transparent 70%);top:-220px;left:-100px;animation-delay:0s}
.auth-bg__orb--2{width:420px;height:420px;background:radial-gradient(circle,#c8aa82,transparent 70%);bottom:-160px;right:-100px;animation-delay:3.5s}
.auth-bg__orb--3{width:300px;height:300px;background:radial-gradient(circle,#6366f1,transparent 70%);top:50%;right:28%;animation-delay:7s}
.auth-bg__grid{position:absolute;inset:0;background-image:linear-gradient(rgba(142,132,247,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(142,132,247,.04) 1px,transparent 1px);background-size:42px 42px}
@keyframes authOrb{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-24px) scale(1.04)}}

.auth-layout{position:relative;z-index:1;display:grid;grid-template-columns:1fr 460px;gap:64px;width:100%;max-width:1060px;align-items:center}
@media(max-width:880px){.auth-layout{grid-template-columns:1fr;max-width:460px}.auth-brand{display:none}}

/* Brand */
.auth-brand{color:#fff}
.auth-brand__logo{display:flex;align-items:center;gap:10px;margin-bottom:36px;font-size:22px}
.auth-brand__name{font-family:'Outfit',sans-serif;font-size:22px;font-weight:700}
.auth-brand__headline{font-family:'Outfit',sans-serif;font-size:50px;font-weight:800;line-height:1.1;margin:0 0 18px;letter-spacing:-2px}
.auth-brand__accent{background:linear-gradient(135deg,#8e84f7,#c8aa82);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.auth-brand__sub{font-size:16px;color:rgba(255,255,255,.5);margin:0 0 36px;line-height:1.65;max-width:370px}
.auth-brand__stats{display:flex;gap:28px;margin-bottom:36px}
.auth-brand__stat-n{display:block;font-family:'Outfit',sans-serif;font-size:26px;font-weight:700;color:#8e84f7}
.auth-brand__stat-l{font-size:12px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.5px}
.auth-brand__testimonial{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:20px 22px}
.auth-brand__quote{font-size:14px;color:rgba(255,255,255,.7);font-style:italic;margin:0 0 14px;line-height:1.6}
.auth-brand__author{display:flex;align-items:center;gap:11px}
.auth-brand__avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#8e84f7,#c8aa82);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
.auth-brand__author-name{font-size:13px;font-weight:600;color:#fff;margin:0}
.auth-brand__author-role{font-size:11px;color:rgba(255,255,255,.38);margin:2px 0 0}

/* Card */
.auth-card{background:rgba(20,20,27,.93);border:1px solid rgba(142,132,247,.15);border-radius:22px;padding:34px;backdrop-filter:blur(20px);box-shadow:0 24px 64px rgba(0,0,0,.42),0 0 0 1px rgba(142,132,247,.07)}

/* Tabs */
.auth-tabs{display:grid;grid-template-columns:1fr 1fr;background:rgba(255,255,255,.05);border-radius:11px;padding:4px;margin-bottom:26px;position:relative}
.auth-tab{position:relative;z-index:1;padding:9px;background:none;border:none;color:rgba(255,255,255,.38);font-size:14px;font-weight:500;cursor:pointer;transition:color .2s;font-family:'DM Sans',sans-serif;border-radius:8px}
.auth-tab--on{color:#fff}
.auth-tabs__slider{position:absolute;top:4px;bottom:4px;left:4px;width:calc(50% - 4px);background:rgba(142,132,247,.18);border-radius:8px;transition:transform .25s cubic-bezier(.4,0,.2,1);border:1px solid rgba(142,132,247,.25)}
.auth-tabs__slider--right{transform:translateX(100%)}

.auth-heading{font-family:'Outfit',sans-serif;font-size:21px;font-weight:700;color:#fff;margin:0 0 3px;letter-spacing:-.4px}
.auth-sub{font-size:13px;color:rgba(255,255,255,.4);margin:0 0 22px}
.auth-signup-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:0;gap:12px}
.auth-signup-hdr .auth-sub{margin-bottom:20px}

/* Step dots */
.step-dots{display:flex;gap:5px;align-items:center;padding-top:4px;flex-shrink:0}
.step-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.15);transition:all .25s}
.step-dot--active{background:#8e84f7;width:18px;border-radius:4px}
.step-dot--done{background:rgba(142,132,247,.45)}

/* OAuth */
.auth-oauth-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:18px}
.auth-oauth-btn{display:flex;align-items:center;justify-content:center;gap:7px;padding:9px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:rgba(255,255,255,.7);font-size:13px;font-weight:500;cursor:pointer;transition:all .18s;font-family:'DM Sans',sans-serif}
.auth-oauth-btn:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.2);color:#fff}
.auth-oauth-btn__icon{display:flex;align-items:center}

.auth-divider{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.08)}
.auth-divider span{font-size:11px;color:rgba(255,255,255,.28);white-space:nowrap}

/* Fields */
.auth-field{margin-bottom:15px}
.auth-field__hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.auth-label{font-size:12px;font-weight:500;color:rgba(255,255,255,.55)}
.auth-link{font-size:12px;color:#8e84f7;text-decoration:none}
.auth-link:hover{text-decoration:underline}
.auth-input{width:100%;padding:10px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .18s,box-shadow .18s}
.auth-input::placeholder{color:rgba(255,255,255,.18)}
.auth-input:focus{border-color:rgba(142,132,247,.5);box-shadow:0 0 0 3px rgba(142,132,247,.1)}
.auth-input-wrap{position:relative}
.auth-input-wrap .auth-input{padding-right:38px}
.auth-eye{position:absolute;right:11px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:13px;opacity:.4;transition:opacity .18s}
.auth-eye:hover{opacity:.75}
.auth-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.auth-error{font-size:12px;color:#f87171;margin:0 0 12px;padding:8px 12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px}

/* Password meter */
.pw-meter{margin-top:8px}
.pw-meter__bars{display:flex;gap:4px;margin-bottom:5px}
.pw-meter__bar{height:3px;flex:1;border-radius:2px;transition:background .25s}
.pw-meter__label{font-size:11px;font-weight:600}

/* Role cards */
.auth-roles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.auth-role-card{display:flex;flex-direction:column;align-items:center;gap:5px;padding:16px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;cursor:pointer;transition:all .18s;position:relative;font-family:'DM Sans',sans-serif}
.auth-role-card:hover{border-color:rgba(142,132,247,.3);background:rgba(142,132,247,.07)}
.auth-role-card--on{border-color:#8e84f7;background:rgba(142,132,247,.12);box-shadow:0 0 0 1px rgba(142,132,247,.25)}
.auth-role-card__emoji{font-size:22px}
.auth-role-card__label{font-size:14px;font-weight:600;color:#fff}
.auth-role-card__desc{font-size:11px;color:rgba(255,255,255,.4)}
.auth-role-card__check{position:absolute;top:8px;right:10px;font-size:11px;color:#8e84f7;font-weight:700}
.auth-terms{display:flex;gap:9px;align-items:flex-start;font-size:12px;color:rgba(255,255,255,.45);line-height:1.5;margin-bottom:14px;cursor:pointer}

/* Buttons */
.auth-primary-btn{width:100%;padding:12px;background:linear-gradient(135deg,#8e84f7,#7266e8);border:none;border-radius:9px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 16px rgba(142,132,247,.28);transition:box-shadow .18s;display:flex;align-items:center;justify-content:center;gap:8px}
.auth-primary-btn:hover:not(:disabled){box-shadow:0 6px 20px rgba(142,132,247,.38)}
.auth-primary-btn:disabled{opacity:.55;cursor:not-allowed}
.auth-btn-row{display:flex;gap:9px;align-items:center}
.auth-back-btn{padding:12px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:rgba(255,255,255,.5);font-size:14px;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap}
.auth-back-btn:hover{background:rgba(255,255,255,.1);color:#fff}
.auth-spinner{width:17px;height:17px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
`;
