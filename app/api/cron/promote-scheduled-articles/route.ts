/**
 * GET /api/cron/promote-scheduled-articles
 *
 * Promotes any news_articles row where:
 *   - status        = 'draft'
 *   - scheduled_for IS NOT NULL
 *   - scheduled_for <= now()
 *
 * Promotion sets:
 *   - status        = 'published'
 *   - published_at  = scheduled_for     (honors the editor's intended timestamp)
 *
 * scheduled_for is left in place so the audit log still shows when the
 * promotion was originally planned.
 *
 * Auth
 * ────
 * On Vercel Cron, the platform invokes this URL with the Authorization header
 * "Bearer $CRON_SECRET" (from the project's env). We accept that, plus an
 * explicit ?secret= query param for manual / local triggering.
 *
 * Same endpoint can be hit by external schedulers (GitHub Actions, etc.)
 * by passing ?secret=$CRON_SECRET, which is also handy for testing.
 *
 * Scheduling
 * ──────────
 * Registered in vercel.json with an hourly cron:
 *   { "crons": [{ "path": "/api/cron/promote-scheduled-articles", "schedule": "0 * * * *" }] }
 * Hourly is the right granularity — sub-hour precision isn't necessary for a
 * newsroom and avoids burning function invocations.
 *
 * Idempotency
 * ───────────
 * The UPDATE includes `status = 'draft'` in WHERE so a duplicate trigger
 * inside the same minute is a no-op. No locks needed.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // No secret configured → reject. Better to fail loudly than to leave the
  // endpoint open. Operators should set CRON_SECRET before enabling the cron.
  if (!secret) return false

  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization") || ""
  if (auth === `Bearer ${secret}`) return true

  // Manual / external scheduler trigger.
  const url = new URL(req.url)
  if (url.searchParams.get("secret") === secret) return true

  return false
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Promote everything ready.  RETURNING gives us a useful audit row
    // for the cron's log without a second roundtrip.
    const rows = await sql`
      UPDATE news_articles
         SET status        = 'published',
             published_at  = scheduled_for,
             updated_at    = NOW()
       WHERE status        = 'draft'
         AND scheduled_for IS NOT NULL
         AND scheduled_for <= NOW()
   RETURNING id, slug, headline, scheduled_for, published_at
    `

    const promoted = rows.map((r: any) => ({
      id: r.id,
      slug: r.slug,
      headline: r.headline,
      scheduledFor: toIso(r.scheduled_for),
      publishedAt: toIso(r.published_at),
    }))

    // Always log to the server console so the Vercel function dashboard
    // shows which articles went live.
    if (promoted.length > 0) {
      console.log(
        `[promote-scheduled-articles] promoted ${promoted.length}:`,
        promoted.map((p) => `${p.slug}@${p.publishedAt}`).join(", "),
      )
    }

    return NextResponse.json({
      ok: true,
      promoted: promoted.length,
      articles: promoted,
      ranAt: new Date().toISOString(),
    })
  } catch (e: any) {
    console.error("[promote-scheduled-articles]", e)
    return NextResponse.json(
      { error: e?.message ?? "Promotion failed" },
      { status: 500 },
    )
  }
}

function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
