"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { ObShell, type PersonaKey } from "./ob-shell"
import s from "./onboarding.module.css"

const PERSONAS = [
  { key: "founder" as const, name: "Founder", role: "Build and raise",
    description: "Bring your investor relationships, fundraising work and company information together.",
    features: ["Investor research and relationships", "Fundraising and outreach", "Company documents and reporting"] },
  { key: "vc" as const, name: "Venture fund", role: "Invest and manage",
    description: "Connect deal sourcing, portfolio oversight and LP relationships in your fund workspace.",
    features: ["Deal sourcing and diligence", "Portfolio and fund operations", "LP relationships and reporting"] },
]

export function PersonaChooser() {
  const router = useRouter()
  const [selected, setSelected] = useState<PersonaKey | null>(null)
  return (
    <ObShell current={1} total={5} eyebrow="Welcome to Anker · Step 1 of 5"
      title="Your next chapter starts here."
      sub="Choose the workspace that fits your role. Add a few essentials next, or select your previous path to resume a saved setup.">
      <form onSubmit={e => { e.preventDefault(); if (selected) router.push(`/onboarding/${selected}`) }}>
        <fieldset className={s.personaGroup}>
          <legend className="sr-only">Choose your workspace</legend>
          <div className={s.personaGrid}>
            {PERSONAS.map((p, i) => <label key={p.key} className={s.personaCard} data-selected={selected === p.key}>
              <span className={s.personaTop}>
                <span className={s.personaIndex}>0{i + 1} / {p.role}</span>
                <input className={s.personaRadio} type="radio" name="persona" value={p.key}
                  aria-label={p.name} checked={selected === p.key} onChange={() => setSelected(p.key)} />
              </span>
              <h2>{p.name}</h2><p>{p.description}</p>
              <ul>{p.features.map(f => <li key={f}><Check size={16} aria-hidden="true" />{f}</li>)}</ul>
              <span className={s.personaFoot}>{selected === p.key ? "Selected workspace" : "Select workspace"}<ArrowRight size={18} aria-hidden="true" /></span>
            </label>)}
          </div>
        </fieldset>
        <div className={s.selectionBar}>
          <p role="status">{selected ? `${selected === "vc" ? "Venture fund" : "Founder"} workspace selected` : "Select a workspace to continue."}</p>
          <button type="submit" className={s.button} disabled={!selected}>Continue{selected ? ` as ${selected === "vc" ? "a fund" : "a founder"}` : ""}<ArrowRight size={18} aria-hidden="true" /></button>
        </div>
      </form>
      <p className={s.helpNote}>Joining as a limited partner? Use your fund’s invitation or <Link href="/lp">open the investor portal</Link>. Founder and fund setup creates an operating workspace.</p>
    </ObShell>
  )
}
