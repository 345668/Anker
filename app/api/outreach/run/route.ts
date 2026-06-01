/**
 * POST /api/outreach/run
 *
 * Runs the Summit Venture Studio Fund II outreach pipeline.
 *
 * Request body (JSON):
 * {
 *   profiles?: InvestorProfile[]   // pass raw profiles directly
 *   xlsxPath?: string              // OR path to the Curated Profiles XLSX on disk
 *   limit?: number                 // cap number of profiles (default: all)
 *   outputDir?: string             // where to write xlsx + html (default: reports/)
 * }
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
import { runPipeline, parseExcelProfiles, SVS_SENDER_BRIEF } from "@/lib/outreach/outreachPipeline"
import type { InvestorProfile, PipelineConfig } from "@/lib/outreach/types"

export const maxDuration = 300 // 5 min — Next.js App Router timeout

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not set" },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const {
      profiles: rawProfiles,
      xlsxPath,
      limit,
      outputDir,
    } = body as {
      profiles?: InvestorProfile[]
      xlsxPath?: string
      limit?: number
      outputDir?: string
    }

    let profiles: InvestorProfile[]

    if (rawProfiles && Array.isArray(rawProfiles) && rawProfiles.length > 0) {
      profiles = rawProfiles
    } else if (xlsxPath) {
      const absPath = path.isAbsolute(xlsxPath)
        ? xlsxPath
        : path.join(process.cwd(), xlsxPath)
      profiles = parseExcelProfiles(absPath, limit)
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: 'Provide either "profiles" array or "xlsxPath" pointing to the Curated Profiles XLSX',
        },
        { status: 400 }
      )
    }

    if (limit && limit > 0) {
      profiles = profiles.slice(0, limit)
    }

    if (profiles.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No profiles found after parsing" },
        { status: 400 }
      )
    }

    const config: PipelineConfig = {
      batchSize: 10,
      batchDelayMs: 2000,
      outputDir: outputDir ?? path.join(process.cwd(), "reports"),
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
    description: "Summit Venture Studio Fund II outreach pipeline",
    fund: SVS_SENDER_BRIEF.fundName,
    sender: SVS_SENDER_BRIEF.senderName,
    accepts: { profiles: "InvestorProfile[]", xlsxPath: "string", limit: "number", outputDir: "string" },
  })
}
