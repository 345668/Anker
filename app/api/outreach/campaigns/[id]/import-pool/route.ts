/**
 * POST /api/outreach/campaigns/[id]/import-pool
 *
 * Populates a campaign's candidate pool by unioning:
 *   - Neon `investors` table
 *   - Neon `crm_entries` table (existing CRM contacts)
 *   - Optional uploaded XLSX (LinkedIn network export or any pool file)
 *
 * Dedupe order: linkedin_url → normalized(name+firm) → email.
 *
 * For each unique person we upsert a crm_entries row (with source='manual'),
 * then upsert an outreach_campaign_members row linking that crm entry to
 * this campaign. Idempotent — re-running only adds NEW pool members.
 *
 * Body (multipart/form-data OR application/json):
 *   sources: JSON string of { neonInvestors: bool, neonCrm: bool }
 *   file:    optional XLSX (LinkedIn network shape or profiles shape)
 *
 * Returns:
 *   { ok, poolSize, coverage: { emailAndLinkedin, emailOnly, linkedinOnly, neither } }
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import * as XLSX from "xlsx"

export const runtime = "nodejs"
export const maxDuration = 120

// ─── Helpers ─────────────────────────────────────────────────────────────
const norm = (s: unknown): string => typeof s === "string" ? s.trim().toLowerCase() : ""
const normUrl = (s: unknown): string => norm(s).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")

interface PoolCandidate {
  name?: string | null
  email?: string | null
  linkedin_url?: string | null
  firm?: string | null
  title?: string | null
  headline?: string | null
  lp_type?: string | null
  sectors?: string | null
  location?: string | null
  tags?: string | null
  degree?: number | string | null
  sources: string[]
}

function toKey(c: PoolCandidate): string | null {
  if (c.linkedin_url) return `li:${normUrl(c.linkedin_url)}`
  if (c.name)         return `n:${norm(c.name)}|f:${norm(c.firm)}`
  if (c.email)        return `e:${norm(c.email)}`
  return null
}

function mergeInto(map: Map<string, PoolCandidate>, cand: PoolCandidate, src: string) {
  const key = toKey(cand)
  if (!key) return
  const existing = map.get(key) || { sources: [] as string[] }
  const merged: PoolCandidate = { sources: existing.sources }
  for (const k of Object.keys(existing) as (keyof PoolCandidate)[]) {
    if (existing[k]) (merged as any)[k] = existing[k]
  }
  for (const k of Object.keys(cand) as (keyof PoolCandidate)[]) {
    if (cand[k]) (merged as any)[k] = cand[k]
  }
  const srcSet = new Set([...existing.sources, src])
  merged.sources = Array.from(srcSet)
  map.set(key, merged)
}

async function parseXlsx(file: File): Promise<PoolCandidate[]> {
  const buf = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buf, { type: "buffer" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })
  // Support two shapes: LinkedIn network export (lowercase headers) and
  // enriched profiles (Title Case).
  const out: PoolCandidate[] = []
  for (const r of rows) {
    const pick = (k: string, alts: string[] = []): string | null => {
      for (const key of [k, ...alts]) {
        const v = (r as any)[key]
        if (v != null && v !== "") return String(v)
      }
      return null
    }
    const name = pick("name", ["Name"])
    if (!name) continue
    out.push({
      name,
      email: pick("email", ["Email"]),
      linkedin_url: pick("linkedin_url", ["LinkedIn", "LinkedIn URL"]),
      firm: pick("company", ["Firm", "firm"]),
      title: pick("title", ["Title", "Title/Role"]),
      headline: pick("headline", ["Headline"]),
      lp_type: pick("lp_type", ["LP Type"]),
      sectors: pick("sectors", ["Sectors"]),
      location: pick("location", ["Location"]),
      tags: pick("tags", ["Tags"]),
      degree: pick("degree", ["Degree"]),
      sources: [],
    })
  }
  return out
}

// ─── Route ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  // Verify campaign belongs to user
  const camp = await sql<any[]>`
    SELECT id FROM outreach_campaigns WHERE id = ${campaignId} AND user_id = ${user.id}
  `
  if (!camp.length) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

  // Parse body — either multipart/form-data OR JSON
  const ct = req.headers.get("content-type") || ""
  let sourcesFlags = { neonInvestors: true, neonCrm: true }
  let uploaded: PoolCandidate[] = []

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData()
    const sJson = form.get("sources")
    if (typeof sJson === "string") {
      try { sourcesFlags = { ...sourcesFlags, ...JSON.parse(sJson) } } catch {}
    }
    const file = form.get("file")
    if (file instanceof File && file.size > 0) {
      uploaded = await parseXlsx(file)
    }
  } else {
    const body = await req.json().catch(() => ({}))
    if (body.sources) sourcesFlags = { ...sourcesFlags, ...body.sources }
    if (Array.isArray(body.candidates)) uploaded = body.candidates as PoolCandidate[]
  }

  const pool = new Map<string, PoolCandidate>()

  // Neon investors
  if (sourcesFlags.neonInvestors) {
    const rows = await sql<any[]>`SELECT * FROM investors WHERE name IS NOT NULL`
    for (const r of rows) {
      mergeInto(pool, {
        name: r.name,
        email: r.email,
        linkedin_url: r.linkedin_url,
        firm: r.firm,
        title: r.title,
        headline: null,
        lp_type: r.metadata?.lp_type ?? null,
        sectors: r.metadata?.sectors ?? null,
        location: r.metadata?.location ?? null,
        tags: Array.isArray(r.tags) ? r.tags.join(", ") : (r.tags ?? null),
        degree: null,
        sources: [],
      }, "neon-investors")
    }
  }

  // Neon crm_entries
  if (sourcesFlags.neonCrm) {
    const rows = await sql<any[]>`
      SELECT id, display_name, display_email, display_linkedin, display_title, display_location,
             linkedin_data
      FROM crm_entries
      WHERE user_id = ${user.id}
    `
    for (const r of rows) {
      const ld = r.linkedin_data || {}
      mergeInto(pool, {
        name: r.display_name,
        email: r.display_email,
        linkedin_url: r.display_linkedin,
        firm: ld.company ?? null,
        title: r.display_title ?? ld.title ?? null,
        headline: ld.headline ?? null,
        lp_type: null,
        sectors: null,
        location: r.display_location ?? null,
        tags: null,
        degree: null,
        sources: [],
      }, "neon-crm")
    }
  }

  // Uploaded XLSX
  for (const c of uploaded) mergeInto(pool, c, "upload-xlsx")

  // ── Upsert crm_entries + outreach_campaign_members ──
  let added = 0
  for (const cand of pool.values()) {
    if (!cand.name) continue

    // Try to find an existing crm entry for this user + linkedin_url first
    // (that's our strongest identity). Fall back to name.
    let entryId: string | null = null
    if (cand.linkedin_url) {
      const found = await sql<any[]>`
        SELECT id FROM crm_entries
        WHERE user_id = ${user.id} AND display_linkedin = ${cand.linkedin_url}
        LIMIT 1
      `
      if (found.length) entryId = found[0].id
    }
    if (!entryId) {
      const inserted = await sql<any[]>`
        INSERT INTO crm_entries (
          user_id, source, display_name, display_title, display_email,
          display_linkedin, display_location
        ) VALUES (
          ${user.id}, 'manual', ${cand.name}, ${cand.title || null},
          ${cand.email || null}, ${cand.linkedin_url || null}, ${cand.location || null}
        )
        RETURNING id
      `
      entryId = inserted[0]?.id
    }
    if (!entryId) continue

    // Insert campaign member (idempotent via UNIQUE (campaign_id, crm_entry_id))
    await sql`
      INSERT INTO outreach_campaign_members (
        campaign_id, user_id, crm_entry_id, status,
        lp_type, sources, email, snapshot
      ) VALUES (
        ${campaignId}, ${user.id}, ${entryId}, 'planned',
        ${cand.lp_type || null}, ${cand.sources as any},
        ${cand.email || null}, ${JSON.stringify(cand)}::jsonb
      )
      ON CONFLICT (campaign_id, crm_entry_id) DO UPDATE SET
        lp_type = EXCLUDED.lp_type,
        sources = EXCLUDED.sources,
        email   = COALESCE(EXCLUDED.email, outreach_campaign_members.email)
    `
    added++
  }

  // Coverage stats over the whole pool now on this campaign
  const stats = await sql<any[]>`
    SELECT
      count(*)                                                       AS total,
      count(*) FILTER (WHERE email IS NOT NULL)                      AS with_email,
      count(*) FILTER (WHERE snapshot->>'linkedin_url' IS NOT NULL)  AS with_linkedin,
      count(*) FILTER (WHERE email IS NOT NULL
                        AND snapshot->>'linkedin_url' IS NOT NULL)   AS with_both
    FROM outreach_campaign_members
    WHERE campaign_id = ${campaignId}
  `

  return NextResponse.json({
    ok: true,
    poolSize: Number(stats[0]?.total ?? 0),
    added,
    coverage: {
      total:         Number(stats[0]?.total ?? 0),
      emailAndLinkedin: Number(stats[0]?.with_both ?? 0),
      emailOnly:     Number(stats[0]?.with_email ?? 0) - Number(stats[0]?.with_both ?? 0),
      linkedinOnly:  Number(stats[0]?.with_linkedin ?? 0) - Number(stats[0]?.with_both ?? 0),
      neither:       Number(stats[0]?.total ?? 0) - Number(stats[0]?.with_email ?? 0) - (Number(stats[0]?.with_linkedin ?? 0) - Number(stats[0]?.with_both ?? 0)),
    },
  })
}
