/**
 * POST /api/admin/url-check
 *   Body either:
 *     { url: string }                                    — single URL
 *     { urls: string[], concurrency?: number }           — explicit list
 *     { source: "firms" | "investors", limit?: number }  — pull URLs from DB
 *
 * Returns: { results: UrlCheckResult[], summary: ...verdicts }
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  bulkCheck,
  checkUrl,
  summarizeVerdicts,
  type UrlCheckResult,
} from "@/lib/admin/url-check"

export const runtime = "nodejs"
export const maxDuration = 240

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json()
    if (typeof body?.url === "string" && body.url.trim()) {
      const r = await checkUrl(body.url, { timeoutMs: Number(body.timeoutMs) || 10_000 })
      return NextResponse.json({ results: [r], summary: summarizeVerdicts([r]) })
    }
    let urls: string[] = []
    let owners: { id: string; field: string }[] = []
    if (Array.isArray(body?.urls) && body.urls.length) {
      urls = body.urls.map((u: any) => String(u))
    } else if (body?.source === "firms") {
      const limit = Math.max(1, Math.min(500, Number(body.limit) || 50))
      const rows = await sql`
        SELECT id, website FROM investment_firms
        WHERE website IS NOT NULL AND website <> ''
        ORDER BY updated_at ASC NULLS FIRST LIMIT ${limit}
      `
      urls = rows.map((r: any) => r.website)
      owners = rows.map((r: any) => ({ id: r.id, field: "website" }))
    } else if (body?.source === "investors") {
      const limit = Math.max(1, Math.min(500, Number(body.limit) || 50))
      const rows = await sql`
        SELECT id, linkedin_url FROM investors
        WHERE linkedin_url IS NOT NULL AND linkedin_url <> ''
        ORDER BY updated_at ASC NULLS FIRST LIMIT ${limit}
      `
      urls = rows.map((r: any) => r.linkedin_url)
      owners = rows.map((r: any) => ({ id: r.id, field: "linkedin_url" }))
    } else {
      return NextResponse.json({ error: "Provide `url`, `urls`, or `source`." }, { status: 400 })
    }

    const results: UrlCheckResult[] = await bulkCheck(urls, {
      concurrency: Number(body.concurrency) || 8,
      timeoutMs: Number(body.timeoutMs) || 10_000,
    })
    const summary = summarizeVerdicts(results)
    const owned = owners.length === results.length
      ? results.map((r, i) => ({ ...r, owner: owners[i] }))
      : results
    return NextResponse.json({ results: owned, summary })
  } catch (e: any) {
    console.error("[admin/url-check] error:", e)
    return NextResponse.json({ error: e?.message ?? "url-check failed" }, { status: 500 })
  }
}
