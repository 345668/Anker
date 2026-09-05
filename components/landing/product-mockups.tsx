"use client";

/**
 * Product-mockup elements — the floating "dashboard card" visuals that drive the
 * landing page (Metal-inspired layout, Anker brand: Fraunces serif + #e5380f
 * accent, theme-aware via design tokens). All self-contained, no data.
 */
import type { ReactNode } from "react";

const ACCENT = "#e5380f";

/** Base floating card shell. */
export function MockCard({
  children, className = "", title, badge,
}: { children: ReactNode; className?: string; title?: string; badge?: string }) {
  return (
    <div className={`rounded-2xl border border-foreground/10 bg-card/95 backdrop-blur-sm p-4 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.25)] ${className}`}>
      {(title || badge) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <span className="text-xs font-medium text-muted-foreground">{title}</span>}
          {badge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e5380f]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#e5380f]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#e5380f]" /> {badge}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/** Rising area chart — "Raise Momentum". */
export function MomentumCard({ className = "" }: { className?: string }) {
  return (
    <MockCard title="Raise momentum" badge="live" className={className}>
      <svg viewBox="0 0 240 96" className="w-full" role="img" aria-label="Raise momentum chart">
        <defs>
          <linearGradient id="mmg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[24, 48, 72].map((y) => (
          <line key={y} x1="0" y1={y} x2="240" y2={y} stroke="currentColor" strokeOpacity="0.06" />
        ))}
        <path d="M0 82 L40 74 L80 60 L120 64 L160 40 L200 30 L240 14 L240 96 L0 96 Z" fill="url(#mmg)" />
        <path d="M0 82 L40 74 L80 60 L120 64 L160 40 L200 30 L240 14" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="240" cy="14" r="3.5" fill={ACCENT} />
      </svg>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-2xl">72%</span>
        <span className="text-xs text-emerald-600">↑ committed</span>
      </div>
    </MockCard>
  );
}

/** Donut — "Investor Mix". */
export function MixDonut({ className = "" }: { className?: string }) {
  // segments: VCs 55%, Angels 30%, LPs 15% — stroke-dasharray on a circle (circ ≈ 226)
  const C = 226;
  const seg = (pct: number, from: number, color: string, w = 14) => (
    <circle cx="48" cy="48" r="36" fill="none" stroke={color} strokeWidth={w}
      strokeDasharray={`${(pct / 100) * C} ${C}`} strokeDashoffset={-(from / 100) * C}
      transform="rotate(-90 48 48)" strokeLinecap="butt" />
  );
  return (
    <MockCard title="Investor mix" className={className}>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 96 96" className="h-24 w-24 shrink-0">
          {seg(100, 0, "currentColor", 14)}
          <g style={{ opacity: 0.14 }}>{seg(100, 0, "currentColor", 14)}</g>
          {seg(55, 0, ACCENT)}
          {seg(30, 55, "currentColor")}
        </svg>
        <ul className="space-y-1.5 text-xs">
          <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ACCENT }} /> VCs <b className="ml-auto font-display">55%</b></li>
          <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-foreground" /> Angels <b className="ml-auto font-display">30%</b></li>
          <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-foreground/20" /> LPs <b className="ml-auto font-display">15%</b></li>
        </ul>
      </div>
    </MockCard>
  );
}

/** AI investor-match list. */
export function MatchCard({ className = "" }: { className?: string }) {
  const rows = [
    { n: "Sequoia-style Seed fund", s: 94 },
    { n: "DeepTech angel syndicate", s: 88 },
    { n: "University-tech LP", s: 81 },
  ];
  return (
    <MockCard title="AI investor matches" badge="47k db" className={className}>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.n} className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground/[0.06] font-mono text-[10px]">{r.s}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{r.n}</div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
                <div className="h-full rounded-full" style={{ width: `${r.s}%`, background: ACCENT }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </MockCard>
  );
}

/** Small floating stat tile. */
export function StatTile({ value = "$4.2M", label = "Committed", className = "" }: { value?: string; label?: string; className?: string }) {
  return (
    <MockCard className={`w-fit ${className}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="font-display text-2xl leading-none">{value}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" className="text-[#e5380f]"><path d="M3 11 L11 3 M6 3 h5 v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
    </MockCard>
  );
}

/** Investor pipeline stages. */
export function PipelineCard({ className = "" }: { className?: string }) {
  const stages = [
    { k: "Contacted", n: 42, w: "100%" },
    { k: "Meeting", n: 18, w: "58%" },
    { k: "Diligence", n: 7, w: "30%" },
    { k: "Term sheet", n: 3, w: "16%" },
  ];
  return (
    <MockCard title="Raise pipeline" className={className}>
      <ul className="space-y-2.5">
        {stages.map((s, i) => (
          <li key={s.k} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{s.k}</span>
            <div className="h-6 flex-1 overflow-hidden rounded-md bg-foreground/[0.05]">
              <div className="flex h-full items-center justify-end rounded-md px-2 text-[10px] font-medium text-white"
                style={{ width: s.w, background: i === 3 ? ACCENT : `color-mix(in oklch, ${ACCENT} ${70 - i * 15}%, var(--foreground))` }}>
                {s.n}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </MockCard>
  );
}

/** Hero cluster — layered floating cards (tuned to avoid clipping). */
export function HeroMockups({ className = "" }: { className?: string }) {
  return (
    <div className={`relative h-[460px] w-[460px] ${className}`} aria-hidden>
      <div className="animate-floaty absolute right-0 top-6 w-[280px] drop-shadow-xl">
        <MomentumCard />
      </div>
      <div className="animate-floaty absolute right-14 -top-4" style={{ animationDelay: "1.8s" }}>
        <StatTile />
      </div>
      <div className="animate-floaty absolute right-0 top-[214px] w-[214px] drop-shadow-xl" style={{ animationDelay: "0.6s" }}>
        <MixDonut />
      </div>
      <div className="animate-floaty absolute left-0 top-[150px] w-[272px] drop-shadow-2xl" style={{ animationDelay: "1.2s" }}>
        <MatchCard />
      </div>
    </div>
  );
}
