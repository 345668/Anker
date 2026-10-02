/**
 * GET /api/diagnostics
 *
 * What the runtime ACTUALLY sees — env presence, runtime config, provider chain —
 * so a failure on Vercel can be diagnosed without reading logs.
 *
 * Doc 35 #9. This used to be public AND to make a billable model call on every
 * request, which meant anyone could spend the shared provider quota and read
 * configuration metadata (key suffixes, database host, stack traces). Now:
 *
 *   • Anonymous and non-admin callers get a bare liveness answer. No provider is
 *     called, nothing about configuration is revealed. Safe for an uptime monitor.
 *   • Admins (or the portal service bearer, via requireAdmin) get the detail, with
 *     the inference probe OFF unless asked for: `?probe=1` runs one bounded
 *     completion. Detail is never needed to answer "is it up?".
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth/require-admin"
import { readRouterConfig } from "@/lib/ai/runtime-config"
import { providerInfo, providerChain } from "@/lib/ai/provider"
import { resolveQwenEndpoint } from "@/lib/ai/qwen-endpoint"
import { qwenLaneStatus } from "@/lib/ai/qwen-lanes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const mask = (v?: string | null) =>
  !v ? null : v.length > 8 ? `••••${v.slice(-4)} (${v.length} chars)` : `[${v.length} chars]`

const has = (k: string) => !!process.env[k]
const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) {
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() }, { status: 200, headers: NO_STORE })
  }

  const checks: any = {
    timestamp: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      vercel: !!process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelRegion: process.env.VERCEL_REGION ?? null,
    },
    env_present: {
      NEXT_PUBLIC_SUPABASE_URL: has("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: has("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      DATABASE_URL: has("DATABASE_URL"),
      NEON_DATABASE_URL: has("NEON_DATABASE_URL"),
      CONFIG_ENC_KEY: has("CONFIG_ENC_KEY"),
      // AI providers (env-side fallbacks; primary is system_settings)
      DASHSCOPE_API_KEY: has("DASHSCOPE_API_KEY"),
      QWEN_API_KEY: has("QWEN_API_KEY"),
      QWEN_WORKSPACE_ID: has("QWEN_WORKSPACE_ID"),
      QWEN_REGION: has("QWEN_REGION"),
      QWEN_BASE_URL: has("QWEN_BASE_URL"),
      ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"),
      OPENAI_API_KEY: has("OPENAI_API_KEY"),
      GEMINI_API_KEY: has("GEMINI_API_KEY"),
      GOOGLE_API_KEY: has("GOOGLE_API_KEY"),
      MISTRAL_API_KEY: has("MISTRAL_API_KEY"),
      RESEND_API_KEY: has("RESEND_API_KEY"),
      FOLK_API_KEY: has("FOLK_API_KEY"),
    },
    db: { reachable: false, error: null as string | null },
    runtimeConfig: { reachable: false, providerOverride: null as string | null, keys: {} as Record<string, any> },
    provider: { active: "unknown" as string, chain: [] as string[], info: null as any },
  }

  // 1. Reach the DB
  try {
    const r = await sql`SELECT 1::int AS ok` as any[]
    const v = r[0]?.ok
    checks.db.reachable = v === 1 || v === "1" || Number(v) === 1
  } catch (e: any) {
    checks.db.error = String(e?.message ?? e).slice(0, 240)
  }

  // 2. Runtime AI config from system_settings
  let cfg: Awaited<ReturnType<typeof readRouterConfig>> | null = null
  try {
    cfg = await readRouterConfig()
    checks.runtimeConfig.reachable = true
    checks.runtimeConfig.providerOverride = cfg.providerOverride
    checks.runtimeConfig.providerStrict = cfg.providerStrict
    checks.runtimeConfig.localEnabled = cfg.localEnabled
    checks.runtimeConfig.keys = {
      qwen: mask(cfg.qwenApiKey),
      anthropic: mask(cfg.anthropicApiKey),
      openai: mask(cfg.openaiApiKey),
      mistral: mask(cfg.mistralApiKey),
      gemini: mask(cfg.geminiApiKey),
    }
    checks.runtimeConfig.qwenWorkspaceId = cfg.qwenWorkspaceId ?? null
    checks.runtimeConfig.qwenRegion = cfg.qwenRegion ?? null
    checks.runtimeConfig.qwenModel = cfg.qwenModel ?? null
  } catch (e: any) {
    checks.runtimeConfig.error = String(e?.message ?? e).slice(0, 240)
  }

  // 3. The provider chain generate() will actually use, and where Qwen points.
  try {
    const info = await providerInfo()
    checks.provider.active = info.provider
    checks.provider.chain = providerChain(cfg)
    checks.provider.info = info
    const ep = resolveQwenEndpoint({ region: cfg?.qwenRegion ?? null, workspaceId: cfg?.qwenWorkspaceId ?? null })
    checks.provider.qwenEndpoint = { source: ep.source, region: ep.region }
    // Lanes and which models are currently being skipped as exhausted. No keys.
    checks.provider.qwenLanes = qwenLaneStatus({ qwenApiKey: cfg?.qwenApiKey ?? null, qwenFreeApiKey: cfg?.qwenFreeApiKey ?? null, qwenPlanApiKey: cfg?.qwenPlanApiKey ?? null, qwenRegion: cfg?.qwenRegion ?? null, qwenWorkspaceId: cfg?.qwenWorkspaceId ?? null })
  } catch (e: any) {
    checks.provider.error = String(e?.message ?? e).slice(0, 240)
  }

  // 4. One bounded completion, ONLY when asked for. It spends provider quota, so it
  //    is an explicit action by an admin and never a side effect of looking.
  if (new URL(req.url).searchParams.get("probe") === "1") {
    try {
      const { generateDetailed } = await import("@/lib/ai/provider")
      const start = Date.now()
      const result = await generateDetailed("Reply only with the word PONG.", {
        maxTokens: 8, temperature: 0, retries: 0, noFailover: false,
      })
      checks.probe = {
        provider: result.provider,
        model: result.model,
        finishReason: result.finishReason ?? null,
        status: result.status ?? null,
        failure: result.failure?.kind ?? null,
        ms: Date.now() - start,
        text: result.text?.slice(0, 60) ?? "",
        error: result.error,
      }
    } catch (e: any) {
      checks.probe = { error: String(e?.message ?? e).slice(0, 400) }
    }
  } else {
    checks.probe = { skipped: true, hint: "Add ?probe=1 to run one bounded completion (spends provider quota)." }
  }

  return NextResponse.json(checks, { status: 200, headers: NO_STORE })
}
