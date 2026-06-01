/**
 * POST /api/outreach/generate
 *
 * Layer 2 + Layer 3 of the 8fundraising loop:
 *   1. Look up one or more crm_entries rows
 *   2. For each, generate the 4-step DM sequence via dm-personalizer
 *   3. Upsert into outreach_messages (kind = connection_request /
 *      follow_up / different_angle / close_loop)
 *   4. Schedule sends per the rate-limit policy (25 connect / 50
 *      follow-up per day, weekday-only)
 *
 * Status starts as 'draft'.  The user must explicitly approve each row
 * before it can transition to 'queued' (human approval gate per the
 * playbook's hard rule: "Never auto-send. Drafts only.")
 *
 * Body:
 *   {
 *     crmEntryIds: string[],         // 1..N entry ids
 *     founder: {                     // founder context, used in every DM
 *       companyName: string,
 *       oneLiner: string,
 *       facts: string[],
 *       calendarUrl?: string,
 *       currency?: "USD" | "EUR" | "GBP"
 *     },
 *     // Optional per-partner posts.  If absent, day-0 falls back to
 *     // a generic firm/sector hook.
 *     partnerPosts?: Record<string, { text: string; timestamp?: string; url?: string }[]>
 *   }
 *
 * Response:
 *   { generated: [{ crmEntryId, messages: [...], scheduled: [iso, ...] }],
 *     errors: [...] }
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { generateOutreachSequence, type FounderContext, type PartnerContext } from "@/lib/ai/dm-personalizer"
import { resolveProvider } from "@/lib/ai/provider"
import {
  DEFAULT_RATE_LIMIT,
  nextSlotsForKind,
  type MessageKind,
} from "@/lib/outreach/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 300

interface Body {
  crmEntryIds: string[]
  founder: FounderContext
  partnerPosts?: Record<string, { text: string; timestamp?: string; url?: string }[]>
}

const KINDS: { kind: MessageKind; step: number; field: "day0" | "day3" | "day7" | "day14" }[] = [
  { kind: "connection_request", step: 0,  field: "day0"  },
  { kind: "follow_up",          step: 3,  field: "day3"  },
  { kind: "different_angle",    step: 7,  field: "day7"  },
  { kind: "close_loop",         step: 14, field: "day14" },
]

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = (await req.json()) as Body
    if (!body?.crmEntryIds?.length) {
      return NextResponse.json({ error: "crmEntryIds[] is required" }, { status: 400 })
    }
    if (!body.founder?.companyName || !body.founder.oneLiner) {
      return NextResponse.json({ error: "founder.companyName + founder.oneLiner required" }, { status: 400 })
    }

    const provider = await resolveProvider()
    const generatedBy = provider === "anthropic" ? "anthropic:claude-sonnet-4-6"
      : provider === "ollama" ? `ollama:${process.env.OLLAMA_MODEL ?? "default"}`
      : "heuristic"

    // Pull all entries in one query
    const entries = await sql`
      SELECT * FROM crm_entries
      WHERE user_id = ${user.id} AND id = ANY(${body.crmEntryIds}::text[])
    `
    if (!entries.length) {
      return NextResponse.json({ error: "No matching CRM entries" }, { status: 404 })
    }

    // Pull the user's already-sent counts for today, partitioned by kind,
    // so the rate-limiter doesn't propose impossible slots.
    const today = new Date().toISOString().slice(0, 10)
    const sentToday = await sql`
      SELECT kind, COUNT(*) AS n
      FROM outreach_messages
      WHERE user_id = ${user.id}
        AND status IN ('queued','sent','delivered')
        AND scheduled_for IS NOT NULL
        AND scheduled_for >= ${today}::date
        AND scheduled_for <  (${today}::date + INTERVAL '1 day')
      GROUP BY kind
    `
    const sentMap: Record<string, Record<string, number>> = {}
    for (const r of sentToday as any[]) {
      const k = String((r as any).kind) as MessageKind
      sentMap[k] = sentMap[k] ?? {}
      sentMap[k][today] = Number((r as any).n) || 0
    }
    for (const k of KINDS) sentMap[k.kind] = sentMap[k.kind] ?? {}

    const generated: any[] = []
    const errors: any[] = []

    for (const e of entries as any[]) {
      try {
        // Build PartnerContext.  If the caller supplied posts for this
        // entry, use them; otherwise day-0 falls back to firm/sector hook.
        const posts = body.partnerPosts?.[e.id] ?? []
        const partner: PartnerContext = {
          firstName: firstWord(e.display_name),
          fullName: e.display_name,
          title: e.display_title ?? undefined,
          firm: extractFirmName(e),
          primaryPost: posts[0],
          recentPosts: posts,
        }

        const seq = await generateOutreachSequence(body.founder, partner)

        // Schedule sends — only the day-0 connection request gets a
        // *real* slot now.  Follow-ups get scheduled relative to
        // expected accept date; the worker re-evaluates them when an
        // accept lands.
        const day0Slot = nextSlotsForKind(new Date(), 1, "connection_request", sentMap.connection_request)[0]
        if (day0Slot) {
          sentMap.connection_request[today] = (sentMap.connection_request[today] ?? 0) + 1
        }

        const messages: any[] = []
        for (const k of KINDS) {
          const body = (seq as any)[k.field] as string
          if (!body) continue
          const scheduled = k.kind === "connection_request" ? day0Slot : null
          // UPSERT keyed on (crm_entry_id, kind) so re-running the
          // generator updates the body in place.
          const [row] = await sql`
            INSERT INTO outreach_messages (
              user_id, crm_entry_id, kind, step_number, channel,
              body, hook_post_text, hook_post_url,
              status, scheduled_for, generated_by, model_notes,
              created_at, updated_at
            ) VALUES (
              ${user.id}, ${e.id}, ${k.kind}, ${k.step}, 'linkedin',
              ${body},
              ${k.kind === "connection_request" ? (seq.day0HookSource?.text ?? null) : null},
              ${k.kind === "connection_request" ? (seq.day0HookSource?.url ?? null) : null},
              'draft', ${scheduled ? scheduled.toISOString() : null},
              ${generatedBy}, ${seq.notes ?? null},
              NOW(), NOW()
            )
            ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
              body            = EXCLUDED.body,
              hook_post_text  = COALESCE(EXCLUDED.hook_post_text, outreach_messages.hook_post_text),
              hook_post_url   = COALESCE(EXCLUDED.hook_post_url,  outreach_messages.hook_post_url),
              status          = CASE WHEN outreach_messages.status IN ('sent','delivered','replied','accepted')
                                     THEN outreach_messages.status
                                     ELSE 'draft'
                                END,
              generated_by    = EXCLUDED.generated_by,
              model_notes     = EXCLUDED.model_notes,
              updated_at      = NOW()
            RETURNING id, kind, step_number, body, char_count, status, scheduled_for
          `
          messages.push(row)
        }

        generated.push({
          crmEntryId: e.id,
          partnerName: e.display_name,
          messages,
          day0Scheduled: day0Slot?.toISOString() ?? null,
          notes: seq.notes,
        })
      } catch (err: any) {
        errors.push({ crmEntryId: e.id, error: err?.message ?? "generation failed" })
      }
    }

    return NextResponse.json({
      generated,
      errors,
      provider,
      rateLimit: {
        connectionsPerDay: DEFAULT_RATE_LIMIT.connectionsPerDay,
        followUpsPerDay: DEFAULT_RATE_LIMIT.followUpsPerDay,
        weekdayOnly: DEFAULT_RATE_LIMIT.weekdayOnly,
      },
    })
  } catch (e: any) {
    console.error("[outreach/generate] error:", e)
    return NextResponse.json({ error: e?.message ?? "Generate failed" }, { status: 500 })
  }
}

function firstWord(s: string): string {
  if (!s) return ""
  return s.split(/\s+/)[0] ?? ""
}

/** Best-effort firm extraction from a crm_entries row.  We don't have
 *  a denormalized firm name, so we fall back to display_type or "their fund". */
function extractFirmName(e: any): string {
  if (e.display_type && /^[A-Z]/.test(e.display_type)) return e.display_type
  return "their fund"
}
