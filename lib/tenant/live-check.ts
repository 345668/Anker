/**
 * The nightly guard for erasure: every table in the live database keyed by a workspace, fund or owner must be classified in the registry. A table a
 * migration added since the last snapshot shows up here as "degraded" until someone classifies it, so a "complete" erasure can never silently miss one.
 */
import "server-only"
import { sql } from "@/lib/db"
import { RULES, EXCLUDED } from "./registry"

export async function unclassifiedKeyedTables(): Promise<string[]> {
  const rows = (await sql.unsafe(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = 'public'
    AND column_name IN ('org_id','fund_id','workspace_id','owner_user_id') AND table_name NOT LIKE 'neon\\_%'`, [])) as any[]
  const known = new Set([...RULES.map((r) => r.table), ...EXCLUDED.map((e) => e.table)])
  return rows.map((r) => String(r.table_name)).filter((t) => !known.has(t)).sort()
}

export async function tenantRegistryCheck(): Promise<{ name: string; status: "ok" | "degraded" | "unconfigured"; detail: string; fix?: string }> {
  try {
    const missing = await unclassifiedKeyedTables()
    return missing.length
      ? { name: "Erasure registry", status: "degraded", detail: `${missing.length} table(s) keyed by a workspace are not classified: ${missing.join(", ")}.`, fix: "Add each to lib/tenant/registry.ts (a rule to export and erase it, or an EXCLUDED entry with the reason), then retake the snapshot with scripts/snapshot-keyed-tables.mjs." }
      : { name: "Erasure registry", status: "ok", detail: "Every workspace-keyed table is classified." }
  } catch { return { name: "Erasure registry", status: "unconfigured", detail: "Could not read the schema." } }
}
