/**
 * POST /api/outreach/crawl-profile
 * Body: { crmEntryId: string, url?: string }
 *
 * Webcrawls an investor's public page (their LinkedIn or firm site) and
 * produces a short AI research brief used to personalize outreach.  The
 * brief is cached on the crm_entries row (research_summary/url/at) so
 * re-opening the studio doesn't re-crawl.
 *
 * Graceful degradation: if the crawl is blocked or returns little text
 * (LinkedIn blocks bots aggressively), we still produce a brief from the
 * row's own fields and tell the caller the crawl was thin.
 *
 * User-gated (founders use this), draft/read-only — no sending.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { crawl } from "@/lib/admin/web-crawler"
import { generateDetailed } from "@/lib/ai/provider"

export const runtime = "nodejs"
export const maxDuration = 120

function firstUrl(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const s = (c ?? "").trim()
    if (/^https?:\/\//i.test(s)) return s
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const crmEntryId = String(body?.crmEntryId ?? "").trim()
    if (!crmEntryId) return NextResponse.json({ error: "crmEntryId required" }, { status: 400 })

    const [entry] = await sql`
      SELECT * FROM crm_entries WHERE id = ${crmEntryId} AND user_id = ${user.id}
    ` as any[]
    if (!entry) return NextResponse.json({ error: "CRM entry not found" }, { status: 404 })

    const target = firstUrl(body?.url, entry.display_linkedin, entry.research_url)
    let crawledText = ""
    let crawledUrl: string | null = null
    let crawlNote: string | null = null

    if (target) {
      try {
        const page = await crawl(target, { timeoutMs: 12_000 })
        crawledUrl = page.finalUrl || target
        if (page.ok && !page.mostlyEmpty) {
          crawledText = page.text.slice(0, 6000)
        } else {
          crawlNote = page.error
            ? `crawl error: ${page.error}`
            : "the page returned little usable text (often the case for LinkedIn / login-walled pages)"
        }
      } catch (e: any) {
        crawlNote = `crawl failed: ${e?.message ?? "unknown error"}`
      }
    } else {
      crawlNote = "no crawlable URL on this row — add a website/LinkedIn URL to research them"
    }

    // Build the brief.  AI when available, deterministic fallback otherwise.
    const facts = [
      entry.display_name && `Name: ${entry.display_name}`,
      entry.display_title && `Title: ${entry.display_title}`,
      entry.display_type && `Type: ${entry.display_type}`,
      entry.display_location && `Location: ${entry.display_location}`,
      entry.why_match && `Why matched: ${entry.why_match}`,
    ].filter(Boolean).join("\n")

    const prompt = `You are a fundraising research assistant. Write a tight 90-120 word brief on this investor for a founder about to reach out. Cover: who they are, what they invest in / their thesis, and ONE specific, non-generic hook the founder could open with. No preamble, no bullet symbols, plain prose.

KNOWN FACTS:
${facts || "(none)"}

${crawledText ? `CRAWLED PUBLIC PAGE TEXT (may be noisy):\n${crawledText}` : "(no page text available — base the brief on the known facts and be honest about what is unknown)"}`

    let summary = ""
    let provider = "none"
    const ai = await generateDetailed(prompt, { task: "investor_profile", maxTokens: 320, temperature: 0.5 })
    if (ai.text) {
      summary = ai.text.trim()
      provider = ai.provider
    } else {
      // Deterministic fallback brief.
      const bits = [
        entry.display_name,
        entry.display_title ? `(${entry.display_title})` : null,
        entry.display_type ? `— ${entry.display_type}` : null,
        entry.display_location ? `based in ${entry.display_location}` : null,
      ].filter(Boolean).join(" ")
      summary = `${bits}. ${entry.why_match ? `Matched because: ${entry.why_match}. ` : ""}${crawlNote ? `Note: ${crawlNote}.` : ""}`.trim()
      provider = "heuristic"
    }

    // Cache on the row.
    await sql`
      UPDATE crm_entries SET
        research_summary = ${summary},
        research_url     = ${crawledUrl ?? target ?? entry.research_url ?? null},
        research_at      = NOW(),
        updated_at       = NOW()
      WHERE id = ${crmEntryId} AND user_id = ${user.id}
    `

    return NextResponse.json({
      summary,
      provider,
      url: crawledUrl ?? target,
      crawled: !!crawledText,
      wordCount: crawledText ? crawledText.split(/\s+/).length : 0,
      note: crawlNote,
      aiError: ai.text ? null : ai.error,
    })
  } catch (e: any) {
    console.error("[outreach/crawl-profile] error:", e)
    return NextResponse.json({ error: e?.message ?? "crawl-profile failed" }, { status: 500 })
  }
}
