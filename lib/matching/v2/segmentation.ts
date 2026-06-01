/**
 * Outreach segmentation.
 *
 * Implements the 8 segments from the SVS methodology, in priority order.
 * An entity can belong to multiple segments (a $5B Utah family office is
 * both `local` and `anchor`); the engine still keeps it in each.
 */

import type {
  FundProfileV2,
  OutreachSegment,
  ScoredContactV2,
  ScoredFirmV2,
} from "./types"
import { detectRegions } from "./scoring"

export function classifyFirmSegments(
  firm: ScoredFirmV2,
  fund: FundProfileV2,
): OutreachSegment[] {
  const out = new Set<OutreachSegment>()

  // 1. Local — fund HQ region matches firm region
  const hqRegions = detectRegions(fund.headquartersLocation)
  const firmRegions = detectRegions(firm.location)
  if (
    hqRegions.some(
      (r) =>
        ["utah", "mountain_west", "dach", "gulf", "italy", "uk", "france", "canada", "india", "singapore", "japan", "china"].includes(r) &&
        firmRegions.includes(r),
    )
  ) {
    out.add("local")
  }

  // 2. Fund I re-up
  if (fund.fundIPriorLpFirmIds?.includes(firm.firmId)) {
    out.add("fund_i_reup")
  }

  // 3. Anchor candidate
  if (firm.isAnchor) out.add("anchor")

  // 4. University focus
  if (firm.tags.includes("UNI") || firm.tags.includes("ENDOW")) out.add("university")

  // 5. Emerging manager program
  if (firm.tags.includes("EM")) out.add("emerging_manager")

  // 7. Fund of funds
  if (firm.tags.includes("FoF")) out.add("fund_of_funds")

  // 8. International
  if (
    firmRegions.some((r) => ["dach", "gulf", "canada", "italy", "uk", "france", "india", "singapore", "japan", "china"].includes(r))
  ) {
    out.add("international")
  }

  return Array.from(out)
}

export function classifyContactSegments(
  contact: ScoredContactV2,
  fund: FundProfileV2,
): OutreachSegment[] {
  const out = new Set<OutreachSegment>()

  const hqRegions = detectRegions(fund.headquartersLocation)
  const cRegions = detectRegions(contact.location)

  if (
    hqRegions.some(
      (r) =>
        ["utah", "mountain_west", "dach", "gulf", "italy", "uk", "france", "canada", "india", "singapore", "japan", "china"].includes(r) &&
        cRegions.includes(r),
    )
  ) {
    out.add("local")
  }

  if (fund.fundIPriorContactEmails?.map((e) => e.toLowerCase()).includes(contact.email?.toLowerCase() ?? "")) {
    out.add("fund_i_reup")
  }

  // Family office contact with verified email → fo_with_email segment
  if (contact.tags.includes("FO") && contact.emailVerified) out.add("fo_with_email")

  if (contact.tags.includes("UNI") || contact.tags.includes("ENDOW")) out.add("university")
  if (contact.tags.includes("EM")) out.add("emerging_manager")
  if (contact.tags.includes("FoF")) out.add("fund_of_funds")

  if (
    cRegions.some((r) => ["dach", "gulf", "canada", "italy", "uk", "france", "india", "singapore", "japan", "china"].includes(r))
  ) {
    out.add("international")
  }

  return Array.from(out)
}

/**
 * Group entities by segment, ordered by segment priority then by score.
 */
export function groupBySegment<T extends { segments: OutreachSegment[]; score: number }>(
  entities: T[],
): Map<OutreachSegment, T[]> {
  const map = new Map<OutreachSegment, T[]>()
  for (const e of entities) {
    for (const seg of e.segments) {
      if (!map.has(seg)) map.set(seg, [])
      map.get(seg)!.push(e)
    }
  }
  for (const list of map.values()) list.sort((a, b) => b.score - a.score)
  return map
}
