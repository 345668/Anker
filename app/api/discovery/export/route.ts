/**
 * POST /api/discovery/export { lens, kind, filters, ids? } → CSV
 *
 * At most 200 rows per file and 1,000 rows per workspace per day
 * (docs/architecture/12 §5), each export recorded. Only the columns the
 * persona's lens exposes.
 */
import { NextRequest, NextResponse } from "next/server"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { sql } from "@/lib/db"
import { discoveryScope } from "@/lib/platform/discovery-scope"
import { parseDiscoveryParams, searchDiscovery, DiscoveryError } from "@/lib/platform/discovery"

export const runtime = "nodejs"
export const MAX_EXPORT_ROWS = 200
export const DAILY_EXPORT_ROWS = 1000

/** A leading = + - @ is neutralised so a spreadsheet cannot run the cell as a formula. */
function cell(v: unknown): string {
  let s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

const COLUMNS: Record<string, [string, string][]> = {
  firms: [["name", "Firm"], ["type", "Type"], ["location", "Location"], ["norm_country", "Country"], ["norm_stages", "Stages"],
    ["norm_sectors", "Sectors"], ["check_min", "Check min"], ["check_max", "Check max"], ["email", "Email"], ["website", "Website"],
    ["linkedin", "LinkedIn"], ["portfolio_count", "Portfolio"], ["fit_score", "Fit"], ["crm_stage", "In CRM"], ["id", "Anker ID"]],
  investors: [["name", "Name"], ["title", "Title"], ["firm_name", "Firm"], ["type", "Type"], ["location", "Location"],
    ["norm_country", "Country"], ["norm_stages", "Stages"], ["norm_sectors", "Sectors"], ["email", "Email"], ["email_status", "Email status"],
    ["linkedin", "LinkedIn"], ["fit_score", "Fit"], ["crm_stage", "In CRM"], ["id", "Anker ID"]],
  startups: [["name", "Company"], ["description", "One-liner"], ["stage", "Stage"], ["sectors", "Sectors"], ["location", "Location"],
    ["target_amount", "Raising"], ["website", "Website"], ["linkedin", "LinkedIn"], ["id", "Anker ID"]],
  funds: [["name", "Fund"], ["description", "Strategy"], ["vintage_year", "Vintage"], ["target_size", "Target size"],
    ["currency", "Currency"], ["status", "Status"], ["id", "Anker ID"]],
}

export async function POST(req: NextRequest) {
  try {
    const scope = await discoveryScope()
    const body = await req.json().catch(() => ({}))
    const params = new URLSearchParams({ ...(body?.filters ?? {}), lens: body?.lens ?? "", kind: body?.kind ?? "" })
    params.set("limit", String(MAX_EXPORT_ROWS))
    params.set("page", "1")
    const query = parseDiscoveryParams(params, scope.persona)

    const owner = scope.orgId ?? `user:${scope.userId}`
    const [used] = await sql`SELECT COALESCE(sum(rows), 0)::int AS n FROM discovery_exports WHERE org_id = ${owner} AND created_at >= date_trunc('day', now())`
    const left = DAILY_EXPORT_ROWS - Number(used?.n ?? 0)
    if (left <= 0) throw new WorkspaceError(`Daily export limit reached (${DAILY_EXPORT_ROWS} rows). Try again tomorrow.`, 429)

    const result = await searchDiscovery(scope, { ...query, limit: Math.min(MAX_EXPORT_ROWS, left) })
    const wanted: string[] | null = Array.isArray(body?.ids) ? body.ids.filter((i: unknown) => typeof i === "string") : null
    const rows = wanted ? result.rows.filter((r) => wanted.includes(String(r.id))) : result.rows
    const cols = COLUMNS[query.kind]
    const csv = "﻿" + [cols.map(([, h]) => cell(h)).join(","), ...rows.map((r) => cols.map(([k]) => cell(r[k])).join(","))].join("\r\n") + "\r\n"

    await sql`INSERT INTO discovery_exports (id, org_id, user_id, lens, rows) VALUES (${`dex_${crypto.randomUUID()}`}, ${owner}, ${scope.userId ?? "unknown"}, ${query.lens}, ${rows.length})`
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="anker-${query.lens}-${query.kind}.csv"`, "X-Export-Rows": String(rows.length), "X-Export-Rows-Left": String(left - rows.length) },
    })
  } catch (e) {
    if (e instanceof DiscoveryError) return NextResponse.json({ error: "Invalid filter or pagination." }, { status: 400 })
    return workspaceError(e)
  }
}
