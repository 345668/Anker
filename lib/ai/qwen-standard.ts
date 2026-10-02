/**
 * The Qwen credential and host for calls that are NOT chat completions on the plan
 * (OCR, speech recognition, media). Token-plan keys serve only the plan's chat models,
 * so these use the standard (free / pay-as-you-go) lane (doc 35 lanes, doc 36).
 */
import { readRouterConfig } from "./runtime-config"
import { qwenLanes } from "./qwen-lanes"

export async function standardQwen(): Promise<{ apiKey: string; baseUrl: string } | null> {
  const cfg = await readRouterConfig().catch(() => null)
  const lane = qwenLanes({
    qwenApiKey: cfg?.qwenApiKey ?? null, qwenFreeApiKey: cfg?.qwenFreeApiKey ?? null, qwenPlanApiKey: cfg?.qwenPlanApiKey ?? null,
    qwenRegion: cfg?.qwenRegion ?? null, qwenWorkspaceId: cfg?.qwenWorkspaceId ?? null,
  }).find((l) => l.id !== "plan")
  return lane ? { apiKey: lane.apiKey, baseUrl: lane.baseUrl } : null
}
