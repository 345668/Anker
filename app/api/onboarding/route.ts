import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { saveOnboarding } from "@/lib/org/provision"
import { sql } from "@/lib/db"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to resume setup" }, { status: 401 })
  const persona = new URL(req.url).searchParams.get("persona")
  if (persona !== "founder" && persona !== "vc") return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  try {
    const [draft] = await sql`SELECT data, step, revision, completed FROM onboarding_drafts WHERE user_id = ${user.id} AND persona = ${persona}`
    return NextResponse.json({ ok: true, draft: draft ?? null })
  } catch { return NextResponse.json({ error: "Could not restore setup. Please retry." }, { status: 503 }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to save setup" }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body || !["founder", "vc"].includes(body.account_type) || !Number.isInteger(body.step) || body.step < 0 || body.step > 4 || !Number.isInteger(body.revision) || body.revision < 0 || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return NextResponse.json({ error: "Invalid setup draft" }, { status: 400 })
  }
  if (body.completed && (!String(body.data.name ?? "").trim() || !String(body.data[body.account_type === "vc" ? "firm" : "company"] ?? "").trim())) {
    return NextResponse.json({ error: "Add your name and workspace name before finishing." }, { status: 400 })
  }
  try {
    const rows = await sql`
      INSERT INTO onboarding_drafts (user_id, persona, data, step, revision)
      SELECT ${user.id}, ${body.account_type}, ${JSON.stringify(body.data)}::jsonb, ${body.step}, 1 WHERE ${body.revision === 0}
      ON CONFLICT (user_id, persona) DO NOTHING RETURNING revision
    `
    const updated = rows.length ? rows : await sql`
      UPDATE onboarding_drafts SET data = ${JSON.stringify(body.data)}::jsonb, step = ${body.step}, revision = revision + 1, updated_at = now()
      WHERE user_id = ${user.id} AND persona = ${body.account_type} AND revision = ${body.revision} AND completed = false RETURNING revision
    `
    if (!updated.length) return NextResponse.json({ error: "This draft changed in another tab. Reload to resume the latest saved setup." }, { status: 409 })
    const revision = Number(updated[0].revision)
    try {
      await saveOnboarding({ userId: user.id, email: user.email ?? null, persona: body.account_type, data: body.data, completed: body.completed === true })
      if (body.completed) await sql`UPDATE onboarding_drafts SET completed = true WHERE user_id = ${user.id} AND persona = ${body.account_type} AND revision = ${revision}`
      return NextResponse.json({ ok: true, persisted: true, revision, completed: body.completed === true })
    } catch {
      return NextResponse.json({ ok: false, revision, error: "Your draft is saved, but workspace setup could not finish. Retry this step." }, { status: 503 })
    }
  } catch { return NextResponse.json({ ok: false, error: "Could not save setup. Your entries are still here; please retry." }, { status: 503 }) }
}
