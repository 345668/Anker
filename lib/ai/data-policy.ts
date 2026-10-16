import { sql } from "@/lib/db"
import { currentAiContext } from "@/lib/assistant/context"

/**
 * Where a workspace's content may be sent for AI processing (docs/architecture/54, D6). The preset is chosen per workspace in SAIL; the provider's region comes from the
 * sub-processor register. A workspace without a row behaves as before (`standard`). A policy that leaves no allowed provider FAILS CLOSED: the feature says so and nothing is sent.
 * The policy applies to every AI call made inside a workspace's request (the ambient principal), so it does not depend on each call site passing anything.
 */
export type Preset = "standard" | "eu_only" | "no_external"
export const PRESETS: Preset[] = ["standard", "eu_only", "no_external"]
export type Region = "eu" | "us" | "sg" | "self" | "other" | "unknown"

/** Pure: whether a provider in this region may receive the workspace's content. Unknown regions are never allowed under a restrictive preset. */
export function regionAllowed(preset: Preset, region: Region): boolean {
  if (preset === "standard") return true
  if (preset === "eu_only") return region === "eu" || region === "self"
  return region === "self"
}

export const REFUSAL: Record<Exclude<Preset, "standard">, string> = {
  eu_only: "Your workspace policy keeps content with providers in the EU, and no such AI provider is available for this request. Nothing was sent. Ask your administrator.",
  no_external: "Your workspace policy does not allow content to be sent to an external AI provider, and no self-hosted model is available. Nothing was sent. Ask your administrator.",
}

/** Maps the router's provider names to register slugs. */
const SLUG: Record<string, string> = { anthropic: "anthropic", gemini: "gemini", openai: "openai", mistral: "mistral", qwen: "qwen", ollama: "ollama" }
const FALLBACK_REGION: Record<string, Region> = { anthropic: "us", gemini: "us", openai: "us", mistral: "eu", qwen: "sg", ollama: "self" }

let regions: { at: number; map: Map<string, Region> } | null = null
let policies = new Map<string, { at: number; preset: Preset }>()
export const _resetPolicyCache = () => { regions = null; policies = new Map() }

async function regionOf(provider: string, now = Date.now()): Promise<Region> {
  try {
    if (!regions || now - regions.at > 60_000) {
      const rows = (await sql`SELECT slug, region FROM ai_subprocessors WHERE role IN ('ai_model', 'self_hosted')`) as any[]
      regions = { at: now, map: new Map(rows.map((r) => [String(r.slug), r.region as Region])) }
    }
    return regions.map.get(SLUG[provider] ?? provider) ?? FALLBACK_REGION[provider] ?? "unknown"
  } catch { return FALLBACK_REGION[provider] ?? "unknown" }
}

export async function presetFor(orgId: string | null | undefined, now = Date.now()): Promise<Preset> {
  if (!orgId) return "standard"
  const hit = policies.get(orgId)
  if (hit && now - hit.at < 30_000) return hit.preset
  try {
    const [r] = (await sql`SELECT preset FROM workspace_data_policy WHERE org_id = ${orgId}`) as any[]
    const preset = (PRESETS as string[]).includes(r?.preset) ? (r.preset as Preset) : "standard"
    policies.set(orgId, { at: now, preset }); return preset
  } catch { return "standard" }
}

export interface Filtered<P extends string> { chain: P[]; refusal: string | null }

/** Removes providers the current workspace's policy forbids. `refusal` is set only when the policy emptied a chain that had providers in it. */
export async function filterChainForPolicy<P extends string>(chain: P[], orgId?: string | null): Promise<Filtered<P>> {
  const org = orgId ?? currentAiContext()?.principal?.orgId ?? null
  const preset = await presetFor(org)
  if (preset === "standard" || !chain.length) return { chain, refusal: null }
  const keep: P[] = []
  for (const p of chain) if (p === ("none" as P) || regionAllowed(preset, await regionOf(p))) keep.push(p)
  const real = keep.filter((p) => p !== ("none" as P))
  return real.length ? { chain: keep, refusal: null } : { chain: [], refusal: REFUSAL[preset] }
}

export class DataPolicyError extends Error {
  readonly code = "data_policy"
  constructor(message: string) { super(message); this.name = "DataPolicyError" }
}

/** For code that calls one provider directly (embeddings, PDF vision, media generation). Throws DataPolicyError when the workspace's policy forbids it. */
export async function assertProviderAllowed(provider: string, orgId?: string | null): Promise<void> {
  const r = await filterChainForPolicy([provider], orgId)
  if (r.refusal) throw new DataPolicyError(r.refusal)
}
