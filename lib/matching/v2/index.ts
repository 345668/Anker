/**
 * Public surface for matchmaking v2.
 */

export { runLpMatchingV2 } from "./engine"
export { saveSessionV2 } from "./persistence"
export { buildPipelineWorkbook, workbookToBuffer } from "./xlsx-builder"
export {
  buildMethodologyMarkdown,
  buildMeetingAgendaMarkdown,
} from "./report-builder"
export {
  MIN_QUALIFICATION_SCORE,
  MAX_THEORETICAL_SCORE,
  LP_TYPE_POINTS,
} from "./scoring"
export { isAiAvailable } from "./ai-enrichment"
export type {
  FundProfileV2,
  MatchingResultV2,
  ScoredFirmV2,
  ScoredContactV2,
  PipelineStage,
  OutreachSegment,
  TierId,
  ProgressEvent,
  MatchingFunnel,
  FunnelStage,
  FactorBreakdown,
} from "./types"
export {
  PIPELINE_STAGES,
  STAGE_LABELS,
  STAGE_TONE,
  OUTREACH_SEGMENTS,
  SEGMENT_META,
  TIER_DEFINITIONS,
  tierFor,
} from "./types"
