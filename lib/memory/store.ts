/** Entity memory: what a workspace has told the system to remember about a record. docs/architecture/45 §5. Tenant data: scoped by org_id, in the export and erasure registry. */
import { sql } from "@/lib/db"
import { recordChange } from "@/lib/audit/record-change"

export interface Memory { id: string; entity_type: string; entity_id: string; key: string; value: string; source: "person" | "agent" | "assistant"; pinned: boolean; valid_until: string | null; created_at: string }

export const KEY_RE = /^[a-z][a-z0-9_]{1,40}$/
export const MAX_VALUE = 500

/** Live memory for a record (expired entries are not returned), optionally one key. */
export async function recall(orgId: string, entityType: string, entityId: string, key?: string): Promise<Memory[]> {
  return (key
    ? await sql`SELECT * FROM entity_memory WHERE org_id = ${orgId} AND entity_type = ${entityType} AND entity_id = ${entityId} AND key = ${key} AND (valid_until IS NULL OR valid_until > now())`
    : await sql`SELECT * FROM entity_memory WHERE org_id = ${orgId} AND entity_type = ${entityType} AND entity_id = ${entityId} AND (valid_until IS NULL OR valid_until > now()) ORDER BY key`) as Memory[]
}

export async function listMemory(orgId: string, limit = 200): Promise<Memory[]> {
  return (await sql`SELECT m.*, e.display_name AS entity_label FROM entity_memory m LEFT JOIN crm_entries e ON m.entity_type = 'crm_entry' AND e.id = m.entity_id AND e.org_id = m.org_id
    WHERE m.org_id = ${orgId} AND (m.valid_until IS NULL OR m.valid_until > now()) ORDER BY m.updated_at DESC LIMIT ${limit}`) as Memory[]
}

/** A person writes (or edits) a memory directly: pinned, so no agent can replace it. */
export async function writeByPerson(orgId: string, entityId: string, key: string, value: string, by: { userId: string; email?: string | null }, validUntil: string | null = null) {
  const [e] = (await sql`SELECT id FROM crm_entries WHERE id = ${entityId} AND org_id = ${orgId}`) as any[]
  if (!e) throw new Error("Contact not found in this workspace.")
  if (!KEY_RE.test(key)) throw new Error("A memory key is lowercase letters, numbers and underscores.")
  await sql`INSERT INTO entity_memory (org_id, entity_type, entity_id, key, value, source, pinned, valid_until, created_by)
    VALUES (${orgId}, 'crm_entry', ${entityId}, ${key}, ${value.slice(0, MAX_VALUE)}, 'person', true, ${validUntil}, ${by.userId})
    ON CONFLICT (org_id, entity_type, entity_id, key) DO UPDATE SET value = EXCLUDED.value, source = 'person', pinned = true, valid_until = EXCLUDED.valid_until, created_by = EXCLUDED.created_by, updated_at = now()`
  await recordChange({ actor: by, scope: { type: "org", id: orgId }, action: "memory.written", target: { type: "entity_memory", id: `${entityId}:${key}` }, before: null, after: { key, value: value.slice(0, MAX_VALUE) } })
}

export async function deleteMemory(orgId: string, id: string, by: { userId: string; email?: string | null }): Promise<boolean> {
  const rows = (await sql`DELETE FROM entity_memory WHERE id = ${id} AND org_id = ${orgId} RETURNING key, entity_id`) as any[]
  if (rows[0]) await recordChange({ actor: by, scope: { type: "org", id: orgId }, action: "memory.deleted", target: { type: "entity_memory", id }, before: { key: rows[0].key }, after: null })
  return !!rows[0]
}
