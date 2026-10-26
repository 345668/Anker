/**
 * The partners shown on the website (docs/architecture/76). One typed source for the homepage strip, the /partners page and the tests.
 *
 * Rules (tested): a description is one sentence of at most 160 characters that says only what the partner publicly says about itself (for a pilot: its role); no numbers;
 * pilots carry no link and no description beyond their role; a link is set only when it was verified on a public source; a partner whose identity could not be confirmed has
 * `description: null` until the founder supplies one. `listed: false` removes a partner from the site at once. Names and typeset wordmarks only: no logos without permission.
 */
export type PartnerGroup = "pilots" | "programmes" | "public" | "capital"
export interface Partner {
  slug: string
  name: string
  group: PartnerGroup
  /** A pilot is a fund manager piloting Anker under confidentiality: shown by role only. */
  kind: "pilot" | "partner"
  description: string | null
  /** The partner's own site, only if verified. */
  url: string | null
  /** The founder has confirmed the description (and the permission to name the partner). */
  checked: boolean
  listed: boolean
}

export const GROUPS: Array<{ key: PartnerGroup; title: string; intro: string }> = [
  { key: "pilots", title: "Design partners and pilots", intro: "Fund managers piloting Anker in their own work and shaping what it becomes." },
  { key: "programmes", title: "Programmes and communities", intro: "Accelerators, studios and communities where founders and fund managers build." },
  { key: "public", title: "Public programmes", intro: "Public innovation programmes that fund and support early-stage companies." },
  { key: "capital", title: "Investors and capital", intro: "Firms that put capital behind founders." },
]

export const PARTNERS: Partner[] = [
  { slug: "summit-venture-studio", name: "Summit Venture Studio", group: "pilots", kind: "pilot", description: "A venture studio and design partner piloting Anker with its fund team.", url: null, checked: false, listed: true },
  { slug: "winner-capital", name: "Winner Capital", group: "pilots", kind: "pilot", description: "An investment fund and design partner piloting Anker with its fund team.", url: null, checked: false, listed: true },
  { slug: "thirdworldvc", name: "ThirdWorldVC", group: "pilots", kind: "pilot", description: "A venture firm and design partner piloting Anker with its team.", url: null, checked: false, listed: true },

  { slug: "decile-group", name: "Decile Group and Decile Capital", group: "programmes", kind: "partner", description: "A venture firm for emerging fund managers, with the VC Lab accelerator, Decile Hub software and the Decile Capital fund of funds.", url: "https://decilegroup.com", checked: false, listed: true },
  { slug: "the-residency", name: "The Residency", group: "programmes", kind: "partner", description: "A cohort-based programme where founders live and build together in houses across the Bay Area, New York, Boston and Europe.", url: "https://livetheresidency.com", checked: false, listed: true },
  { slug: "the-delta", name: "The Delta", group: "programmes", kind: "partner", description: "A venture studio and investment firm based in Berlin that builds and backs early-stage companies.", url: null, checked: false, listed: true },
  { slug: "makershome", name: "Makershome", group: "programmes", kind: "partner", description: null, url: null, checked: false, listed: true },
  { slug: "pioneerclub", name: "Pioneerclub", group: "programmes", kind: "partner", description: null, url: null, checked: false, listed: true },
  { slug: "tbdc", name: "TBDC", group: "programmes", kind: "partner", description: "A Toronto accelerator that helps international companies land and grow in Canada and North America.", url: "https://tbdc.com", checked: false, listed: true },

  { slug: "women-techeu", name: "Women TechEU", group: "public", kind: "partner", description: "A European Union scheme giving women-led deep-tech start-ups equity-free grants, coaching and investor matching.", url: "https://eic.ec.europa.eu", checked: false, listed: true },
  { slug: "innovate-uk", name: "Innovate UK", group: "public", kind: "partner", description: "The UK’s national innovation agency, part of UK Research and Innovation, funding and supporting innovative businesses.", url: "https://www.ukri.org/councils/innovate-uk/", checked: false, listed: true },

  { slug: "lvlup-ventures", name: "LvlUp Ventures", group: "capital", kind: "partner", description: "An early-stage venture firm with seed and consumer-goods funds and a start-up accelerator.", url: "https://lvlup.vc", checked: false, listed: true },
  { slug: "clearco", name: "Clearco", group: "capital", kind: "partner", description: "Revenue-based financing for e-commerce founders: fast, non-dilutive capital in return for a share of future revenue.", url: "https://clear.co", checked: false, listed: true },
]

export const DESCRIPTION_MAX = 160
export const listedPartners = (all: Partner[] = PARTNERS) => all.filter((p) => p.listed)
export function partnersByGroup(all: Partner[] = PARTNERS) {
  return GROUPS.map((g) => ({ ...g, partners: listedPartners(all).filter((p) => p.group === g.key) })).filter((g) => g.partners.length > 0)
}

/** The interview of The Residency's founder with Sam Altman. Hidden until a source exists (docs/architecture/76 section 5). */
export interface Interview { url: string | null; title: string; speakers: string; date: string | null; transcript: string | null; sourceNote: string | null }
export const RESIDENCY_INTERVIEW: Interview = { url: null, title: "The Residency’s founder in conversation with Sam Altman", speakers: "The Residency’s founder and Sam Altman", date: null, transcript: null, sourceNote: null }
