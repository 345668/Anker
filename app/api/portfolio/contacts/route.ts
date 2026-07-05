/**
 * GET  /api/portfolio/contacts?q=&limit=20
 *   Search the contacts table for the LP picker. Matches on first_name,
 *   last_name, email, or "first last" concatenation.  Results prioritise
 *   contacts that have an email (since the only reason we're looking up
 *   contacts in the portfolio surface is to wire LPs up for notices).
 *
 * POST /api/portfolio/contacts
 *   Body: { firstName?, lastName?, email?, phone?, title?, notes? }
 *   Lightweight create — minimal validation, just enough to drop a new
 *   contact into the LP picker. Returns the full row.
 *
 * Admin-gated. Lives under /api/portfolio so the route is scoped to
 * what the venture-studio surface needs; the full CRM lives under
 * /api/crm with richer per-row affordances.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

export interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  title: string | null
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const limit = clampInt(url.searchParams.get("limit"), 1, 50, 20)

  // Empty query → recent contacts with emails (LP picker default state).
  // We rank emails-present first so the picker always shows usable rows.
  const rows = q
    ? await sql`
        SELECT id, first_name, last_name, email, phone, title
          FROM contacts
         WHERE first_name ILIKE ${`%${q}%`}
            OR last_name  ILIKE ${`%${q}%`}
            OR email      ILIKE ${`%${q}%`}
            OR ((COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) ILIKE ${`%${q}%`})
         ORDER BY
           CASE WHEN email IS NOT NULL AND length(email) > 0 THEN 0 ELSE 1 END,
           last_name NULLS LAST,
           first_name NULLS LAST
         LIMIT ${limit}
      `
    : await sql`
        SELECT id, first_name, last_name, email, phone, title
          FROM contacts
         ORDER BY
           CASE WHEN email IS NOT NULL AND length(email) > 0 THEN 0 ELSE 1 END,
           last_contacted_at DESC NULLS LAST,
           created_at DESC
         LIMIT ${limit}
      `

  return NextResponse.json({
    rows: rows.map(normalizeContact),
    total: rows.length,
    query: q,
  })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  try {
    const body = await req.json()
    const firstName = (body?.firstName ?? "").trim()
    const lastName  = (body?.lastName ?? "").trim()
    const email     = (body?.email ?? "").trim()
    const phone     = (body?.phone ?? "").trim()
    const title     = (body?.title ?? "").trim()
    const notes     = body?.notes ?? null

    // Minimum viable: at least one name or an email so the picker can
    // surface the row later.
    if (!firstName && !lastName && !email) {
      return NextResponse.json(
        { error: "At least one of firstName / lastName / email is required." },
        { status: 400 },
      )
    }

    const rows = await sql`
      INSERT INTO contacts (
        first_name, last_name, email, phone, title, notes,
        user_id, created_at, updated_at
      ) VALUES (
        ${firstName || null}, ${lastName || null}, ${email || null},
        ${phone || null}, ${title || null}, ${notes},
        ${admin.id}, NOW(), NOW()
      )
      RETURNING id, first_name, last_name, email, phone, title
    `
    return NextResponse.json({ contact: normalizeContact(rows[0]) }, { status: 201 })
  } catch (e: any) {
    console.error("[portfolio/contacts POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}

function normalizeContact(r: any): ContactRow {
  return {
    id: r.id,
    first_name: r.first_name ?? null,
    last_name: r.last_name ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    title: r.title ?? null,
  }
}

function clampInt(s: string | null | undefined, min: number, max: number, fallback: number) {
  const n = Number(s)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}
