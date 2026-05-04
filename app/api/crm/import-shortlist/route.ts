/**
 * CRM import — accepts a (possibly edited) shortlist xlsx and inserts every
 * row where the leftmost "Contact" column is TRUE into crm_entries.
 *
 * Workflow:
 *   1. Each shortlist sheet has columns:  Contact, #, Score, Tier, …, Anker ID
 *   2. We iterate every sheet, read the header row to find the Contact + Anker
 *      ID columns, then walk the rows.
 *   3. For each row where Contact is truthy AND Anker ID is set, we look the
 *      record up in investment_firms / investors (so we can attach a real
 *      firm_id / investor_id) and upsert a crm_entries row with stage='queued'.
 *   4. Section dividers + blank rows are skipped (they have no Anker ID).
 *
 * The same upload can be re-applied — the UNIQUE constraint on
 * (user_id, source, firm_id, investor_id) means duplicates are no-ops.
 *
 * Returns a per-sheet summary so the user sees exactly what was added.
 */
import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_BYTES = 25 * 1024 * 1024

interface SheetSummary {
  sheet: string
  rowsTotal: number
  ticked: number
  unticked: number
  inserted: number
  alreadyPresent: number
  skipped: number
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const form = await req.formData()
    const file = form.get("xlsx") as File | null
    const sourceHint = (form.get("source") as string | null) ?? null
    const sessionHint = (form.get("session_id") as string | null) ?? null

    if (!file) return NextResponse.json({ error: "Upload an xlsx as `xlsx`." }, { status: 400 })
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1e6}MB)` }, { status: 400 })
    }

    const ab = await file.arrayBuffer()
    const wb = XLSX.read(Buffer.from(ab), { type: "buffer", cellDates: false })

    const summaries: SheetSummary[] = []
    let totalInserted = 0

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      // Read as 2D array preserving cell types so we can read booleans correctly
      const arr: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

      // Find the header row — first row whose first cell is "Contact".  This
      // is robust across all our sheet layouts (Summary, Priority Firms, etc.)
      let headerRow = -1
      for (let i = 0; i < Math.min(arr.length, 20); i++) {
        if (arr[i]?.[0] && String(arr[i][0]).trim().toLowerCase() === "contact") {
          headerRow = i
          break
        }
      }
      if (headerRow < 0) {
        summaries.push({ sheet: sheetName, rowsTotal: 0, ticked: 0, unticked: 0, inserted: 0, alreadyPresent: 0, skipped: 0 })
        continue
      }

      const header = arr[headerRow].map((h) => String(h ?? "").trim())
      const ankerIdCol = header.findIndex((h) => h.toLowerCase() === "anker id")
      if (ankerIdCol < 0) {
        summaries.push({ sheet: sheetName, rowsTotal: 0, ticked: 0, unticked: 0, inserted: 0, alreadyPresent: 0, skipped: 0 })
        continue
      }

      const COL = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
      const colName    = COL("Firm")    >= 0 ? COL("Firm")    : COL("Name")
      const colTitle   = COL("Title")
      const colEmail   = COL("Email")
      const colLinkedin= COL("LinkedIn")
      const colLocation= COL("Location")
      const colType    = COL("Type")
      const colScore   = COL("Score")
      const colTier    = COL("Tier")
      const colWhy     = COL("Why this LP") >= 0 ? COL("Why this LP") : COL("Why match")

      const summary: SheetSummary = {
        sheet: sheetName, rowsTotal: 0, ticked: 0, unticked: 0,
        inserted: 0, alreadyPresent: 0, skipped: 0,
      }

      for (let r = headerRow + 1; r < arr.length; r++) {
        const row = arr[r]
        if (!row) continue
        const ankerId = row[ankerIdCol]
        if (!ankerId || typeof ankerId !== "string") continue // section divider or blank
        const contactCell = row[0]
        const ticked = isTruthy(contactCell)
        summary.rowsTotal++
        if (!ticked) { summary.unticked++; continue }
        summary.ticked++

        // Parse "firm:<id>" or "contact:<id>"
        const m = ankerId.match(/^(firm|contact):(.+)$/)
        if (!m) { summary.skipped++; continue }
        const [, kind, id] = m

        let firmId: string | null = null
        let investorId: string | null = null
        let displayName = String(row[colName] ?? "")
        let displayTitle = colTitle  >= 0 ? String(row[colTitle]  ?? "") : null
        let displayEmail = colEmail  >= 0 ? String(row[colEmail]  ?? "") : null
        let displayLi    = colLinkedin >= 0 ? String(row[colLinkedin] ?? "") : null
        const displayLoc = colLocation >= 0 ? String(row[colLocation] ?? "") : null
        const displayType= colType  >= 0 ? String(row[colType]  ?? "") : null
        const score      = colScore >= 0 && Number.isFinite(Number(row[colScore])) ? Math.round(Number(row[colScore])) : null
        const tier       = colTier  >= 0 ? String(row[colTier]  ?? "") : null
        const why        = colWhy   >= 0 ? String(row[colWhy]   ?? "") : null

        if (kind === "firm") {
          firmId = id
          // Refresh display name from DB if available
          const fr = await sql`SELECT name FROM investment_firms WHERE id = ${id} LIMIT 1`
          if (fr.length) displayName = (fr[0] as any).name ?? displayName
        } else {
          investorId = id
          const ir = await sql`
            SELECT first_name, last_name, title, email, COALESCE(linkedin_url, person_linkedin_url) AS linkedin, firm_id
            FROM investors WHERE id = ${id} LIMIT 1
          `
          if (ir.length) {
            const v = ir[0] as any
            displayName  = `${v.first_name ?? ""} ${v.last_name ?? ""}`.trim() || displayName
            displayTitle = v.title ?? displayTitle
            displayEmail = v.email ?? displayEmail
            displayLi    = v.linkedin ?? displayLi
            firmId       = v.firm_id ?? null
          }
        }

        // Upsert — use RETURNING to distinguish actual inserts from no-ops
        try {
          const inserted = await sql`
            INSERT INTO crm_entries (
              user_id, source, source_session_id, firm_id, investor_id,
              display_name, display_title, display_email, display_linkedin,
              display_location, display_type, display_score, display_tier, why_match,
              stage, added_at, updated_at
            ) VALUES (
              ${user.id},
              ${sourceHint || "lp_matching"},
              ${sessionHint},
              ${firmId}, ${investorId},
              ${displayName}, ${displayTitle}, ${displayEmail || null}, ${displayLi || null},
              ${displayLoc}, ${displayType}, ${score}, ${tier}, ${why},
              'queued', NOW(), NOW()
            )
            ON CONFLICT (user_id, source, firm_id, investor_id) DO NOTHING
            RETURNING id
          `
          if (inserted.length) summary.inserted++
          else summary.alreadyPresent++
        } catch (e: any) {
          console.error(`[crm-import/${sheetName}] insert error:`, e?.message)
          summary.skipped++
        }
      }
      totalInserted += summary.inserted
      summaries.push(summary)
    }

    return NextResponse.json({
      filename: file.name,
      sheets: summaries,
      totalInserted,
    })
  } catch (e: any) {
    console.error("[crm/import-shortlist] error:", e)
    return NextResponse.json({ error: e?.message ?? "Import failed" }, { status: 500 })
  }
}

function isTruthy(v: any): boolean {
  if (typeof v === "boolean") return v
  if (typeof v === "number") return v !== 0
  if (typeof v === "string") {
    const s = v.trim().toLowerCase()
    return s === "true" || s === "yes" || s === "y" || s === "x" || s === "✓" || s === "1" || s === "on"
  }
  return false
}
