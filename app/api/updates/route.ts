/**
 * GET  /api/updates  — list the user's investor updates + engagement rollups.
 * POST /api/updates  — AI-draft a new update. body: { period?, highlights?, metrics? }
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { draftUpdate } from "@/lib/updates/builder"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const rows = await sql`
    SELECT u.id, u.title, u.period, u.status, u.created_at, u.sent_at,
           count(r.id)::int AS recipients,
           count(r.id) FILTER (WHERE r.opened_at IS NOT NULL)::int AS opened
    FROM investor_updates u
    LEFT JOIN investor_update_recipients r ON r.update_id = u.id
    WHERE u.user_id = ${user.id}
    GROUP BY u.id
    ORDER BY u.created_at DESC LIMIT 100
  `
  return NextResponse.json({ updates: rows })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const drafted = await draftUpdate(user.id, {
    period: typeof body?.period === "string" ? body.period : undefined,
    highlights: typeof body?.highlights === "string" ? body.highlights : undefined,
    metrics: Array.isArray(body?.metrics) ? body.metrics : undefined,
  })
  const [row] = (await sql`
    INSERT INTO investor_updates (user_id, title, period, body, metrics, asks, status, generated_by, created_at, updated_at)
    VALUES (${user.id}, ${drafted.title}, ${body?.period ?? null}, ${drafted.body},
            ${JSON.stringify(drafted.metrics)}::jsonb, ${drafted.asks}, 'draft', ${drafted.generatedBy}, NOW(), NOW())
    RETURNING *
  `) as any[]
  return NextResponse.json({ update: row })
}
