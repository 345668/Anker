/**
 * Is this row a person? (docs/architecture/19 §5)
 *
 * The investor directory holds organisations in the people table. The Summit
 * run surfaced 320 of them, the clearest being "Harvard Management Company
 * Management Company", titled "Early Light Ventures" — an endowment, a
 * duplicated suffix, and a different firm's name in the title.
 *
 * Scoring those as contacts puts an institution in a list a GP will email by
 * name. They are not dropped silently: the funnel counts them, and the firm
 * they name is already in the firm list.
 *
 * Pure.
 */

/** Suffixes and words that belong to an organisation, not a person. */
const ORGANISATION_WORDS = [
  "management company", "capital", "ventures", "venture partners", "partners llp",
  "advisors", "advisers", "asset management", "investments", "investment office",
  "holdings", "group", "endowment", "foundation", "university", "college",
  "trust", "pension", "insurance", "bank", "family office", "fund of funds",
  "llc", "l.l.c", "inc", "ltd", "limited", "gmbh", "s.a.", "plc", "lp", "l.p",
]

/** A person's name is one to four words, none of them a company word. */
const MAX_NAME_WORDS = 5

function words(value: string): string[] {
  return value.toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean)
}

export interface PersonCheck {
  isPerson: boolean
  /** Why it was rejected, for the funnel and for debugging. */
  reason: string | null
}

/**
 * Decide whether a directory row names a person.
 *
 * Deliberately conservative: a real person with an unusual name keeps their
 * row, and only an unmistakable organisation is refused.
 */
export function checkPerson(name: string | null | undefined, title?: string | null): PersonCheck {
  const raw = (name ?? "").trim()
  if (!raw) return { isPerson: false, reason: "no name" }

  const lower = raw.toLowerCase()
  const parts = words(raw)

  // "Harvard Management Company Management Company" — a phrase repeated is
  // never how a person is named.
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + 2 * n <= parts.length; i++) {
      const a = parts.slice(i, i + n).join(" ")
      const b = parts.slice(i + n, i + 2 * n).join(" ")
      if (a === b) return { isPerson: false, reason: `repeated phrase "${a}"` }
    }
  }

  for (const word of ORGANISATION_WORDS) {
    const pattern = new RegExp(`(^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i")
    if (pattern.test(lower)) return { isPerson: false, reason: `reads as an organisation ("${word}")` }
  }

  if (parts.length > MAX_NAME_WORDS) return { isPerson: false, reason: `${parts.length} words is not a personal name` }
  if (/\d/.test(raw)) return { isPerson: false, reason: "contains digits" }
  if (/^(the|our|a)\b/i.test(raw)) return { isPerson: false, reason: "starts with an article" }

  return { isPerson: true, reason: null }
}
