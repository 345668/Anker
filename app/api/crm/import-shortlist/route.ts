import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createHash } from "node:crypto"
import { sql } from "@/lib/db"
import { requireWorkspace, workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { parseShortlist } from "@/lib/crm/shortlist"

export const runtime = "nodejs"
export const maxDuration = 120
export async function POST(req: NextRequest) {
  try {
    const scope = await requireWorkspace(true)
    const form = await req.formData()
    const file = form.get("xlsx")
    const source = form.get("source") || (scope.persona === "founder" ? "founder_matching" : "lp_matching")
    if (!["founder_matching", "lp_matching"].includes(String(source))) throw new WorkspaceError("Invalid shortlist source.", 400)
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx") || file.size > 10 * 1024 * 1024) throw new WorkspaceError("Upload an XLSX file up to 10 MB.", 400)
    const bytes = Buffer.from(await file.arrayBuffer())
    let parsed: ReturnType<typeof parseShortlist>
    try { parsed = parseShortlist(XLSX.read(bytes, { type: "buffer" })) }
    catch (e) { throw new WorkspaceError(e instanceof Error ? e.message : "Invalid workbook.", 400) }
    const selected = parsed.rows.filter(r => r.selected)
    const result = { filename: file.name, selected: selected.length, excluded: parsed.rows.length - selected.length, duplicateCopies: parsed.copies, mode: parsed.mode }
    if (form.get("preview") === "true") return NextResponse.json({ ...result, rows: selected.map(r => ({ key: r.key, name: r.name, stage: r.stage })) })
    if (!selected.length) return NextResponse.json({ ...result, totalInserted: 0, alreadyPresent: 0, sheets: [] })
    // A stable file identity makes board creation idempotent. The entire write is
    // one SQL statement: a failed entry insert cannot leave an orphan board.
    const importId = `xlsx:${source}:${createHash("sha256").update(bytes).digest("hex")}`
    const payload = JSON.stringify(selected)
    const rows = await sql`WITH board AS (
      INSERT INTO crm_boards(user_id, name, source_session_id, position)
      VALUES (${scope.userId}, ${file.name.replace(/\.xlsx$/i, "").slice(0, 80)}, ${importId}, 0)
      ON CONFLICT (user_id, source_session_id) WHERE source_session_id IS NOT NULL
      DO UPDATE SET source_session_id = EXCLUDED.source_session_id RETURNING id
    ), input AS (SELECT * FROM jsonb_to_recordset(${payload}::jsonb) AS x(
      key text, kind text, id text, name text, title text, email text, linkedin text, location text,
      type text, score int, tier text, why text, stage text, owner text, notes text
    )), inserted AS (
      INSERT INTO crm_entries(user_id, source, source_session_id, board_id, import_key, firm_id, investor_id,
        display_name, display_title, display_email, display_linkedin, display_location, display_type,
        display_score, display_tier, why_match, stage, owner, notes)
      SELECT ${scope.userId}, ${source}, ${importId}, board.id, x.key,
        CASE WHEN x.kind = 'firm' THEN x.id ELSE i.firm_id END,
        CASE WHEN x.kind = 'contact' THEN x.id ELSE NULL END,
        coalesce(nullif(x.name, ''), f.name, nullif(concat_ws(' ', i.first_name, i.last_name), ''), x.key),
        x.title, x.email, x.linkedin, x.location, x.type, x.score, x.tier, x.why, x.stage, x.owner, x.notes
      FROM input x CROSS JOIN board
      LEFT JOIN investment_firms f ON x.kind = 'firm' AND f.id = x.id
      LEFT JOIN investors i ON x.kind = 'contact' AND i.id = x.id
      WHERE f.id IS NOT NULL OR i.id IS NOT NULL
      ON CONFLICT DO NOTHING RETURNING id
    ) SELECT (SELECT count(*)::int FROM inserted) AS inserted,
      (SELECT count(*)::int FROM input x WHERE
        (x.kind = 'firm' AND NOT EXISTS(SELECT 1 FROM investment_firms f WHERE f.id = x.id)) OR
        (x.kind = 'contact' AND NOT EXISTS(SELECT 1 FROM investors i WHERE i.id = x.id))) AS missing`
    const inserted = Number(rows[0].inserted), missing = Number(rows[0].missing)
    return NextResponse.json({ ...result, totalInserted: inserted, alreadyPresent: selected.length - inserted - missing, missing,
      message: "Existing investors keep their original board, notes and stage. Missing directory records are not imported.", sheets: [] })
  } catch (error) { return workspaceError(error) }
}
