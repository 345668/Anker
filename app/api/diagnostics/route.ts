/**
 * GET /api/diagnostics
 *
 * Surfaces what the runtime ACTUALLY sees — env vars, runtime config
 * keys, provider chain — so a 500 on Vercel can be diagnosed without
 * needing to read logs.  Never returns raw secrets, only presence +
 * last-4 hints + lengths.
 *
 * Public (no auth) — only returns presence flags, not values.
 */
import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { readRouterConfig } from "@/lib/ai/runtime-config"
import { providerInfo, providerChain } from "@/lib/ai/provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const mask = (v?: string | null) =>
  !v ? null : v.length > 8 ? `••••${v.slice(-4)} (${v.length} chars)` : `[${v.length} chars]`

const has = (k: string) => !!process.env[k]

export async function GET() {
  const checks: any = {
    timestamp: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      vercel: !!process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelRegion: process.env.VERCEL_REGION ?? null,
    },
    env_present: {
      // Supabase (middleware + server.ts need these or createClient() throws)
      NEXT_PUBLIC_SUPABASE_URL: has("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: has("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      // Database
      DATABASE_URL: has("DATABASE_URL"),
      NEON_DATABASE_URL: has("NEON_DATABASE_URL"),
      // AI providers (env-side fallbacks; primary is system_settings)
      ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"),
      OPENAI_API_KEY: has("OPENAI_API_KEY"),
      GEMINI_API_KEY: has("GEMINI_API_KEY"),
      GOOGLE_API_KEY: has("GOOGLE_API_KEY"),
      MISTRAL_API_KEY: has("MISTRAL_API_KEY"),
      DASHSCOPE_API_KEY: has("DASHSCOPE_API_KEY"),
      QWEN_API_KEY: has("QWEN_API_KEY"),
      QWEN_WORKSPACE_ID: has("QWEN_WORKSPACE_ID"),
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
    checks.db.host = (process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "").replace(/^[^@]+@/, "").replace(/[/?].*/, "") || null
  } catch (e: any) {
    checks.db.error = String(e?.message ?? e).slice(0, 240)
  }

  // 2. Load runtime AI config from system_settings
  try {
    const cfg = await readRouterConfig()
    checks.runtimeConfig.reachable = true
    checks.runtimeConfig.providerOverride = cfg.providerOverride
    checks.runtimeConfig.localEnabled = cfg.localEnabled
    checks.runtimeConfig.keys = {
      anthropic: mask(cfg.anthropicApiKey),
      openai: mask(cfg.openaiApiKey),
      gemini: mask(cfg.geminiApiKey),
      mistral: mask(cfg.mistralApiKey),
      qwen: mask(cfg.qwenApiKey),
    }
    checks.runtimeConfig.qwenWorkspaceId = cfg.qwenWorkspaceId ?? null
    checks.runtimeConfig.qwenModel = cfg.qwenModel ?? null
  } catch (e: any) {
    checks.runtimeConfig.error = String(e?.message ?? e).slice(0, 240)
  }

  // 3. Resolve provider chain (this is what generate() will actually use)
  try {
    const info = await providerInfo()
    checks.provider.active = info.provider
    checks.provider.info = info
  } catch (e: any) {
    checks.provider.error = String(e?.message ?? e).slice(0, 240)
  }

  // 4. Probe the configured provider — one quick call
  try {
    const { generateDetailed } = await import("@/lib/ai/provider")
    const start = Date.now()
    const result = await generateDetailed("Reply only with the word PONG.", {
      maxTokens: 8,
      temperature: 0,
      retries: 0,
      noFailover: false,
    })
    checks.probe = {
      provider: result.provider,
      model: result.model,
      finishReason: result.finishReason ?? null,
      status: result.status ?? null,
      ms: Date.now() - start,
      text: result.text?.slice(0, 60) ?? "",
      error: result.error,
    }
  } catch (e: any) {
    checks.probe = { error: String(e?.message ?? e).slice(0, 400), stack: String(e?.stack ?? "").slice(0, 600) }
  }

  return NextResponse.json(checks, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  })
}
