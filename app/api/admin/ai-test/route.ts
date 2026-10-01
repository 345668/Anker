/**
 * POST /api/admin/ai-test
 *
 * Exercises the active AI provider (Gemini / Claude / Ollama) through the
 * SAME central generate() that every AI use case uses, with one probe per
 * use case (newsroom, LP matchmaking, find investors, AI agents, AI
 * assistant, deep research, URL checking, enrichment). Returns the active
 * provider/model + per-use-case pass/fail, latency and a sample — so the
 * Settings → API Keys "Test" button proves the key is wired everywhere.
 *
 * Admin-gated.
 */
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { generateDetailed, providerInfo, resetProvider } from "@/lib/ai/provider"
import type { TaskTag } from "@/lib/ai/model-router"

export const runtime = "nodejs"
export const maxDuration = 120

// Each probe now carries the task its real feature uses (doc 35, audit P2). Before,
// all eight passed no task, so the test could pass while a task was switched off or
// routed to a model that did not work — the "Test" button proved the key, not the
// feature. The task also selects the model the real feature would use.
const PROBES: { useCase: string; task: TaskTag; prompt: string }[] = [
  { useCase: "Newsroom (draft)",        task: "doc_summary",      prompt: "Write a punchy 6-word headline about emerging VC managers." },
  { useCase: "LP Matchmaking (enrich)", task: "ai_rationale",     prompt: "In 8 words: why a family office backs an emerging fund." },
  { useCase: "Find Investors",          task: "firm_lookup",      prompt: "Name one sector an applied-AI seed fund targets. One word." },
  { useCase: "AI Agents (outreach)",    task: "dm_personalize",   prompt: "Reply with exactly: agent-ok" },
  { useCase: "AI Assistant",            task: "assistant_chat",   prompt: "Reply with exactly: assistant-ok" },
  { useCase: "Deep Research",           task: "deep_research",    prompt: "Define an emerging fund manager in 10 words." },
  { useCase: "URL Checking",            task: "url_classify",     prompt: "Is acme.vc a plausible VC firm domain? Answer yes or no." },
  { useCase: "Enrichment",              task: "enrich_extract",   prompt: "Give a 5-word descriptor for a climate-tech VC fund." },
]

export async function POST() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    // Reset provider resolution cache, then re-read config from DB
    resetProvider()
    const info = await providerInfo()

    if (info.provider === "none") {
      return NextResponse.json({
        provider: "none", model: null, allOk: false,
        message: "No AI provider active. Set a Gemini or Claude API key (or enable local models in Data Ops).",
        results: [],
      })
    }

    const results = []
    for (const p of PROBES) {
      const t0 = Date.now()
      let ok = false, sample = "", error: string | null = null, answeredBy: string | null = null
      let model: string | null = null, failure: string | null = null
      try {
        // generateDetailed surfaces the real failure reason (HTTP status +
        // API message, safety block, finishReason) instead of a bare "".
        // retries:0 keeps the diagnostic snappy; failover still chains
        // Gemini → Claude → local so the probe reflects real resilience.
        const out = await generateDetailed(p.prompt, { maxTokens: 64, temperature: 0.3, retries: 0, task: p.task })
        ok = out.text.trim().length > 0
        sample = out.text.slice(0, 120)
        answeredBy = out.provider
        model = out.model
        failure = out.failure?.kind ?? null
        if (!ok) error = out.error ?? "empty response"
      } catch (e: any) {
        error = e?.message ?? "error"
      }
      results.push({ useCase: p.useCase, task: p.task, ok, ms: Date.now() - t0, sample, error, answeredBy, model, failure })
    }

    return NextResponse.json({
      provider: info.provider,
      model: info.model,
      allOk: results.every((r) => r.ok),
      passed: results.filter((r) => r.ok).length,
      total: results.length,
      results,
    })
  } catch (e: any) {
    console.error("[admin/ai-test]", e)
    return NextResponse.json({ error: e?.message ?? "Test failed" }, { status: 500 })
  }
}
