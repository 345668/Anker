/**
 * GET /api/public/interest/[token]?a=yes|no|view  — PUBLIC (investor one-click).
 *
 * The token is minted per campaign_crm_entry (plaintext emailed once, SHA-256
 * stored). CRM-FIRST (locked decision): a click updates campaign_crm_entries —
 * the source of truth — writes a match_outcome_event, THEN notifies the founder.
 *
 *   a=view → record an open, stream the pitch deck (a view is an interest signal)
 *   a=yes  → interested     → alert the founder immediately
 *   a=no   → not interested → logged, founder sees it in their feed (no email)
 *
 * Choice is locked after the first yes/no so a re-click can't flip it or
 * re-notify. Unknown/expired tokens get a friendly page, never a stack trace.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { resolveInterestToken } from "@/lib/campaign/interest-tokens"
import { readBlobBytes } from "@/lib/campaign/util"
import { recordOutcomeEvent } from "@/lib/matching/outcome-events"
import { sendInterestAlert } from "@/lib/email/founder-lifecycle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b0f19;color:#e5e7eb;
    display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
  .card{max-width:460px;text-align:center;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:40px}
  h1{font-size:22px;margin:0 0 10px} p{color:#9ca3af;line-height:1.6;margin:0}
  .tick{font-size:44px;margin-bottom:8px}
</style></head><body><div class="card">${body}</div></body></html>`
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8" } })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const action = (new URL(req.url).searchParams.get("a") || "").toLowerCase()

  const resolved = await resolveInterestToken(token || "")
  if (!resolved) {
    return page("Link not found", `<div class="tick">🔗</div><h1>This link isn't valid</h1>
      <p>It may have been mistyped or superseded. If you meant to respond to an intro, just reply to the email.</p>`, 404)
  }
  if (resolved.expired) {
    return page("Link expired", `<div class="tick">⌛</div><h1>This link has expired</h1>
      <p>Please reply to the original email and we'll pick it up from there.</p>`, 410)
  }

  // Load the entry + its startup/submission context.
  const rows = await sql`
    SELECT e.id, e.stage, e.opened_at, e.investor_id, e.firm_id, e.investor_name, e.match_score,
           s.id AS submission_id, s.startup_name, s.founder_name, s.founder_email, s.deck_blob_key
    FROM campaign_crm_entries e
    JOIN founder_submissions s ON s.id = e.submission_id
    WHERE e.id = ${resolved.entryId}
    LIMIT 1
  `
  if (!rows.length) return page("Not found", `<h1>Not found</h1><p>We couldn't locate this outreach.</p>`, 404)
  const e = rows[0] as any

  // ─── a=view → record an open + stream the deck ─────────────────────────────
  if (action === "view") {
    if (!e.opened_at) {
      await sql`UPDATE campaign_crm_entries
        SET opened_at=NOW(), stage=CASE WHEN stage IN ('queued','contacted') THEN 'opened' ELSE stage END, updated_at=NOW()
        WHERE id=${e.id}`
    }
    if (!e.deck_blob_key) {
      return page("Deck unavailable", `<h1>Deck unavailable</h1><p>Please reply to the email and we'll send it directly.</p>`, 404)
    }
    const bytes = await readBlobBytes(e.deck_blob_key)
    if (!bytes) {
      return page("Deck unavailable", `<h1>Deck unavailable</h1><p>Please reply to the email and we'll send it directly.</p>`, 404)
    }
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${String(e.startup_name || "pitch").replace(/[^a-zA-Z0-9]/g, "_")}_deck.pdf"`,
        "cache-control": "private, no-store",
      },
    })
  }

  // ─── a=yes|no → record the choice (CRM-first), then notify founder ─────────
  if (action === "yes" || action === "no") {
    const choice = action as "yes" | "no"
    if (resolved.choiceLocked) {
      return page("Already recorded", `<div class="tick">✓</div><h1>Thanks — already recorded</h1>
        <p>We've noted your response to ${escapeHtml(e.startup_name)} and passed it along.</p>`)
    }

    const newStage = choice === "yes" ? "interested" : "not_interested"
    await sql`
      UPDATE campaign_crm_entries
      SET interest_choice=${choice}, interest_at=NOW(), responded_at=NOW(),
          stage=${newStage}, updated_at=NOW()
      WHERE id=${e.id}
    `
    await sql`UPDATE campaign_interest_tokens SET choice_locked=true, used_at=NOW() WHERE token_hash=${resolved.tokenHash}`

    await recordOutcomeEvent({
      eventType: "replied", source: "outreach", subjectId: e.id,
      firmId: e.firm_id, investorId: e.investor_id, matchScore: e.match_score,
      prevStage: e.stage, newStage,
      metadata: { choice, submissionId: e.submission_id, via: "interest_link" },
    })

    // Founder notification feed (always) + email alert (interested only).
    await sql`
      INSERT INTO founder_notifications (submission_id, type, payload_json)
      VALUES (${e.submission_id}, 'interest',
        ${JSON.stringify({ choice, investorName: e.investor_name, entryId: e.id })}::jsonb)
    `
    if (choice === "yes") {
      try {
        const firm = e.firm_id
          ? (await sql`SELECT name FROM investment_firms WHERE id=${e.firm_id} LIMIT 1`)[0]?.name ?? null
          : null
        await sendInterestAlert({
          to: e.founder_email, founderName: e.founder_name, startupName: e.startup_name,
          investorName: e.investor_name || "An investor", investorFirm: firm,
        })
        await sql`UPDATE campaign_crm_entries SET founder_notified_at=NOW(), updated_at=NOW() WHERE id=${e.id}`
      } catch (err: any) {
        console.error("[interest] founder alert failed:", err?.message ?? err)
      }
    }

    return choice === "yes"
      ? page("Thank you", `<div class="tick">🎉</div><h1>Great — we'll make the intro</h1>
          <p>Thanks for your interest in ${escapeHtml(e.startup_name)}. We've alerted the founder and will coordinate next steps.</p>`)
      : page("Noted", `<div class="tick">✓</div><h1>Thanks for letting us know</h1>
          <p>We've recorded that ${escapeHtml(e.startup_name)} isn't a fit right now. We appreciate you taking a look.</p>`)
  }

  // No / unknown action → a minimal chooser.
  return page("Respond", `<h1>${escapeHtml(e.startup_name)}</h1>
    <p>Reply to the outreach email, or use the Interested / Not-interested links it contains.</p>`)
}

function escapeHtml(v: string): string {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
