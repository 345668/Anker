/**
 * What each persona discovers (docs/architecture/12). A lens fixes the base
 * population (investor classes, or opt-in listings) and which record kinds
 * it shows; the column projection per kind lives in discovery.ts.
 */
import { ALLOCATOR_CLASSES, MANAGER_CLASSES, type InvestorClass } from "@/lib/matching/normalize/classes"

export type Persona = "founder" | "vc" | "lp"
export type Kind = "investors" | "firms" | "startups" | "funds"
export type LensId = "founder" | "vc_lps" | "vc_coinvestors" | "vc_startups" | "lp_managers" | "lp_funds"

export interface Lens {
  persona: Persona
  label: string
  description: string
  kinds: Kind[]
  /** Investor classes in this population; null = every class. */
  classes: InvestorClass[] | null
  /** May rows be saved to the workspace CRM? */
  canSave: boolean
}

export const LENSES: Record<LensId, Lens> = {
  founder: {
    persona: "founder", label: "Investors", description: "Firms and people who invest in companies.",
    kinds: ["investors", "firms"], classes: null, canSave: true,
  },
  vc_lps: {
    persona: "vc", label: "LPs & allocators", description: "Family offices, funds of funds, endowments, pensions, insurers, banks, asset managers and sovereign funds.",
    kinds: ["firms", "investors"], classes: ALLOCATOR_CLASSES, canSave: true,
  },
  vc_coinvestors: {
    persona: "vc", label: "Co-investors", description: "VCs, corporate VCs, angels and accelerators to syndicate with.",
    kinds: ["firms", "investors"], classes: ["vc", "cvc", "angel", "accelerator"], canSave: true,
  },
  vc_startups: {
    persona: "vc", label: "Startups", description: "Companies whose founders chose to be listed for investors.",
    kinds: ["startups"], classes: null, canSave: false,
  },
  lp_managers: {
    persona: "lp", label: "Fund managers", description: "Venture and private-equity managers, and funds of funds, with their partners.",
    kinds: ["firms", "investors"], classes: MANAGER_CLASSES, canSave: false,
  },
  lp_funds: {
    persona: "lp", label: "Funds on Anker", description: "Funds whose managers listed them for LPs.",
    kinds: ["funds"], classes: null, canSave: false,
  },
}

export function lensesFor(persona: Persona): LensId[] {
  return (Object.keys(LENSES) as LensId[]).filter((id) => LENSES[id].persona === persona)
}

export function defaultLens(persona: Persona): LensId {
  return lensesFor(persona)[0]
}

export function isLensFor(lens: string, persona: Persona): lens is LensId {
  return lens in LENSES && LENSES[lens as LensId].persona === persona
}
