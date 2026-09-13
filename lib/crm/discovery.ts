import { sql } from "@/lib/db"
import { requireWorkspace, WorkspaceError } from "@/lib/auth/workspace-context"

/** Directory saves go to the existing personal CRM, not the retired outreach table. */
export async function saveDiscoveryContact(entityId: string, kind: "investor" | "firm") {
  if (typeof entityId !== "string" || !entityId || entityId.length > 200 || !["investor", "firm"].includes(kind)) throw new WorkspaceError("Choose a valid directory record.", 400)
  const scope = await requireWorkspace(true)
  if (!["founder", "vc"].includes(scope.persona)) throw new WorkspaceError("Select a company or fund workspace to save a contact.", 403)
  const [record] = kind === "investor"
    ? await sql`SELECT * FROM investors WHERE id = ${entityId}`
    : await sql`SELECT * FROM investment_firms WHERE id = ${entityId}`
  if (!record) throw new WorkspaceError("This directory record is no longer available.", 404)
  const name = record.name || [record.first_name, record.last_name].filter(Boolean).join(" ") || "Investor"
  const key = `${kind === "firm" ? "firm" : "contact"}:${entityId}`
  const source = scope.persona === "founder" ? "founder_matching" : "lp_matching"
  const result = await sql`
    INSERT INTO crm_entries (user_id, source, import_key, firm_id, investor_id, display_name, display_email, stage)
    VALUES (${scope.userId}, ${source}, ${key}, ${kind === "firm" ? entityId : record.firm_id ?? null},
      ${kind === "investor" ? entityId : null}, ${name}, ${record.email ?? record.contact_email ?? null}, 'queued')
    ON CONFLICT (user_id, source, import_key) DO NOTHING RETURNING id
  `
  return { success: true as const, message: result.length ? "Added to your personal CRM." : "Already in your personal CRM. Existing notes and round links were kept." }
}
