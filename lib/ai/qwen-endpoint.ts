/**
 * The one place that decides which Alibaba (DashScope / Model Studio) endpoint a
 * Qwen call goes to. Doc 35.
 *
 * Before this, three modules each picked their own host — Beijing in the text
 * provider, a `intl.ap-southeast-1.maas…` host in PDF vision, Singapore in
 * embeddings — so one saved key could work for embeddings and fail for chat.
 * Alibaba keys are bound to the region that issued them, so "which region" has to
 * be a stated setting, not an accident of which file made the call.
 *
 * Pure: takes its inputs (env defaults to process.env), no I/O, easy to test.
 *
 * Precedence, most specific first:
 *   1. QWEN_BASE_URL            — an explicit full URL (proxy, private endpoint)
 *   2. a workspace id           — Model Studio per-workspace MaaS endpoint
 *   3. region                   — saved `qwenRegion`, then QWEN_REGION
 *   4. default                  — `intl` (Singapore), matching embeddings and media
 */

export type QwenRegion = "intl" | "us" | "cn"

const REGION_BASE: Record<QwenRegion, string> = {
  intl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  us: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
  cn: "https://dashscope.aliyuncs.com/compatible-mode/v1",
}

const ALIASES: Record<string, QwenRegion> = {
  intl: "intl", international: "intl", sg: "intl", singapore: "intl",
  us: "us", usa: "us", virginia: "us",
  cn: "cn", china: "cn", beijing: "cn",
}

/** Accepts the names an operator is likely to type; null for anything else. */
export function parseQwenRegion(v: string | null | undefined): QwenRegion | null {
  if (!v) return null
  return ALIASES[v.trim().toLowerCase()] ?? null
}

export interface QwenEndpointInput {
  region?: string | null
  workspaceId?: string | null
  env?: Record<string, string | undefined>
}

export interface QwenEndpoint {
  baseUrl: string
  /** Where the answer came from — shown in status and in the 401 hint. */
  source: "base_url_env" | "workspace" | "region" | "default"
  region: QwenRegion | null
}

export function resolveQwenEndpoint(input: QwenEndpointInput = {}): QwenEndpoint {
  const env = input.env ?? process.env
  const explicit = env.QWEN_BASE_URL?.trim()
  if (explicit) return { baseUrl: explicit.replace(/\/+$/, ""), source: "base_url_env", region: null }

  const ws = input.workspaceId?.trim()
  // "intl" was historically accepted in the workspace field to mean "the
  // international account". It is a region, not a workspace host.
  if (ws && ws.toLowerCase() !== "intl") {
    return { baseUrl: `https://${ws}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`, source: "workspace", region: null }
  }

  const region = parseQwenRegion(input.region) ?? parseQwenRegion(env.QWEN_REGION) ?? (ws ? "intl" : null)
  if (region) return { baseUrl: REGION_BASE[region], source: "region", region }
  return { baseUrl: REGION_BASE.intl, source: "default", region: "intl" }
}

export const qwenCompatBaseUrl = (input: QwenEndpointInput = {}): string => resolveQwenEndpoint(input).baseUrl

/** What to tell an operator when Qwen rejects the key. A DashScope key issued in
 *  one region is a 401 in every other, which reads exactly like a wrong key. */
export function qwenRegionHint(ep: QwenEndpoint): string {
  return ep.source === "default"
    ? "No Qwen region is set, so the international (Singapore) endpoint was used. If the key was issued in another region, set QWEN_REGION to intl, us or cn."
    : `Qwen was called on the ${ep.region ?? ep.source} endpoint; the key must have been issued in the same region.`
}
