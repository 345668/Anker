/**
 * Fund deck → LP shortlist (docs/architecture/18).
 *
 * The mirror of pdf-pipeline.ts for the other direction: there a founder's deck
 * finds investors, here a GP's fund deck finds limited partners. Same contract
 * on both sides — a profile extracted from the document alone, overrides
 * declared with their evidence, and outputs split into files of at most 200
 * rows with ranks continuous across them.
 *
 * Pure of HTTP and auth: the routes call these, and so does the end-to-end
 * test, so what a test exercises is what the product runs.
 */
import * as XLSX from "xlsx"
import { extractFundProfile, type ExtractedFundFields, type FileForFundExtraction } from "@/lib/ai/fund-deck-extractor"
import { fundReadiness, type ReadinessIssue } from "@/lib/matching/profile-readiness"
import { TIER_DEFINITIONS, type FundProfileV2, type ScoredContactV2, type ScoredFirmV2 } from "./types"
import { chunkInvestors, LIST_SIZE, readListRows } from "./pdf-pipeline"

export { LIST_SIZE, chunkInvestors, readListRows }

// ─── Input ──────────────────────────────────────────────────────────────────

/** Wrap raw PDF bytes the way the fund-deck upload route does. */
export function pdfForFundExtraction(bytes: Buffer, name: string): FileForFundExtraction {
  return { name, contentType: "application/pdf", base64: bytes.toString("base64") }
}

/** A value the deck could not supply, stated with the reason it is believed. */
export interface DeclaredFundOverride {
  field: keyof FundProfileV2
  value: unknown
  evidence: string
}

export interface FundProfileFromPdf {
  /** Exactly what extraction produced, untouched. */
  extracted: ExtractedFundFields
  /** What was missing BEFORE overrides — the honest deck-only readiness. */
  pdfOnlyMissing: ReadinessIssue[]
  overrides: DeclaredFundOverride[]
  /** The profile the engine will run on, or null if still incomplete. */
  fund: FundProfileV2 | null
  missing: ReadinessIssue[]
}

/** The engine reads sectors as one list; extraction reports a primary separately. */
function sectorsOf(x: ExtractedFundFields): string[] {
  const all = [...(x.primarySector ? [x.primarySector] : []), ...(x.sectors ?? [])]
  return [...new Set(all.map((s) => s.trim()).filter(Boolean))]
}

/**
 * Extract a fund profile from one PDF and validate it for LP matching.
 *
 * Overrides fill only what extraction left empty — a deck that states its
 * geography keeps it; one that only implies it (most do) gets the declared
 * value, and the report says which was which.
 */
export async function fundProfileFromPdf(
  pdf: FileForFundExtraction,
  overrides: DeclaredFundOverride[] = [],
  /** Reuse this workspace's earlier read of the same document (doc 21 §2). */
  opts: { orgId?: string | null } = {},
): Promise<FundProfileFromPdf> {
  const extracted = await extractFundProfile(pdf, [], { orgId: opts.orgId })

  const base: Partial<FundProfileV2> = {
    name: extracted.name?.trim() || "",
    fundNumber: extracted.fundNumber,
    targetRaise: Number.isFinite(extracted.targetRaise) ? Number(extracted.targetRaise) : null,
    averageTicket: Number.isFinite(extracted.averageTicket) ? Number(extracted.averageTicket) : null,
    sectors: sectorsOf(extracted),
    primarySectors: extracted.primarySector ? [extracted.primarySector] : [],
    geographicFocus: (extracted.geographicFocus ?? []).filter(Boolean),
    headquartersLocation: extracted.headquartersLocation?.trim() || null,
    thesisKeywords: (extracted.thesisKeywords ?? []).filter(Boolean),
  }

  const pdfOnlyMissing = fundReadiness(base as any)

  const applied: DeclaredFundOverride[] = []
  const merged: Record<string, unknown> = { ...base }
  for (const o of overrides) {
    const current = merged[o.field]
    const empty = current == null || current === "" || (Array.isArray(current) && current.length === 0)
    if (empty) { merged[o.field] = o.value; applied.push(o) }
  }

  const missing = fundReadiness(merged as any)
  const fund: FundProfileV2 | null = missing.length
    ? null
    : {
        id: `fp_pdf_${Date.now().toString(36)}`,
        name: String(merged.name),
        fundNumber: merged.fundNumber as number | undefined,
        targetRaise: (merged.targetRaise as number) ?? null,
        averageTicket: (merged.averageTicket as number) ?? null,
        sectors: merged.sectors as string[],
        primarySectors: merged.primarySectors as string[],
        geographicFocus: merged.geographicFocus as string[],
        headquartersLocation: (merged.headquartersLocation as string) ?? null,
        thesisKeywords: merged.thesisKeywords as string[],
        scoringMode: "svs_absolute",
      }
  return { extracted, pdfOnlyMissing, overrides: applied, fund, missing }
}

// ─── Output ─────────────────────────────────────────────────────────────────

const tierLabel = (t: string) => TIER_DEFINITIONS.find((d) => d.id === t)?.label ?? t
const joinList = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : v == null ? "" : String(v))
const money = (n: number | null | undefined) =>
  n == null ? "" : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`

export const LP_FIRM_LIST_HEADERS = [
  "Rank", "Score", "Tier", "Firm", "LP type", "Location", "AUM", "Sectors",
  "Anchor", "Segments", "Why this LP", "Website", "LinkedIn", "Anker ID",
] as const

export const LP_CONTACT_LIST_HEADERS = [
  "Rank", "Score", "Tier", "Name", "Title", "LP type", "Location", "Email",
  "Sectors", "Segments", "Why this LP", "LinkedIn", "Anker ID",
] as const

function firmRow(f: ScoredFirmV2, rank: number): (string | number)[] {
  return [
    rank, f.score, tierLabel(f.tier), f.name, f.type ?? "", f.location ?? "",
    f.aumUsd != null ? money(f.aumUsd) : (f.aumRaw ?? ""), joinList(f.sectors),
    f.isAnchor ? "Anchor" : "", joinList(f.segments), f.whyThisLp ?? "",
    f.website ?? "", f.linkedin ?? "", `firm:${f.firmId}`,
  ]
}

function contactRow(c: ScoredContactV2, rank: number): (string | number)[] {
  return [
    rank, c.score, tierLabel(c.tier), c.name, c.title ?? "", c.type ?? "", c.location ?? "",
    c.email ?? "", joinList(c.sectors), joinList(c.segments), c.whyThisLp ?? "",
    c.linkedin ?? "", `contact:${c.investorId}`,
  ]
}

export interface LpListFile {
  kind: "firms" | "contacts"
  index: number
  of: number
  firstRank: number
  lastRank: number
  rows: number
  workbook: XLSX.WorkBook
}

/**
 * Highest score first, and nothing else.
 *
 * Array.sort is stable, so entries sharing a score keep the order the engine
 * gave them — the same order the shortlist workbook and the saved rows use. A
 * name tiebreak here would renumber ties differently from those two, and a GP
 * cross-referencing rank 1 between the workbook and a list would find two
 * different firms.
 */
export function rankLps<T extends { score: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.score - a.score)
}

/**
 * Every LP of one kind, ranked, as Excel files of at most `size` rows.
 *
 * Ranks continue across files (1–200, 201–400, …) so the set reads as one
 * list, and the last column carries the stable key a CRM import needs.
 */
export function buildLpLists(
  kind: "firms" | "contacts",
  rows: readonly (ScoredFirmV2 | ScoredContactV2)[],
  fund: Pick<FundProfileV2, "name">,
  size = LIST_SIZE,
): LpListFile[] {
  const ranked = rankLps(rows as readonly (ScoredFirmV2 & ScoredContactV2)[])
  const chunks = chunkInvestors(ranked, size)
  const headers = kind === "firms" ? LP_FIRM_LIST_HEADERS : LP_CONTACT_LIST_HEADERS
  return chunks.map((chunk, i) => {
    const firstRank = i * size + 1
    const body = chunk.map((e, j) =>
      kind === "firms" ? firmRow(e as ScoredFirmV2, firstRank + j) : contactRow(e as ScoredContactV2, firstRank + j))
    const title = `${fund.name} — LP ${kind === "firms" ? "firms" : "contacts"} ${firstRank}–${firstRank + chunk.length - 1} of ${ranked.length}`
    const ws = XLSX.utils.aoa_to_sheet([[title], [], [...headers], ...body])
    ws["!cols"] = headers.map((h) => ({ wch: h === "Why this LP" ? 60 : h === "Sectors" ? 36 : h === "Rank" || h === "Score" ? 7 : 24 }))
    ws["!autofilter"] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${body.length + 3}` }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, kind === "firms" ? "LP Firms" : "LP Contacts")
    return { kind, index: i + 1, of: chunks.length, firstRank, lastRank: firstRank + chunk.length - 1, rows: chunk.length, workbook: wb }
  })
}
