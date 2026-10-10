/**
 * The first wave for a fund raise: an email and a LinkedIn message from a fund manager to a prospective LP, written from the fund profile only (docs/architecture/50 §4).
 * The writer may use only facts that are in the profile; a draft that names a figure that is not there is not proposed.
 */
import {
  firstWord,
  parseDraft,
  draftProblem,
  type DraftEntry,
  type IntroDraft,
} from "@/lib/outreach/draft-intro"
import { money, type FundFacts } from "./raise-path"

/** The facts the writer is given, one per line. Nothing else about the fund may appear in a message. */
export function fundFactLines(f: FundFacts): string[] {
  return [
    `Fund: ${f.name}${f.fundNumber ? ` (Fund ${f.fundNumber})` : ""}`,
    f.gpName && `Written by: ${f.gpName}, General Partner`,
    f.targetRaise && `Raising: ${money(f.targetRaise)}`,
    f.minimumCommitment && `Minimum commitment: ${money(f.minimumCommitment)}`,
    f.gpCommitment !== null && f.gpCommitment !== undefined && `GP commitment: ${f.gpCommitment}%`,
    f.thesis && `Thesis: ${f.thesis.slice(0, 900)}`,
    f.valueProposition && `What sets it apart: ${f.valueProposition.slice(0, 500)}`,
    f.sectors.length ? `Sectors: ${f.sectors.slice(0, 8).join(", ")}` : null,
    f.geography.length ? `Geography: ${f.geography.slice(0, 8).join(", ")}` : null,
    f.hq && `Based in: ${f.hq}`,
  ].filter((x): x is string => !!x)
}

export function buildLpPrompt(entry: DraftEntry, f: FundFacts): string {
  const lp = [
    entry.display_name && `Name: ${entry.display_name}`,
    entry.display_title && `Title: ${entry.display_title}`,
    entry.display_type && `Type: ${entry.display_type}`,
    entry.display_location && `Location: ${entry.display_location}`,
    entry.why_match && `Why matched: ${entry.why_match}`,
    entry.research_summary && `Research brief:\n${String(entry.research_summary).slice(0, 1500)}`,
  ]
    .filter(Boolean)
    .join("\n")
  const first = firstWord(entry.display_name) || "there"
  return `You write outreach from a venture fund manager to a prospective limited partner (LP) for the fund's raise. Be specific to this LP: use one real detail from the LP section, not a generic compliment. Plain, respectful, no hype, no em-dashes.
HARD RULE: use ONLY the facts under FUND FACTS. Write amounts exactly as listed (for example "5M"), with no currency symbol and no currency name: the profile does not say which currency. Do not state any number, track record, past fund result, portfolio company or regulatory claim that is not listed there. If a fact is not listed, leave it out.

Return ONLY a JSON object, no prose around it:
{
  "subject": "email subject, under 60 characters, specific",
  "email": "the email body, 90-150 words, greeting to '${first}', short paragraphs, one clear ask: a 20-minute introductory call, sign off as ${f.gpName ?? "the General Partner"} of ${f.name}",
  "dm": "a LinkedIn message under 300 characters, warmer and shorter than the email, one specific hook and one ask"
}

=== FUND FACTS ===
${fundFactLines(f).join("\n")}

=== LP ===
${lp || "(limited information: keep it honest and brief)"}`
}

const MONEY_TOKEN =
  /\$\s?\d[\d,.]*\s?(?:[kKmMbB]|million|billion)?|\d[\d,.]*\s?(?:%|percent|million|billion|[mMbB]\b)|[€£]\s?\d[\d,.]*|\d+(?:\.\d+)?\s?x\b/gi
const digits = (s: string) => s.replace(/[^0-9.]/g, "").replace(/^0+(?=\d)/, "")
/** Figures in a message that are not in the fund facts: a draft that quotes an invented number must not be proposed. */
export function inventedFigures(text: string, f: FundFacts): string[] {
  const allowed = new Set<string>()
  const add = (s: string) => {
    for (const t of s.match(MONEY_TOKEN) ?? []) allowed.add(digits(t))
  }
  const facts = fundFactLines(f).join("\n")
  add(facts)
  if (f.targetRaise) {
    allowed.add(digits(money(f.targetRaise)))
    allowed.add(String(f.targetRaise))
    allowed.add(String(Math.round(f.targetRaise / 1e6)))
  }
  if (f.minimumCommitment) {
    allowed.add(digits(money(f.minimumCommitment)))
    allowed.add(String(f.minimumCommitment))
    allowed.add(String(Math.round(f.minimumCommitment / 1e3)))
  }
  // The profile does not state a currency, so a message may not add one: "5M" is a fact, "€5M" is a guess.
  const symbols = new Set(facts.match(/[€£$]/g) ?? [])
  return (text.match(MONEY_TOKEN) ?? []).filter(
    (t) => !allowed.has(digits(t)) || [...t.matchAll(/[€£$]/g)].some((m) => !symbols.has(m[0])),
  )
}

export type LpDraft = IntroDraft & { skip?: string }
/** Parse a model answer for one LP and decide if it may be proposed. */
export function checkLpDraft(text: string, entry: DraftEntry, f: FundFacts): LpDraft {
  const d = parseDraft(text, entry, { companyName: f.name, founderName: f.gpName ?? undefined })
  if (!d.usedModel) return { ...d, skip: "the model's answer could not be used" }
  const bad = draftProblem(d)
  if (bad) return { ...d, skip: bad }
  const invented = inventedFigures(`${d.subject}\n${d.email}\n${d.dm}`, f)
  if (invented.length)
    return { ...d, skip: `it states a figure that is not in the fund profile (${invented[0].trim()})` }
  if (d.dm.length > 600) return { ...d, skip: "the LinkedIn message is too long" }
  return d
}
