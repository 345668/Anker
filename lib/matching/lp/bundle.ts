/** One zip of everything a run produces (docs/architecture/63 section 5; audit O2): the workbook, the two CSV files, the methodology note and the meeting agenda. */
import { zipSync, strToU8 } from "fflate"
import { buildPipelineWorkbook, workbookToBuffer } from "@/lib/matching/v2/xlsx-builder"
import { buildMeetingAgendaMarkdown, buildMethodologyMarkdown } from "@/lib/matching/v2/report-builder"
import type { FundProfileV2, MatchingResultV2 } from "@/lib/matching/v2/types"
import { contactsCsv, firmsCsv, slugify } from "./session-result"

export function buildBundle(result: MatchingResultV2, fund: FundProfileV2): { name: string; bytes: Uint8Array } {
  const base = slugify(fund.name)
  const files: Record<string, Uint8Array> = {
    [`${base}-lp-pipeline.xlsx`]: new Uint8Array(workbookToBuffer(buildPipelineWorkbook(result, fund))),
    [`${base}-firms.csv`]: strToU8("﻿" + firmsCsv(result)),
    [`${base}-contacts.csv`]: strToU8("﻿" + contactsCsv(result)),
    [`${base}-methodology.md`]: strToU8(buildMethodologyMarkdown(result, fund)),
    [`${base}-meeting-agenda.md`]: strToU8(buildMeetingAgendaMarkdown(result, fund)),
  }
  return { name: `${base}-lp-matching.zip`, bytes: zipSync(files, { level: 6 }) }
}
