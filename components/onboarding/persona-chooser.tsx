"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ObShell, Glyph, AnchorSigil } from "./ob-shell"

type Persona = { key: "founder" | "vc"; name: string; role: string; tag: string; idx: string; setup: [string, string][] }

const PERSONAS: Persona[] = [
  {
    key: "founder",
    name: "Founder",
    role: "The Builder",
    tag: "Raise your round.",
    idx: "01",
    setup: [
      ["Match", "investors to your deck"],
      ["Draft & send", "outreach"],
      ["Cap table", "& runway"],
      ["Pitch deck", "+ data room"],
    ],
  },
  {
    key: "vc",
    name: "Venture Fund",
    role: "The Allocator",
    tag: "Deploy your fund.",
    idx: "02",
    setup: [
      ["Source & score", "deals"],
      ["LP", "matchmaking"],
      ["Portfolio", "& NAV"],
      ["Fund", "back-office & LP reporting"],
    ],
  },
]

export function PersonaChooser() {
  const router = useRouter()
  const [hot, setHot] = useState(false)
  const [sel, setSel] = useState<Persona["key"] | null>(null)
  const [locking, setLocking] = useState<Persona["key"] | null>(null)

  const selected = PERSONAS.find((p) => p.key === sel) || null

  function choose(key: Persona["key"]) {
    setSel(key)
    setLocking(key)
    setHot(true)
    setTimeout(() => setLocking(null), 560)
    // best-effort persist of the chosen path
    fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_type: key === "vc" ? "vc" : "founder", step: 0 }),
    }).catch(() => {})
  }

  function enter() {
    if (!sel) return
    router.push(`/onboarding/${sel}`)
  }

  return (
    <ObShell step={1} total={8} title="Choose Your Path" serifSub="Which soul are you setting out as?">
      <main className="ob-main">
        <div className={`ob-arena ready`}>
          <div className={`ob-cards ${hot ? "hot" : ""}`} style={{ display: "contents" }}>
            {PERSONAS.map((p, i) => (
              <PanelAndSlash key={p.key} p={p} first={i === 0} sel={sel} locking={locking} onChoose={choose} onHot={() => setHot(true)} />
            ))}
          </div>
        </div>
      </main>

      <div className={`ob-confirm ${sel ? "show" : ""}`} aria-live="polite">
        <span className="ob-locked">
          Path locked — <b>{selected?.name ?? "Founder"}</b>
        </span>
        <button className={`ob-next ${sel === "vc" ? "c" : ""}`} onClick={enter} type="button">
          Enter as {selected?.name ?? "Founder"} →
        </button>
        <button className="ob-change" onClick={() => { setSel(null); setHot(false) }} type="button">
          Change
        </button>
      </div>
    </ObShell>
  )
}

function PanelAndSlash({
  p,
  first,
  sel,
  locking,
  onChoose,
  onHot,
}: {
  p: Persona
  first: boolean
  sel: Persona["key"] | null
  locking: Persona["key"] | null
  onChoose: (k: Persona["key"]) => void
  onHot: () => void
}) {
  const isVc = p.key === "vc"
  const cls = `ob-panel ${isVc ? "vc" : ""} ${sel === p.key ? "sel" : ""} ${locking === p.key ? "lock" : ""}`
  return (
    <>
      {isVc && (
        <div className="ob-slash" aria-hidden>
          <span className="ob-vs">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="5" r="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 7v13M6 13a6 6 0 0 0 12 0M12 10H9m3 0h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
        </div>
      )}
      <button
        className={cls}
        onMouseEnter={onHot}
        onFocus={onHot}
        onClick={() => onChoose(p.key)}
        aria-label={`Choose the ${p.name} path — ${p.tag}`}
        type="button"
      >
        <span className="wedge" />
        <span className="flash" />
        <div className="ob-ptop">
          <div className="ob-diamond">
            <AnchorSigil variant={isVc ? "vc" : "founder"} />
          </div>
          <span className="ob-idx">{p.idx}</span>
        </div>
        <span className="ob-roletag">{p.role}</span>
        <span className="ob-pname">{p.name}</span>
        <span className="ob-ptag">{p.tag}</span>
        <div className="ob-divline" />
        <span className="ob-setuph">You&apos;ll set up</span>
        <ul className="ob-challenge">
          {p.setup.map(([b, rest]) => (
            <li key={b}>
              <span className="box">
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5 6.5 12 13 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <b>{b}</b>&nbsp;{rest}
            </li>
          ))}
        </ul>
        <span className="ob-selectcue">
          <Glyph shape="diamond" /> Select
        </span>
      </button>
    </>
  )
}
