/** The pure rules of the action layer: risk classes, who may decide, when a proposal may commit by itself. docs/architecture/43. No I/O here, so it is cheap to test. */
import { createHash } from "node:crypto"

export type RiskClass = "R0" | "R1" | "R2" | "R3"
export type ProposalStatus = "pending" | "applied" | "rejected" | "undone" | "expired" | "failed"
export type SourceTrust = "trusted" | "untrusted"
export interface DiffLine { label: string; before: string | null; after: string | null }

export const RISK_LABELS: Record<RiskClass, string> = {
  R0: "Internal and reversible",
  R1: "Internal, bulk or structural",
  R2: "Reaches a third party",
  R3: "Money, legal or regulatory",
}

/** Tools that read the outside world: after any of them runs, the rest of the run may have been steered by text a stranger wrote. */
export const UNTRUSTED_SOURCES = new Set(["web_search", "web_crawl", "outreach_inbox", "build_investor_profile", "analyze_image", "ocr_image", "translate_text", "call_intelligence", "dataroom_ingest", "dataroom_reconcile", "dataroom_normalize", "dataroom_statements", "dataroom_questions"])

/**
 * May this proposal be applied without a person? Only R0, only when the workspace turned it on for that class, and never when the run touched untrusted content.
 * R1 to R3 cannot be auto-committed by any setting: a stray row in workspace_autonomy must not be able to loosen them.
 */
export function mayAutoCommit(risk: RiskClass, trust: SourceTrust, autonomy: Partial<Record<RiskClass, boolean>>): boolean {
  if (risk !== "R0") return false
  if (trust !== "trusted") return false
  return autonomy.R0 === true
}

/** Roles that may approve, reject or undo. LPs and read-only tokens never reach here as they have no write access. */
export const DECIDER_ROLES = ["workspace_owner", "admin", "member"]
/** Roles that may change the autonomy switch. */
export const AUTONOMY_ROLES = ["workspace_owner", "admin"]

/** Same call within a run, same key: the assistant retrying a tool call returns the proposal it already made. */
export function idempotencyKey(runId: string | null, capability: string, input: unknown): string {
  const canon = JSON.stringify(input, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v))
  return createHash("sha256").update(`${runId ?? "no-run"}|${capability}|${canon}`).digest("hex").slice(0, 40)
}
