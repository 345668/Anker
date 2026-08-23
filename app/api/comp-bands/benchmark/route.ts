/**
 * POST /api/comp-bands/benchmark — fetch market salary + equity ranges for a role from
 * the configured benchmark provider (lib/compensation/benchmark). Returns the ranges for
 * the UI to review and optionally save as a band; does not create anything itself.
 * Inert with a clear message until COMP_BENCHMARK_API_URL is set.
 *
 * Body: { role: string, level?: string, geography?: string }
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchBenchmark, isBenchmarkConfigured } from "@/lib/compensation/benchmark"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  if (!isBenchmarkConfigured()) {
    return NextResponse.json({ error: "No compensation benchmark provider is configured. Set COMP_BENCHMARK_API_URL to enable market data.", configured: false }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as { role?: string; level?: string; geography?: string }
  if (!String(body.role ?? "").trim()) return NextResponse.json({ error: "Provide a 'role'." }, { status: 400 })

  const result = await fetchBenchmark({ role: String(body.role), level: body.level, geography: body.geography })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 502 })
  return NextResponse.json({ ok: true, benchmark: result.data })
}
