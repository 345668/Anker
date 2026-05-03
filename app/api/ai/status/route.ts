/**
 * AI provider status — used by the matchmaking UI to render the
 * "Ollama · gemma2:2b" / "Claude Haiku 4.5" / "rule-based only" badge.
 */
import { NextResponse } from "next/server"
import { providerInfo } from "@/lib/ai/provider"

export const runtime = "nodejs"

export async function GET() {
  const info = await providerInfo()
  return NextResponse.json(info)
}
