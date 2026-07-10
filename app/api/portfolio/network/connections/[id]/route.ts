/**
 * PATCH  /api/portfolio/network/connections/[id] — edit a captured LinkedIn
 *          profile (name, headline/occupation, company, title, location,
 *          summary, notes). Extension captures seed these rows; the platform
 *          owns corrections from here on. Edited fields WIN over future
 *          captures for the text fields the upserts coalesce.
 * DELETE — remove a captured profile from your network graph.
 *
 * Admin-gated; rows are owner-scoped to the signed-in admin.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

const EDITABLE = ["full_name", "headline", "company", "title", "location", "summary", "notes"] as const
type Editable = (typeof EDITABLE)[number]

const CAPS: Record<Editable, number> = {
  full_name: 200, headline: 300, company: 200, title: 200,
  location: 200, summary: 4000, notes: 4000,
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const updates: Partial<Record<Editable, string | null>> = {}
  for (const key of EDITABLE) {
    if (!(key in body)) continue
    const raw = body[key]
    if (raw === null || raw === "") { updates[key] = null; continue }
    if (typeof raw !== "string") {
      return NextResponse.json({ error: `${key} must be a string` }, { status: 400 })
    }
    updates[key] = raw.trim().slice(0, CAPS[key]) || null
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 })
  }
  if ("full_name" in updates && !updates.full_name) {
    return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 })
  }

  // Only touch fields the caller sent — absent keys keep their value,
  // explicit null/"" clears the field.
  const has = (k: Editable) => k in updates
  const val = (k: Editable) => updates[k] ?? null
  const rows = await sql`
    update linkedin_connections set
      full_name = case when ${has("full_name")} then coalesce(${val("full_name")}, full_name) else full_name end,
      headline  = case when ${has("headline")} then ${val("headline")} else headline end,
      company   = case when ${has("company")}  then ${val("company")}  else company  end,
      title     = case when ${has("title")}    then ${val("title")}    else title    end,
      location  = case when ${has("location")} then ${val("location")} else location end,
      summary   = case when ${has("summary")}  then ${val("summary")}  else summary  end,
      notes     = case when ${has("notes")}    then ${val("notes")}    else notes    end,
      updated_at = now()
    where id = ${id}::uuid and owner_id = ${guard.id}
    returning id, linkedin_url, full_name, headline, company, title, location, summary, notes, degree, updated_at
  ` as Array<Record<string, unknown>>
  if (!rows.length) return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  return NextResponse.json({ ok: true, connection: rows[0] })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const rows = await sql`
    delete from linkedin_connections
    where id = ${id}::uuid and owner_id = ${guard.id}
    returning id
  ` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
