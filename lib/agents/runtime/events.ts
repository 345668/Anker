/** Events agents can listen for. docs/architecture/45 §3. emit() is called where a fact happens, never from a model, and never throws. */
import { sql } from "@/lib/db"

/** An agent must not act on stale news. */
export const EVENT_TTL_DAYS = 7

export async function emit(orgId: string, kind: string, subjectId: string | null, payload: Record<string, unknown> = {}): Promise<void> {
  try {
    await sql`INSERT INTO agent_events (org_id, kind, subject_id, payload) VALUES (${orgId}, ${kind}, ${subjectId}, ${JSON.stringify(payload)}::jsonb)`
  } catch (e) { console.error("[agent events] emit failed:", (e as Error)?.message) }
}
