/**
 * POST /api/outreach/run
 *
 * Runs the Summit Venture Studio Fund II outreach pipeline.
 *
 * Auth: signed-in users only (paid AI + real outreach).
 *
 * Request body (JSON):
 * {
 *   profiles: InvestorProfile[]    // raw profiles, passed inline (required)
 *   limit?: number                 // cap number of profiles (default: all)
 * }
 * Output is always written under reports/ (a fixed server path). Earlier
 * `xlsxPath` / `outputDir` inputs were removed — a caller must not be able to
 * steer server-side file reads or writes.
 *
 * Response:
 * {
 *   ok: true
 *   stats: PipelineStats
 *   xlsxPath: string
 *   htmlPath: string
 *   generatedAt: string
 * }
 *
 * Errors return { ok: false, error: string }
 *
 * NOTE: This route runs synchronously (no streaming) — for large batches
 * (>30 profiles) consider adding a background job pattern via a queue.
 * The route has a 5-minute timeout set via config.
 */

import { NextRequest, NextResponse } from "next/server"
import path from "node:path"
import { z } from "zod"
import { runPipeline, SVS_SENDER_BRIEF } from "@/lib/outreach/outreachPipeline"
import type { InvestorProfile, PipelineConfig } from "@/lib/outreach/types"
import { requireUser } from "@/lib/auth/require-user"
import { SENDER_PROFILE } from "@/lib/outreach/sender-profile"
import { parseJsonBody } from "@/lib/http/validate"

export const maxDuration = 300 // 5 min — Next.js App Router timeout

// Output is always written under the repo's reports/ dir. This is a fixed
// server constant, NOT a caller-supplied path — an attacker must never be
// able to steer where the pipeline reads from or writes to.
const OUTPUT_DIR = path.join(process.cwd(), "reports")

// Profiles are passed inline; internals stay loose (InvestorProfile is wide),
// we only enforce a non-empty array + optional positive limit at the boundary.
const RunBody = z.object({
  profiles: z.array(z.record(z.string(), z.any())).min(1, "Provide a non-empty profiles array."),
  limit: z.number().int().positive().optional(),
})

export async function POST(req: NextRequest) {
  try {
    // Auth: triggers real outreach + paid AI. Signed-in users only.
    const auth = await requireUser()
    if (auth instanceof NextResponse) return auth

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not set" },
        { status: 500 }
      )
    }

    const body = await parseJsonBody(req, RunBody)
    if (body instanceof NextResponse) return body

    let profiles = body.profiles as unknown as InvestorProfile[]
    if (body.limit) {
      profiles = profiles.slice(0, body.limit)
    }

    const config: PipelineConfig = {
      batchSize: 10,
      batchDelayMs: 2000,
      outputDir: OUTPUT_DIR,
    }

    const result = await runPipeline(profiles, config)

    // Derive output paths from the timestamps embedded in filenames
    const ts = result.generatedAt.slice(0, 19).replace(/:/g, "-").replace("T", "_")
    const dir = config.outputDir!
    const xlsxOut = path.join(dir, `svs-campaign-${ts}.xlsx`)
    const htmlOut = path.join(dir, `svs-campaign-${ts}.html`)

    return NextResponse.json({
      ok: true,
      stats: result.stats,
      generatedAt: result.generatedAt,
      xlsxPath: xlsxOut,
      htmlPath: htmlOut,
      senderName: SVS_SENDER_BRIEF.senderName,
      fundName: SVS_SENDER_BRIEF.fundName,
    })
  } catch (err) {
    console.error("[POST /api/outreach/run]", err)
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}

// Quick health-check
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "POST /api/outreach/run",
    description: `${SENDER_PROFILE.fundName} outreach pipeline`,
    fund: SVS_SENDER_BRIEF.fundName,
    sender: SVS_SENDER_BRIEF.senderName,
    accepts: { profiles: "InvestorProfile[]", limit: "number" },
  })
}
