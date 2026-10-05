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

/**
 * A proposal that would email third parties (R2) cannot come from a run that read outside content: a stranger's text must not be able to queue mail to people, so the
 * refusal is at creation, not only at approval. Returns the reason, or null. docs/architecture/46 §6.
 */
export function mayPropose(risk: RiskClass, trust: SourceTrust): string | null {
  if ((risk === "R2" || risk === "R3") && trust !== "trusted") return "This conversation has read outside content (a web page, an upload or an inbound reply), so it cannot propose sending email. Ask again in a new conversation."
  return null
}

/** "Approve all" in the inbox never covers sending: each batch is read and approved on its own. */
export const bulkApprovable = (risk: RiskClass): boolean => risk === "R0" || risk === "R1"

/** Roles that may approve, reject or undo. LPs and read-only tokens never reach here as they have no write access. */
export const DECIDER_ROLES = ["workspace_owner", "admin", "member"]
/** Roles that may change the autonomy switch. */
export const AUTONOMY_ROLES = ["workspace_owner", "admin"]

/** Same call within a run, same key: the assistant retrying a tool call returns the proposal it already made. */
export function idempotencyKey(runId: string | null, capability: string, input: unknown): string {
  const canon = JSON.stringify(input, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v))
  return createHash("sha256").update(`${runId ?? "no-run"}|${capability}|${canon}`).digest("hex").slice(0, 40)
}
