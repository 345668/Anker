/**
 * Investor classes (doc 12 §2). One class per record, from the firm
 * classification / investor type text. Allocators are the institutions that
 * invest in funds — the LP universe a fund manager raises from.
 */
import { words } from "./text"

export const INVESTOR_CLASSES = [
  "vc", "cvc", "angel", "accelerator", "family_office", "pe",
  "fund_of_funds", "sovereign_wealth", "institutional", "bank", "insurance", "asset_manager",
  "grant", "other",
] as const
export type InvestorClass = (typeof INVESTOR_CLASSES)[number]

export const CLASS_LABELS: Record<InvestorClass, string> = {
  vc: "Venture capital", cvc: "Corporate VC", angel: "Angel", accelerator: "Accelerator",
  family_office: "Family office", pe: "Private equity", fund_of_funds: "Fund of funds",
  sovereign_wealth: "Sovereign wealth fund", institutional: "Endowment / pension / institutional",
  bank: "Bank", insurance: "Insurance", asset_manager: "Asset & wealth manager", grant: "Grant body", other: "Other",
}

/** Invest in funds — the VC persona's LP lens. */
export const ALLOCATOR_CLASSES: InvestorClass[] = [
  "family_office", "fund_of_funds", "sovereign_wealth", "institutional", "bank", "insurance", "asset_manager",
]
/** Invest in companies — founders' investors and VCs' co-investors. */
export const DIRECT_CLASSES: InvestorClass[] = ["vc", "cvc", "angel", "accelerator", "family_office", "pe"]
/** Raise funds from LPs — the LP persona's manager lens. */
export const MANAGER_CLASSES: InvestorClass[] = ["vc", "pe", "fund_of_funds"]

/** Ordered: the first rule that matches wins, so "Accelerator, VC" is an accelerator. */
const RULES: [InvestorClass, RegExp][] = [
  ["grant", /\bgrants?\b/],
  ["accelerator", /\b(accelerators?|incubators?|venture studios?|startup studios?)\b/],
  ["cvc", /\b(corporate|cvc)\b/],
  ["fund_of_funds", /\b(fund of funds|fof|funds of funds|multi manager)\b/],
  ["sovereign_wealth", /\b(sovereign|swf)\b/],
  ["family_office", /\bfamily (office|offices|wealth)\b|\bmulti family\b/],
  ["institutional", /\b(pension|endowment|foundation|institutional|university)\b/],
  ["insurance", /\binsurance|insurer\b/],
  ["bank", /\bbanks?\b|\bbanking\b/],
  ["asset_manager", /\b(asset|wealth) (manager|management)|\bhedge funds?\b|\bfund house|\bamcs?\b|\basset managers?\b/],
  ["angel", /\bangels?\b|\bhnw|high net worth|\bbusiness angel/],
  ["pe", /\bprivate equity|\bbuyouts?\b|\bgrowth equity|\bpe\b|\bprivate capital\b/],
  ["vc", /\bventure|\bvc\b|\bmicro vc\b|\bseed fund|\bvcs\b/],
]

export function investorClass(...texts: (string | null | undefined)[]): InvestorClass {
  for (const t of texts) {
    if (!t) continue
    const s = words(t).join(" ")
    for (const [cls, re] of RULES) if (re.test(s)) return cls
  }
  return "other"
}

/** Seniority from a title (doc 11 §5): partner-level 1.0, principal-level 0.7, associate-level 0.4. */
export function seniority(title: string | null | undefined): number {
  if (!title) return 0.5
  const s = words(title).join(" ")
  if (/\b(managing partner|general partner|founding partner|partner|founder|co founder|managing director|ceo|chief investment officer|cio|president|chair|chairman|owner|principal investor|solo gp|gp)\b/.test(s) && !/\bventure partner\b/.test(s)) return 1.0
  if (/\b(principal|vice president|vp|director|venture partner|head|investment manager|portfolio manager)\b/.test(s)) return 0.7
  if (/\b(associate|analyst|scout|intern|fellow|assistant|coordinator)\b/.test(s)) return 0.4
  return 0.5
}
