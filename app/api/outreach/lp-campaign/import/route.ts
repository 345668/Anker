/**
 * POST /api/outreach/lp-campaign/import
 *
 * Imports an SVS-format enriched outreach Excel file into the database:
 *   1. crm_entries          — one row per LP profile
 *   2. outreach_campaigns   — one named campaign (upserted by name)
 *   3. outreach_campaign_members — one per CRM entry
 *   4. outreach_messages    — email draft + LinkedIn DM per LP
 *
 * Accepts: multipart/form-data with field "file" (XLSX)
 *       OR application/json with { campaignName?, profiles[], drafts[], dms[] }
 *
 * Returns:
 *   { ok, campaignId, campaignName, stats: { crm, members, messages } }
 *
 * Idempotent — re-uploading updates existing rows.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import * as XLSX from "xlsx"

export const runtime = "nodejs"
export const maxDuration = 120

// ─── Types matching the Excel schema ─────────────────────────────────────────

interface ProfileRow {
  "#": number | string
  Tier: number | string
  Score: number | string
  Name: string
  "Title/Role"?: string
  "LP Type"?: string
  Tags?: string
  Location?: string
  Email?: string
  LinkedIn?: string
  Sectors?: string
  "Why This Contact"?: string
  "Inferred Website"?: string
  "Firm Intelligence"?: string
  "Investment Mandate"?: string
  "Personalisation Hook"?: string
  "Enriched Subject"?: string
  "Multi-Touch Note"?: string
  Batch?: number | string
  "Outreach Status"?: string
  [key: string]: unknown
}

interface DraftRow {
  "#": number | string
  Name?: string
  "LP Type"?: string
  Email?: string
  Subject?: string
  Body?: string
  "Primary channel"?: string
  "Enriched Subject"?: string
  [key: string]: unknown
}

interface DmRow {
  "#"?: number | string
  Name?: string
  "LinkedIn URL"?: string
  "DM (first touch)"?: string
  [key: string]: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function s(v: unknown): string | null {
  if (v == null || v === "") return null
  return String(v).trim()
}
function n(v: unknown): number | null {
  const x = Number(v); return isNaN(x) ? null : x
}
function tierLabel(v: unknown): string {
  const x = Number(v); return x === 1 ? "T1" : x === 2 ? "T2" : "T3"
}
function toStage(status: string | null): string {
  const st = (status ?? "").toLowerCase()
  if (st.includes("sent")) return "contacted"
  if (st.includes("replied")) return "responded"
  return "queued"
}
function toChannel(v: unknown): "email" | "linkedin" {
  return String(v ?? "").toLowerCase().includes("linkedin") ? "linkedin" : "email"
}

// ─── Core import logic ────────────────────────────────────────────────────────

export async function importFromSheets(
  userId: string,
  profiles: ProfileRow[],
  drafts: DraftRow[],
  dms: DmRow[],
  campaignName: string
): Promise<{
  campaignId: string
  stats: { crmInserted: number; crmUpdated: number; members: number; messages: number }
}> {
  const draftByNum = new Map(drafts.map((r) => [String(r["#"]), r]))
  const dmByName   = new Map(dms.map((r) => [String(r["Name"] ?? "").trim(), r]))

  let crmInserted = 0, crmUpdated = 0, members = 0, messages = 0

  // ── 1. Upsert crm_entries ──────────────────────────────────────────────────
  const crmIdByNum = new Map<string, string>()

  for (const row of profiles) {
    const rowNum = String(row["#"])
    const name   = s(row["Name"]) ?? "Unknown"
    const researchSummary = [
      s(row["Firm Intelligence"]),
      s(row["Investment Mandate"]),
      s(row["Personalisation Hook"]),
    ].filter(Boolean).join("\n\n")

    const stableKey = `svs-${rowNum}`

    const existing = await sql`
      SELECT id FROM crm_entries WHERE user_id = ${userId} AND investor_id = ${stableKey} LIMIT 1
    ` as any[]

    let crmId: string
    if (existing.length) {
      crmId = existing[0].id
      await sql`
        UPDATE crm_entries SET
          display_name     = ${name},
          display_title    = ${s(row["Title/Role"])},
          display_email    = ${s(row["Email"])},
          display_linkedin = ${s(row["LinkedIn"])},
          display_location = ${s(row["Location"])},
          display_type     = ${s(row["LP Type"])},
          display_score    = ${n(row["Score"])},
          display_tier     = ${tierLabel(row["Tier"])},
          why_match        = ${s(row["Why This Contact"])},
          research_summary = ${researchSummary || null},
          stage            = ${toStage(s(row["Outreach Status"]))},
          updated_at       = NOW()
        WHERE id = ${crmId}
      `
      crmUpdated++
    } else {
      const ins = await sql`
        INSERT INTO crm_entries (
          user_id, source, investor_id,
          display_name, display_title, display_email,
          display_linkedin, display_location, display_type,
          display_score, display_tier, why_match,
          research_summary, stage
        ) VALUES (
          ${userId}, 'manual', ${stableKey},
          ${name}, ${s(row["Title/Role"])}, ${s(row["Email"])},
          ${s(row["LinkedIn"])}, ${s(row["Location"])}, ${s(row["LP Type"])},
          ${n(row["Score"])}, ${tierLabel(row["Tier"])}, ${s(row["Why This Contact"])},
          ${researchSummary || null}, ${toStage(s(row["Outreach Status"]))}
        )
        RETURNING id
      ` as any[]
      crmId = ins[0].id
      crmInserted++
    }
    crmIdByNum.set(rowNum, crmId)
  }

  // ── 2. Upsert campaign ─────────────────────────────────────────────────────
  const existingCamp = await sql`
    SELECT id FROM outreach_campaigns WHERE user_id = ${userId} AND name = ${campaignName} LIMIT 1
  ` as any[]

  let campaignId: string
  if (existingCamp.length) {
    campaignId = existingCamp[0].id
    await sql`UPDATE outreach_campaigns SET status='active', updated_at=NOW() WHERE id=${campaignId}`
  } else {
    const ins = await sql`
      INSERT INTO outreach_campaigns (user_id, name, description, status, default_channel)
      VALUES (
        ${userId}, ${campaignName},
        ${"Imported from SVS Fund II Enriched Outreach 282 — " + profiles.length + " LP profiles"},
        'active', 'multi'
      )
      RETURNING id
    ` as any[]
    campaignId = ins[0].id
  }

  // ── 3. Upsert campaign members ─────────────────────────────────────────────
  for (const [rowNum, crmId] of crmIdByNum) {
    const draft  = draftByNum.get(rowNum)
    const status = draft ? "drafted" : "planned"
    const row    = profiles[Number(rowNum) - 1]

    await sql`
      INSERT INTO outreach_campaign_members (campaign_id, user_id, crm_entry_id, status, snapshot, drafted_at)
      VALUES (
        ${campaignId}, ${userId}, ${crmId}, ${status},
        ${JSON.stringify({
          name: s(row?.["Name"]), lpType: s(row?.["LP Type"]),
          score: n(row?.["Score"]), tier: s(row?.["Tier"]),
          batch: n(row?.["Batch"]), multiTouchNote: s(row?.["Multi-Touch Note"]),
        })}::jsonb,
        ${draft ? new Date().toISOString() : null}
      )
      ON CONFLICT (campaign_id, crm_entry_id) DO UPDATE SET
        status     = EXCLUDED.status,
        snapshot   = EXCLUDED.snapshot,
        drafted_at = COALESCE(outreach_campaign_members.drafted_at, EXCLUDED.drafted_at),
        updated_at = NOW()
    `
    members++
  }

  // ── 4. Upsert outreach_messages ────────────────────────────────────────────
  for (const [rowNum, crmId] of crmIdByNum) {
    const row   = profiles[Number(rowNum) - 1]
    const draft = draftByNum.get(rowNum)
    const dm    = dmByName.get(String(row?.["Name"] ?? "").trim())

    // Email draft
    if (draft && s(draft["Body"])) {
      const subject = s(draft["Enriched Subject"]) || s(draft["Subject"]) || "Introduction — Summit Venture Studio Fund II"
      const ch      = toChannel(draft["Primary channel"])

      await sql`
        INSERT INTO outreach_messages (
          user_id, crm_entry_id, kind, step_number, channel,
          subject, body, status, generated_by, email_to
        ) VALUES (
          ${userId}, ${crmId}, 'connection_request', 0, ${ch},
          ${subject}, ${s(draft["Body"])},
          'draft', 'import:svs-excel', ${s(row?.["Email"])}
        )
        ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
          body         = EXCLUDED.body,
          subject      = EXCLUDED.subject,
          channel      = EXCLUDED.channel,
          email_to     = EXCLUDED.email_to,
          generated_by = EXCLUDED.generated_by,
          updated_at   = NOW()
      `
      messages++
    }

    // LinkedIn DM — stored as 'follow_up' kind to avoid conflict with email 'connection_request'
    if (dm && s(dm["DM (first touch)"])) {
      await sql`
        INSERT INTO outreach_messages (
          user_id, crm_entry_id, kind, step_number, channel,
          body, status, generated_by
        ) VALUES (
          ${userId}, ${crmId}, 'follow_up', 1, 'linkedin',
          ${s(dm["DM (first touch)"])}, 'draft', 'import:svs-excel'
        )
        ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
          body         = EXCLUDED.body,
          generated_by = EXCLUDED.generated_by,
          updated_at   = NOW()
      `
      messages++
    }
  }

  return { campaignId, stats: { crmInserted, crmUpdated, members, messages } }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const ct = req.headers.get("content-type") ?? ""
    let profiles: ProfileRow[] = []
    let drafts:   DraftRow[]   = []
    let dms:      DmRow[]      = []
    let campaignName = "SVS Fund II — 282 Enriched LPs"

    if (ct.includes("multipart/form-data")) {
      // File upload path
      const form = await req.formData()
      const file = form.get("file") as File | null
      if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
      if (form.get("campaignName")) campaignName = String(form.get("campaignName"))

      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: "array" })

      const readSheet = (name: string) => {
        const ws = wb.Sheets[name]
        if (!ws) return []
        return XLSX.utils.sheet_to_json<any>(ws, { defval: "" })
      }

      profiles = readSheet("Curated Profiles (Enriched)")
      drafts   = readSheet("Email Drafts (Enriched)")
      dms      = readSheet("LinkedIn DMs")
    } else {
      // JSON path (from lp-campaign pipeline result)
      const body = await req.json()
      campaignName = body.campaignName ?? campaignName
      profiles     = body.profiles ?? []
      drafts       = body.drafts   ?? []
      dms          = body.dms      ?? []
    }

    if (!profiles.length) {
      return NextResponse.json({ error: "No profiles found in file" }, { status: 400 })
    }

    const result = await importFromSheets(user.id, profiles, drafts, dms, campaignName)

    return NextResponse.json({
      ok: true,
      campaignId:   result.campaignId,
      campaignName,
      profileCount: profiles.length,
      stats: result.stats,
    })
  } catch (e: any) {
    console.error("[lp-campaign/import]", e)
    return NextResponse.json({ error: e?.message ?? "Import failed" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "POST /api/outreach/lp-campaign/import",
    accepts: "multipart/form-data (field: file) or application/json",
    sheets: ["Curated Profiles (Enriched)", "Email Drafts (Enriched)", "LinkedIn DMs"],
  })
}
