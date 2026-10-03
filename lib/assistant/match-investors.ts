/**
 * `match_investors`: the founder's matchmaking, run by the platform's own engine.
 *
 * The assistant used to answer "match me with 50 investors" by pulling firms with a keyword
 * and asking a model to score each one 1-10 (`score_investors`). That ignores everything the
 * matching engine (founder-v3, docs/architecture/11) already does well: thesis, stage, check
 * size, geography, lead capacity and investor type as one calibrated score; the workspace's CRM,
 * suppressions and passed investors excluded; one ranked list that never repeats a firm; saved
 * runs the founder can reopen. This tool gives the agent that engine instead.
 *
 * The model's job is only to read the deck and the user's words into a startup profile. The
 * ranking is deterministic and the same as the Founder Matching page.
 */
import { startupSchema, startupReadiness } from "@/lib/matching/profile-readiness"
import { runFounderMatching } from "@/lib/matching/v2/founder-engine"
import { latestProfile, saveProfile, saveRun } from "@/lib/matching/v2/founder-runs"
import { buildFounderWorkbook, workbookToBuffer } from "@/lib/matching/v2/founder-xlsx"
import { STARTUP_STAGES, type StartupProfile } from "@/lib/matching/v2/founder-types"
import { TIER_DEFINITIONS } from "@/lib/matching/v2/types"
import { normPhrase } from "@/lib/matching/normalize/text"
import { parseFilters, hasFilters, describeFilters, REGIONS, type MatchFilters } from "@/lib/matching/filters"
import { investorClass } from "@/lib/matching/normalize/classes"
import { resolveGeo } from "@/lib/matching/normalize/geo"
import { sectorGroupOf } from "@/lib/matching/normalize/sectors"
import { saveArtifact, type ToolResult } from "./artifact"
import type { AiPrincipal } from "./context"

const MAX_COUNT = 200
const SHOWN = 25

/** "Pre-Seed", "pre seed", "Series A" → the engine's stage keys. */
export function normalizeStage(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const k = raw.trim().toLowerCase().replace(/[\s_]+/g, "-")
  if ((STARTUP_STAGES as readonly string[]).includes(k)) return k
  const compact = k.replace(/-/g, "")
  return (STARTUP_STAGES as readonly string[]).find((s) => s.replace(/-/g, "") === compact)
}

// "United States" is the one place a deck says in several ways. A bare "US" is not accepted as a
// match for it, because "us" is also the pronoun.
const US_FORMS = ["united states", "united states of america", "usa", "u s a", "u s", "america"]
const isUs = (p: string) => p === "us" || US_FORMS.includes(p)

/**
 * Is this place actually written in what the user said or uploaded?
 *
 * The model was filling a required location with a guess ("team is US-based"), and the engine
 * then favoured that geography. The tool now insists the place appear, as whole words, in the
 * deck text or the conversation. Only the first part is checked ("Columbus, OH" needs
 * "Columbus"), so a deck that says "Columbus, Ohio" still passes for "Columbus, OH".
 */
export function locationIsStated(location: string, source: string): boolean {
  const primary = normPhrase(String(location).split(",")[0] ?? "")
  const text = ` ${normPhrase(source)} `
  if (!primary || !text.trim()) return false
  if (isUs(primary)) return US_FORMS.some((f) => text.includes(` ${f} `))
  return text.includes(` ${primary} `)
}

/** "$500K–$3M". Either end may be unknown. */
export function checkRange(min?: number | null, max?: number | null): string {
  const f = (n: number) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`)
  if (min != null && max != null) return `${f(min)}–${f(max)}`
  if (max != null) return `up to ${f(max)}`
  if (min != null) return `from ${f(min)}`
  return "check size n/a"
}

/**
 * Is this dollar amount written in what the user said or uploaded? "$500,000", "500000", "500K", "0.5M"
 * and "half a million" style are not all the same string, so the common spellings are tried. Used for the
 * ideal check size, which a model kept filling with a guess (50K-250K for a $1.5M round) that the engine then
 * took as the founder's own preference and aimed at, instead of the lead-size band it uses by default.
 */
export function amountIsStated(n: number, source: string): boolean {
  if (!(n > 0) || !source) return false
  const text = source.toLowerCase().replace(/[,$\s]/g, "")
  const forms = new Set<string>([String(n)])
  if (n >= 1e3 && n % 1e3 === 0) forms.add(`${n / 1e3}k`)
  if (n >= 1e6) { const m = +(n / 1e6).toFixed(3); forms.add(`${m}m`); forms.add(`${m}mm`); forms.add(`${m}million`) }
  return [...forms].some((f) => {
    let from = 0
    for (;;) {
      const i = text.indexOf(f, from)
      if (i < 0) return false
      const before = text[i - 1], after = text[i + f.length]
      // whole number only: "250" must not match inside "1250k" or "2500"
      if (!(before && /[0-9.]/.test(before)) && !(after && /[0-9]/.test(after))) return true
      from = i + 1
    }
  })
}

const HUMAN_SET = ["typed", "workspace", "override"]
const IDEAL_KEYS = ["checkSizeIdealMin", "checkSizeIdealMax"] as const

/**
 * The founder's mandate ("only US investors", "VC funds", "in sports"), snapped to the engine's vocabulary.
 *
 * A model writes these as it likes ("VC funds", "United States", "sports tech"). The engine's own parser
 * drops the WHOLE filter set when one value is not in its vocabulary, which would turn a stated mandate
 * into no mandate without a word. So each term is mapped here, one by one, and any term that cannot be read
 * is returned in `unread` for the answer to say so, instead of being ignored.
 */
export function normalizeMandate(raw: unknown): { filters: MatchFilters; unread: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map((x) => String(x).trim()).filter(Boolean)
  const unread: string[] = []
  const toClass = (t: string, what: string) => {
    const c = investorClass(t)
    if (c === "other" && !/^other$/i.test(t)) { unread.push(`${what} "${t}"`); return null }
    return c
  }
  const classes = list(r.classes).map((t) => toClass(t, "investor type")).filter((c): c is NonNullable<typeof c> => !!c)
  const excludeClasses = list(r.excludeClasses).map((t) => toClass(t, "excluded investor type")).filter((c): c is NonNullable<typeof c> => !!c)
  const countries: string[] = []
  for (const t of list(r.countries)) {
    const iso = /^[A-Za-z]{2}$/.test(t) ? t.toUpperCase() : resolveGeo(t).countries?.[0] ?? null
    if (iso) countries.push(iso); else unread.push(`country "${t}"`)
  }
  const regions: string[] = []
  for (const t of list(r.regions)) {
    const key = t.toLowerCase().replace(/[\s&-]+/g, "_")
    const hit = (REGIONS as string[]).find((x) => x === key) ?? resolveGeo(t).regions?.[0]
    if (hit) regions.push(hit); else unread.push(`region "${t}"`)
  }
  const sectors: string[] = []
  for (const t of list(r.sectors)) {
    if (sectorGroupOf(t)) sectors.push(t); else unread.push(`sector "${t}"`)
  }
  return { filters: parseFilters({ classes, excludeClasses, countries, regions, sectors }), unread }
}

const empty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0)

export async function matchInvestors(inp: any, principal: AiPrincipal | undefined, sourceText = ""): Promise<ToolResult> {
  if (!principal?.orgId || principal.persona !== "founder") {
    return { observation: "Investor matching needs a founder workspace. Select your company workspace and try again." }
  }
  const scope = { orgId: principal.orgId, userId: principal.userId }
  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(Number(inp?.count)) || 50))

  const given: Record<string, any> = { ...(inp?.startup ?? {}) }
  if (given.stage !== undefined) given.stage = normalizeStage(given.stage) ?? given.stage
  for (const k of Object.keys(given)) if (empty(given[k])) delete given[k]

  // A saved profile fills gaps, but only for the SAME startup: another company's saved profile
  // must never leak its location or round size into this run.
  const saved = await latestProfile(scope).catch(() => null)
  const sameStartup = !!saved?.fields?.name && String(saved.fields.name).trim().toLowerCase() === String(given.name ?? "").trim().toLowerCase()
  const merged: Record<string, any> = { ...(sameStartup ? saved!.fields : {}), ...given }

  // The founder's ideal check size is the founder's: accepted only if they stated it (this conversation or
  // the deck), or a person set it earlier. A model's guess is dropped, so the engine aims at lead-size
  // checks as it does by default.
  const droppedIdeal: string[] = []
  for (const k of IDEAL_KEYS) {
    if (merged[k] == null) continue
    const fromInput = k in given
    const stated = fromInput ? amountIsStated(Number(merged[k]), sourceText)
      : sameStartup && HUMAN_SET.includes(saved?.provenance?.[k])
    if (!stated) { droppedIdeal.push(k); delete merged[k]; delete given[k] }
  }

  const parsed = startupSchema.safeParse(merged)
  if (!parsed.success) {
    const missing = startupReadiness(merged)
    return {
      observation:
        `Cannot run matching yet. Missing or invalid: ${missing.map((m) => m.label).join("; ")}. ` +
        `Read them from the uploaded deck or ask the user, then call match_investors again with the full startup profile. ` +
        `Do not invent values.`,
    }
  }

  // The location is the one required field the model kept guessing. A person typed it earlier in
  // this workspace (saved, and not itself taken from a deck by a model), or it is written in this
  // conversation; otherwise ask, do not infer.
  const trustedSaved = sameStartup && ["typed", "workspace", "override"].includes(saved?.provenance?.location)
    && String(saved?.fields?.location ?? "").trim().toLowerCase() === String(parsed.data.location).trim().toLowerCase()
  if (!trustedSaved && !locationIsStated(parsed.data.location, sourceText)) {
    return {
      observation:
        `"${parsed.data.location}" does not appear in the deck or in this conversation, so it cannot be used: location is not inferred. ` +
        `Ask the user where ${parsed.data.name} is headquartered (city and country), then call match_investors again with their answer. ` +
        `Do not guess and do not run matching without it.`,
    }
  }

  const provenance: Record<string, string> = {}
  for (const k of Object.keys(parsed.data)) {
    if (k in given) provenance[k] = "deck"
    else if (sameStartup && saved?.provenance?.[k]) provenance[k] = saved.provenance[k]
  }
  const { id: _ignored, ...fields } = parsed.data
  const profile = await saveProfile(scope, fields, provenance)
  const startup = {
    ...parsed.data, id: profile.id,
    preMoneyValuation: parsed.data.preMoneyValuation ?? null,
    checkSizeIdealMin: parsed.data.checkSizeIdealMin ?? null, checkSizeIdealMax: parsed.data.checkSizeIdealMax ?? null,
  } as StartupProfile

  // Deterministic and fast: no model-written rationales and no live email verification inside an
  // agent step. The Founder Matching page can add both afterwards from the saved run.
  const mandate = normalizeMandate(inp?.filters)
  const options = { maxFirms: count, maxContacts: count, enableAi: false, verifyEmails: false, filters: mandate.filters }
  const result = await runFounderMatching(startup, { ...options, scope })
  await saveRun(result, startup, scope, { options, profileVersionId: profile.id })

  const groups = result.groups ?? []
  // saveArtifact keeps only [a-z0-9_-], so an accent ("Ōra") became an underscore ("_ra") and a space
  // another. Strip accents to their base letters first, and name the file in the report from what was
  // actually saved, so the text and the download always agree.
  const plainName = startup.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  const artifact = await saveArtifact(workbookToBuffer(buildFounderWorkbook(result, startup)), `Investor_Pipeline_${plainName}`, "xlsx")

  const label = new Map(TIER_DEFINITIONS.map((t) => [t.id, t.label]))
  const lines = groups.slice(0, SHOWN).map((g, i) =>
    `${i + 1}. ${g.firm.name} — ${g.firm.score.toFixed(1)} (${label.get(g.firm.tier) ?? g.firm.tier}) | ${g.firm.type || "?"} | ${g.firm.location || "?"} | ${g.firm.whyMatch}`)
  const tiers = result.tierCounts.firms
  const tierText = TIER_DEFINITIONS.map((t) => `${t.label} ${tiers[t.id] ?? 0}`).join(", ")
  const qualified = result.qualifiedBeforeCap?.groups ?? result.totals.qualifiedFirms
  const ex = result.exclusions
  const exText = ex ? ` Left out because they are already in your CRM, suppressed, passed or excluded: ${ex.inCrm + ex.suppressed + ex.declined + ex.excludedByFounder + ex.excludedTypes}.` : ""

  // The block the user sees, from the engine's own numbers (docs/architecture/36 addendum).
  // Plain lines on purpose: one surface renders markdown and the other shows text as typed.
  const mandateText = hasFilters(mandate.filters) ? describeFilters(mandate.filters) : ""
  const outsideSector = result.exclusions?.outsideSector ?? 0
  const report =
    `Investor matches for ${startup.name}: ${groups.length} firms ranked (${qualified.toLocaleString("en-US")} qualified in total)\n` +
    (mandateText ? `Mandate: ${mandateText}${outsideSector ? ` (${outsideSector.toLocaleString("en-US")} firms outside the sector were left out)` : ""}\n` : "") +
    (mandate.unread.length ? `Could not apply: ${mandate.unread.join("; ")}\n` : "") +
    `Tiers: ${tierText}.${exText}\n` +
    (groups.length < count ? `You asked for ${count}; only ${groups.length} cleared the minimum score, so that is the number.\n` : "") +
    `\nTop ${Math.min(SHOWN, groups.length)}\n` +
    groups.slice(0, SHOWN).map((g, i) =>
      `${i + 1}. ${g.firm.name} — ${g.firm.score.toFixed(1)} · ${g.firm.type || "?"} · ${g.firm.location || "?"} · ${checkRange(g.firm.checkSizeMin, g.firm.checkSizeMax)}`).join("\n") +
    `\n\nFull ranked list: ${artifact.name} (also saved on the Founder Matching page).`

  return {
    report,
    countClaim: groups.length < count ? { asked: count, found: groups.length } : undefined,
    notice: groups.length < count ? `Only ${groups.length} firms qualified, not the ${count} asked for. Counts in the text below that say otherwise are wrong; the verified list is at the end.` : undefined,
    observation:
      `A verified results list (counts and the top ${Math.min(SHOWN, groups.length)}) is appended to your answer automatically; do not retype it.\n` +
      (mandateText ? `Mandate applied: ${mandateText}. Fewer firms than asked for is the honest result when the mandate is narrow.\n` : "") +
      (mandate.unread.length ? `Could not read these filters, so they were NOT applied: ${mandate.unread.join("; ")}. Tell the user.\n` : "") +
      (droppedIdeal.length ? `Ignored an ideal check size that is not stated in the deck or this conversation; the engine aims at lead-size checks (a quarter of the round up to the round) instead.\n` : "") +
      `Matching engine ${result.engineVersion ?? "founder-v3"} for "${startup.name}" (${startup.stage}, ${startup.askAmount ? `$${Number(startup.askAmount).toLocaleString("en-US")} round` : "round size n/a"}).\n` +
      `${groups.length} firms ranked in ONE workbook (you asked for ${count}; ${qualified} firms qualified in total). ` +
      `Tiers: ${tierText}.${exText}\n` +
      (groups.length < count ? `Fewer than ${count} firms cleared the minimum score, so ${groups.length} is the honest number; say so, do not pad the list.\n` : "") +
      `\nTop ${Math.min(SHOWN, groups.length)}:\n${lines.join("\n") || "(none)"}\n\n` +
      `The saved run is on the Founder Matching page. Workbook (Summary, Lead Candidates, Firm Groups, Independent Investors, Ready to Email, Import Selection) → ${artifact.url}`,
    artifact,
  }
}
