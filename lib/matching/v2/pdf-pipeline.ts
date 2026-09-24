/**
 * Founder matching, driven by a pitch-deck PDF alone.
 *
 * The production chain — PDF text → profile extraction → readiness → the
 * matching engine → workbook export — composed so it can be run and tested from
 * a single file with no HTTP layer. Every step calls the same code the routes
 * call; nothing here re-implements extraction, scoring or the shortlist export.
 * See docs/architecture/09-founder-matching-pdf-test.md.
 *
 * What this module adds is the part the product did not have: splitting a full
 * ranked result into Excel lists of bounded size, so thousands of matches can
 * be worked through in batches.
 */

import * as XLSX from "xlsx"
import { extractStartupProfile, type FileForExtraction } from "./document-extractor"
import { startupSchema, startupReadiness, type ReadinessIssue } from "../profile-readiness"
import type { FirmGroup, ScoredInvestorEntity, StartupProfile } from "./founder-types"
import { TIER_DEFINITIONS } from "./types"
import { statusLabel } from "@/lib/email-verification/types"

/** The most rows one list file may hold. */
export const LIST_SIZE = 200

// ─── Input ──────────────────────────────────────────────────────────────────

/** Wrap raw PDF bytes the way the upload route does before extraction. */
export function pdfForExtraction(bytes: Buffer, name: string): FileForExtraction {
  return { name, contentType: "application/pdf", base64: bytes.toString("base64") }
}

/**
 * Values a PDF could not supply, stated explicitly with the reason they are
 * believed. Kept apart from the extracted profile so a report can always say
 * which fields came from the document and which did not.
 */
export interface DeclaredOverride {
  field: keyof StartupProfile
  value: unknown
  evidence: string
}

export interface ProfileFromPdf {
  /** Exactly what extraction produced, untouched. */
  extracted: Awaited<ReturnType<typeof extractStartupProfile>>
  /** What was missing BEFORE overrides — the honest PDF-only readiness. */
  pdfOnlyMissing: ReadinessIssue[]
  /** Applied on top of the extraction, each with its evidence. */
  overrides: DeclaredOverride[]
  /** The validated profile the engine will run on, or null if still incomplete. */
  startup: StartupProfile | null
  missing: ReadinessIssue[]
}

/**
 * Extract a profile from one PDF and validate it for matching.
 *
 * Overrides only fill fields extraction left EMPTY — they never replace a value
 * the document supplied. A deck that states its location keeps it; one that
 * does not (some decks do not) gets the declared value and the report says so.
 */
export async function profileFromPdf(
  pdf: FileForExtraction,
  overrides: DeclaredOverride[] = [],
  /** Reuse this workspace's earlier read of the same document (doc 21 §2). */
  opts: { orgId?: string | null } = {},
): Promise<ProfileFromPdf> {
  const extracted = await extractStartupProfile(pdf, [], { orgId: opts.orgId })
  const base: Record<string, unknown> = { ...extracted }
  delete base.confidence; delete base.notes; delete base.extractedFrom
  // The schema rejects nulls and empty arrays where a value is required; a
  // missing field should read as missing, not as an invalid one.
  for (const [k, v] of Object.entries(base)) if (v == null || v === "") delete base[k]
  if (!base.thesisKeywords) base.thesisKeywords = []

  const pdfOnlyMissing = startupReadiness(base)

  const applied: DeclaredOverride[] = []
  const merged: Record<string, unknown> = { ...base }
  for (const o of overrides) {
    const current = merged[o.field]
    const empty = current == null || current === "" || (Array.isArray(current) && current.length === 0)
    if (empty) { merged[o.field] = o.value; applied.push(o) }
  }

  const parsed = startupSchema.safeParse(merged)
  const missing = startupReadiness(merged)
  const startup: StartupProfile | null = parsed.success
    ? {
        ...(parsed.data as any),
        id: `sp_pdf_${Date.now().toString(36)}`,
        preMoneyValuation: parsed.data.preMoneyValuation ?? null,
        checkSizeIdealMin: parsed.data.checkSizeIdealMin ?? null,
        checkSizeIdealMax: parsed.data.checkSizeIdealMax ?? null,
        extractedFrom: extracted.extractedFrom,
      }
    : null
  return { extracted, pdfOnlyMissing, overrides: applied, startup, missing }
}

// ─── Output ─────────────────────────────────────────────────────────────────

/**
 * Split a ranked list into consecutive chunks of at most `size`.
 *
 * Pure. The invariant the tests hold it to: concatenating the chunks gives back
 * the input exactly — same items, same order, none lost, none repeated.
 */
export function chunkInvestors<T>(items: readonly T[], size = LIST_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`chunk size must be a positive integer, got ${size}`)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Rank investors by score, highest first, with a stable tiebreak on name then id. */
export function rankInvestors<T extends Pick<ScoredInvestorEntity, "score" | "name" | "id">>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    b.score - a.score || a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)))
}

/** Same labels the product workbook uses, so a list and the shortlist never disagree. */
const tierLabel = (t: string) => TIER_DEFINITIONS.find((d) => d.id === t)?.label ?? t
const joinList = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : v == null ? "" : String(v))
// Same formatting as the workbook and the CSVs, so one run never shows two spellings.
const money = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`)

export const FIRM_LIST_HEADERS = [
  "Rank", "Score", "Tier", "Firm", "Type", "Location", "Stages", "Check size",
  "Sectors", "Why match", "Website", "LinkedIn", "Anker ID",
] as const

export const PEOPLE_LIST_HEADERS = [
  "Rank", "Score", "Tier", "Name", "Title", "Type", "Location", "Email",
  "Email status", "LinkedIn", "Sectors", "Why match", "Anker ID",
] as const

/** Firm groups (docs/architecture/11 §5): the firm, its primary contact, two alternates. */
export const GROUP_LIST_HEADERS = [
  "Rank", "Score", "Tier", "Firm", "Type", "Location", "Stages", "Check size", "Sectors", "Why match",
  "Primary contact", "Title", "Email", "Email status", "LinkedIn", "Alternates", "Website", "Anker ID",
] as const

function firmRow(e: ScoredInvestorEntity, rank: number): (string | number)[] {
  const check = e.checkSizeMin != null || e.checkSizeMax != null ? `${money(e.checkSizeMin)}–${money(e.checkSizeMax)}` : ""
  return [rank, e.score, tierLabel(e.tier), e.name, e.type, e.location, joinList(e.stages),
    check, joinList(e.sectors), e.whyMatch, e.website ?? "", e.linkedin ?? "", `firm:${e.id}`]
}

function personRow(e: ScoredInvestorEntity, rank: number): (string | number)[] {
  return [rank, e.score, tierLabel(e.tier), e.name, e.title ?? "", e.type, e.location,
    e.email ?? "", e.email ? statusLabel(e.emailStatus) : "", e.linkedin ?? "",
    joinList(e.sectors), e.whyMatch, `contact:${e.id}`]
}

export interface ListFile {
  kind: "firms" | "people"
  /** 1-based file number within its series. */
  index: number
  /** How many files the series has. */
  of: number
  /** Global rank of the first and last row. */
  firstRank: number
  lastRank: number
  rows: number
  workbook: XLSX.WorkBook
}

/**
 * Every investor of one kind, ranked, as Excel files of at most LIST_SIZE rows.
 *
 * Rank is global across the series, so file 2 starts at 201 rather than 1 — a
 * founder working through the lists always knows where they are in the whole.
 */
export function buildInvestorLists(
  kind: "firms" | "people",
  investors: readonly ScoredInvestorEntity[],
  startup: Pick<StartupProfile, "name">,
  size = LIST_SIZE,
): ListFile[] {
  const ranked = rankInvestors(investors)
  const chunks = chunkInvestors(ranked, size)
  const headers = kind === "firms" ? FIRM_LIST_HEADERS : PEOPLE_LIST_HEADERS
  return chunks.map((chunk, i) => {
    const firstRank = i * size + 1
    const rows = chunk.map((e, j) => (kind === "firms" ? firmRow : personRow)(e, firstRank + j))
    const title = `${startup.name} — ${kind === "firms" ? "investor firms" : "individual investors"} ${firstRank}–${firstRank + chunk.length - 1} of ${ranked.length}`
    const ws = XLSX.utils.aoa_to_sheet([[title], [], [...headers], ...rows])
    ws["!cols"] = headers.map((h) => ({ wch: h === "Why match" ? 60 : h === "Sectors" ? 36 : h === "Rank" || h === "Score" ? 7 : 24 }))
    ws["!autofilter"] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 3}` }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, kind === "firms" ? "Firms" : "People")
    return { kind, index: i + 1, of: chunks.length, firstRank, lastRank: firstRank + chunk.length - 1, rows: chunk.length, workbook: wb }
  })
}

function groupRow(g: FirmGroup, rank: number): (string | number)[] {
  const f = g.firm, p = g.primary
  const check = f.checkSizeMin != null || f.checkSizeMax != null ? `${money(f.checkSizeMin)}–${money(f.checkSizeMax)}` : ""
  return [rank, f.score, tierLabel(f.tier), f.name, f.type, f.location, joinList(f.stages), check, joinList(f.sectors), f.whyMatch,
    p?.name ?? "", p?.title ?? "", p?.email ?? "", p?.email ? statusLabel(p.emailStatus) : "", p?.linkedin ?? "",
    g.alternates.map((a) => `${a.name}${a.email ? ` <${a.email}>` : ""}`).join("; "), f.website ?? "", `firm:${f.id}`]
}

/**
 * Firm groups as Excel files of at most `size` rows, ranked by the engine's
 * order (the input order), with global ranks across files.
 */
export function buildGroupLists(groups: readonly FirmGroup[], startup: Pick<StartupProfile, "name">, size = LIST_SIZE): ListFile[] {
  const chunks = chunkInvestors(groups, size)
  return chunks.map((chunk, i) => {
    const firstRank = i * size + 1
    const rows = chunk.map((g, j) => groupRow(g, firstRank + j))
    const title = `${startup.name} — firm groups ${firstRank}–${firstRank + chunk.length - 1} of ${groups.length}`
    const ws = XLSX.utils.aoa_to_sheet([[title], [], [...GROUP_LIST_HEADERS], ...rows])
    ws["!cols"] = GROUP_LIST_HEADERS.map((h) => ({ wch: h === "Why match" || h === "Alternates" ? 55 : h === "Rank" || h === "Score" ? 7 : 24 }))
    ws["!autofilter"] = { ref: `A3:${XLSX.utils.encode_col(GROUP_LIST_HEADERS.length - 1)}${rows.length + 3}` }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Firm groups")
    return { kind: "firms" as const, index: i + 1, of: chunks.length, firstRank, lastRank: firstRank + chunk.length - 1, rows: chunk.length, workbook: wb }
  })
}

/** Read a list workbook back into rows, for verification. Skips title and blank lines. */
export function readListRows(wb: XLSX.WorkBook): { headers: string[]; rows: (string | number)[][] } {
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: false })
  const [, headers, ...rows] = aoa as any[]
  return { headers: headers as string[], rows }
}
