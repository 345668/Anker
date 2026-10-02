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
  const options = { maxFirms: count, maxContacts: count, enableAi: false, verifyEmails: false }
  const result = await runFounderMatching(startup, { ...options, scope })
  await saveRun(result, startup, scope, { options, profileVersionId: profile.id })

  const groups = result.groups ?? []
  const artifact = await saveArtifact(workbookToBuffer(buildFounderWorkbook(result, startup)), `Investor_Pipeline_${startup.name}`, "xlsx")

  const label = new Map(TIER_DEFINITIONS.map((t) => [t.id, t.label]))
  const lines = groups.slice(0, SHOWN).map((g, i) =>
    `${i + 1}. ${g.firm.name} — ${Math.round(g.firm.score)} (${label.get(g.firm.tier) ?? g.firm.tier}) | ${g.firm.type || "?"} | ${g.firm.location || "?"} | ${g.firm.whyMatch}`)
  const tiers = result.tierCounts.firms
  const tierText = TIER_DEFINITIONS.map((t) => `${t.label} ${tiers[t.id] ?? 0}`).join(", ")
  const qualified = result.qualifiedBeforeCap?.groups ?? result.totals.qualifiedFirms
  const ex = result.exclusions
  const exText = ex ? ` Left out because they are already in your CRM, suppressed, passed or excluded: ${ex.inCrm + ex.suppressed + ex.declined + ex.excludedByFounder + ex.excludedTypes}.` : ""

  return {
    observation:
      `Matching engine ${result.engineVersion ?? "founder-v3"} for "${startup.name}" (${startup.stage}, ${startup.askAmount ? `$${Number(startup.askAmount).toLocaleString("en-US")} round` : "round size n/a"}).\n` +
      `${groups.length} firms ranked in ONE workbook (you asked for ${count}; ${qualified} firms qualified in total). ` +
      `Tiers: ${tierText}.${exText}\n` +
      (groups.length < count ? `Fewer than ${count} firms cleared the minimum score, so ${groups.length} is the honest number; say so, do not pad the list.\n` : "") +
      `\nTop ${Math.min(SHOWN, groups.length)}:\n${lines.join("\n") || "(none)"}\n\n` +
      `The saved run is on the Founder Matching page. Workbook (Summary, Lead Candidates, Firm Groups, Independent Investors, Ready to Email, Import Selection) → ${artifact.url}`,
    artifact,
  }
}
