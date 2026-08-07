"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Shared onboarding chrome — the "Rebirth of Souls" menu frame.
 * Renders the paper/eyecatch ground, halftone + ink-spot texture, the vertical
 * ONBOARDING edge label, the title banner, a step/progress HUD, a Reduce-FX
 * toggle, and the bottom command bar. Pages provide the flexible middle.
 */
export function ObShell({
  step,
  total,
  title,
  serifSub,
  children,
}: {
  step: number
  total: number
  title: string
  serifSub?: string
  children: React.ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [fx, setFx] = useState(true)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion:reduce)").matches) setFx(false)
  }, [])

  const pct = Math.max(0, Math.min(100, (step / total) * 100))

  return (
    <div ref={rootRef} className="ob" data-fx={fx ? "on" : "off"}>
      <div className="ob-tex ob-halftone" />
      <div className="ob-tex ob-speed" />
      {/* scattered ink spots */}
      <svg className="ob-spot" style={{ top: "13%", left: "34%", width: 34 }} viewBox="0 0 40 40" aria-hidden>
        <path d="M20 2c6 3 14 6 15 14s-4 16-12 20S6 33 4 24 8 6 20 2Z" />
      </svg>
      <svg className="ob-spot" style={{ top: "72%", left: "24%", width: 14 }} viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="7" />
      </svg>
      <svg className="ob-spot" style={{ top: "22%", left: "66%", width: 10 }} viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="6" />
      </svg>
      <svg className="ob-spot" style={{ top: "82%", left: "72%", width: 26 }} viewBox="0 0 40 40" aria-hidden>
        <path d="M8 6c8-4 20-2 24 6s-2 20-12 22S-2 28 2 18 8 6Z" />
      </svg>

      <div className="ob-vlabel" aria-hidden>
        <span>Onboarding</span>
      </div>

      <header className="ob-hud">
        <div className="ob-titlewrap">
          <div className="ob-banner">{title}</div>
          {serifSub ? (
            <div className="ob-sub">
              <b>
                Step {String(step).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </b>
              <span className="rule" />
              {serifSub}
            </div>
          ) : null}
        </div>
        <div className="ob-hud-right">
          <div className="ob-lvline">
            <span className="lv">Step {String(step).padStart(2, "0")}</span>
            <span className="frac">
              {String(step).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>
          <div className="ob-pbar" role="img" aria-label={`Onboarding progress, step ${step} of ${total}`}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <button
            className="ob-fxbtn"
            aria-pressed={!fx}
            onClick={() => setFx((v) => !v)}
            type="button"
          >
            {fx ? "Reduce FX" : "Effects Off"}
          </button>
        </div>
      </header>

      {children}

      <footer className="ob-cmdbar">
        <span className="ob-cmd hi">
          <Glyph shape="diamond" /> Select
        </span>
        <span className="ob-cmd">
          <Glyph shape="cross" /> Confirm
        </span>
        <span className="ob-cmd">
          <Glyph shape="circle" /> Back
        </span>
        <span className="ob-cmd">
          <Glyph shape="square" /> Switch Info
        </span>
        <span className="spacer" />
        <span className="mock">Onboarding · you can run both workspaces later</span>
      </footer>
    </div>
  )
}

export function Glyph({ shape }: { shape: "diamond" | "cross" | "circle" | "square" }) {
  return (
    <svg className="g" viewBox="0 0 24 24" fill="none" aria-hidden>
      {shape === "diamond" && <path d="M12 3 21 12 12 21 3 12Z" stroke="currentColor" strokeWidth="2" />}
      {shape === "cross" && (
        <>
          <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="2" />
          <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2" />
        </>
      )}
      {shape === "circle" && (
        <>
          <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="4.4" stroke="currentColor" strokeWidth="2" />
        </>
      )}
      {shape === "square" && <rect x="4" y="4" width="16" height="16" stroke="currentColor" strokeWidth="2" />}
    </svg>
  )
}

/** Original anchor-derived sigils (no game IP). */
export function AnchorSigil({ variant }: { variant: "founder" | "vc" }) {
  if (variant === "vc") {
    return (
      <svg viewBox="0 0 64 64" fill="none" aria-hidden>
        <path d="M32 5l23 13v20L32 51 9 38V18L32 5z" stroke="currentColor" strokeWidth="2.4" opacity=".5" />
        <circle cx="32" cy="20" r="3.4" stroke="currentColor" strokeWidth="2.6" />
        <path d="M32 23.5V47M18 32a14 14 0 0 0 28 0M32 29h-8m8 0h8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden>
      <path d="M32 6l7 9H25l7-9z" fill="currentColor" />
      <circle cx="32" cy="21" r="3.4" stroke="currentColor" strokeWidth="2.6" />
      <path
        d="M32 24.5V56M16 34a16 16 0 0 0 32 0M32 30H23m9 0h9M16 34h-4l2.6 4.4M48 34h4l-2.6 4.4"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
