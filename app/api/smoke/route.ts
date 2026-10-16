/**
 * Post-deploy smoke test, server side (docs/architecture/59 R6). Header `x-smoke-token` must equal SMOKE_TOKEN.
 *   GET  -> { ok, checks: [{ name, ok, ms, error? }] }  read-only checks that the app can reach what it needs
 *   POST { sha, baseUrl, ok, skipped, failures } -> records the run; the alert engine turns a failed run into an incident
 */
import { NextRequest, NextResponse } from "next/server"
import { deepChecks, parseReport, storeReport, tokenOk } from "@/lib/ops/smoke"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30
const headers = { "Cache-Control": "no-store" }

function guard(req: NextRequest): NextResponse | null {
  const t = tokenOk(req.headers.get("x-smoke-token"))
  if (t === "unset") return NextResponse.json({ error: "The smoke test is not set up: SMOKE_TOKEN is missing." }, { status: 503, headers })
  if (!t) return NextResponse.json({ error: "Not allowed." }, { status: 401, headers })
  return null
}

export async function GET(req: NextRequest) {
  const denied = guard(req); if (denied) return denied
  const checks = await deepChecks()
  return NextResponse.json({ ok: checks.every((c) => c.ok), checks }, { headers })
}

export async function POST(req: NextRequest) {
  const denied = guard(req); if (denied) return denied
  const r = parseReport(await req.json().catch(() => null))
  if (!r) return NextResponse.json({ error: "Unreadable report." }, { status: 400, headers })
  await storeReport(r)
  return NextResponse.json({ ok: true }, { headers })
}
