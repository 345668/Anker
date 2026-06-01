/**
 * POST /api/admin/crawl
 * Body: { url: string, multi?: boolean, maxPages?: number }
 *
 * Single-page (multi=false, default) returns the cleaned page.
 * Multi-page returns a CrawlSiteResult bundle.
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { crawl, crawlSite } from "@/lib/admin/web-crawler"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json()
    const url = String(body?.url ?? "").trim()
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })
    if (body?.multi) {
      const result = await crawlSite(url, {
        maxPages: Number(body.maxPages) || 5,
        concurrency: Number(body.concurrency) || 3,
        timeoutMs: Number(body.timeoutMs) || 12_000,
      })
      return NextResponse.json(result)
    }
    const page = await crawl(url, { timeoutMs: Number(body.timeoutMs) || 12_000 })
    return NextResponse.json(page)
  } catch (e: any) {
    console.error("[admin/crawl] error:", e)
    return NextResponse.json({ error: e?.message ?? "crawl failed" }, { status: 500 })
  }
}
