/**
 * Which tasks may use the open-weights lane, and where in the order (docs/architecture/53 section 4.4). Pure.
 *
 *  - FAST tasks (classification, one-line rationales, URL and firm lookups) go to open weights FIRST when the lane is usable, then the rest of the chain.
 *  - Every other task never uses it, unless its name is in `evalPassed` (set only after that task's evaluation passed: section 8).
 *  - PRIVATE MODE is the workspace's data policy `no_external` (docs/architecture/54 D6): the policy filter keeps only providers whose recorded region is "self", so the lane is the only
 *    one left, for EVERY task, and when it is down or cold the request FAILS CLOSED with the policy's message and nothing is sent to a third party. That is why private mode needs no
 *    separate switch: the lane's region in the sub-processor register decides, and it is recorded as unknown until a data-processing agreement exists.
 */
export const FAST_TASKS = ["reply_classify", "ai_rationale", "url_classify", "firm_lookup", "match_summary", "doc_summary"] as const
export interface LaneState {
  /** The platform flag `ai_openweights`. */
  flagOn: boolean
  /** Base URL, key and a licence-cleared model are all present. */
  usable: boolean
  /** The circuit breaker lets a call through. */
  healthy: boolean
  /** Tasks whose evaluation passed (names), beyond the fast ones. */
  evalPassed?: string[]
  /** The workspace's data policy preset. */
  preset?: "standard" | "eu_only" | "no_external"
}
export type Chain = string[]
export function planChain(chain: Chain, task: string | undefined, s: LaneState): Chain {
  const rest = chain.filter((p) => p !== "openweights")
  if (!s.flagOn || !s.usable || !s.healthy) return rest.length === chain.length ? chain : rest
  const privateMode = s.preset === "no_external"
  const allowedTask = !!task && ((FAST_TASKS as readonly string[]).includes(task) || (s.evalPassed ?? []).includes(task))
  if (privateMode) return ["openweights", ...rest]        // the policy filter removes the rest; if it removes nothing here the workspace is not private
  if (!allowedTask) return rest
  return ["openweights", ...rest]
}
