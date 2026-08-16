"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { Persona } from "@/lib/org/active"

/**
 * Shared active-persona state for the top-nav shell. Scoped users are pinned to
 * their workspace persona; owners (persona === null) may switch which suite they
 * view via the brand-lockup switcher. The top bar, the contextual left rail, and
 * the mobile nav all read/write this one value so they never disagree.
 *
 * The owner's choice is remembered in localStorage so it survives navigation.
 */

type Ctx = {
  /** The persona whose suite is currently shown. */
  active: Persona
  /** Personas the user may switch between (one entry = pinned). */
  entitled: Persona[]
  setActive: (p: Persona) => void
}

const NavPersonaContext = createContext<Ctx | null>(null)

export function NavPersonaProvider({ persona, children }: { persona: Persona | null; children: React.ReactNode }) {
  const entitled: Persona[] = persona ? [persona] : ["founder", "vc", "lp"]
  const [active, setActiveState] = useState<Persona>(persona ?? "founder")

  // Owners: restore last viewed suite once on mount.
  useEffect(() => {
    if (persona) { setActiveState(persona); return }
    try {
      const saved = localStorage.getItem("anker:view-as") as Persona | null
      if (saved && (["founder", "vc", "lp"] as Persona[]).includes(saved)) setActiveState(saved)
    } catch { /* ignore */ }
  }, [persona])

  function setActive(p: Persona) {
    setActiveState(p)
    if (!persona) { try { localStorage.setItem("anker:view-as", p) } catch { /* ignore */ } }
  }

  return <NavPersonaContext.Provider value={{ active, entitled, setActive }}>{children}</NavPersonaContext.Provider>
}

export function useNavPersona(): Ctx {
  const ctx = useContext(NavPersonaContext)
  if (!ctx) throw new Error("useNavPersona must be used within NavPersonaProvider")
  return ctx
}
