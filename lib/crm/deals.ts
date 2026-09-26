import { sql } from "@/lib/db"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { recordStageTransition } from "@/lib/matching/outcome-events"
import { canonicalizeStage, definitionFor, stageByKey, type CrmDefinition, type CrmPersona } from "@/lib/crm/definitions"

/**
 * Read and write the CRM entity tables (crm_deals / crm_people / crm_companies).
 * Doc: docs/architecture/25-per-persona-crm.md, phase 3.
 *
 * Every query filters on `scope_key`, which the database generates from `org_id`
 * (doc 00 §2.2) — so it is derived, never accepted from a caller. `created_by`
 * records authorship and is deliberately not used for isolation (doc 03 §0).
 */

export type DealRow = {
  id: string
  stage: string
  companyId: string | null
  companyName: string | null
  personId: string | null
  boardId: string | null
  displayName: string
  displayTitle: string | null
  displayEmail: string | null
  displayLinkedin: string | null
  displayLocation: string | null
  displayType: string | null
  displayScore: number | null
  displayTier: string | null
  whyMatch: string | null
  notes: string | null
  owner: string | null
  tags: string[]
  source: string | null
  sourceSessionId: string | null
  addedAt: string | null
  lastContactedAt: string | null
  activityCount: number
}

const iso = (v: unknown): string | null => {
  if (!v) return null
  try { return new Date(v as string).toISOString() } catch { return null }
}

/**
 * The pipeline for one workspace.
 *
 * A deal's display name is its contact's when it has one, otherwise its company's
 * — a firm-level deal has no person, and falling back keeps it from rendering as a
 * blank row. Ordered so the highest-scoring unworked records surface first, which
 * is what the previous page did and what the list is for.
 */
export async function listDeals(scopeKey: string, limit = 5000): Promise<DealRow[]> {
  const rows = await sql`
    SELECT d.id, d.stage, d.company_id, d.person_id, d.board_id,
           d.score, d.tier, d.why_match, d.notes, d.owner, d.tags,
           d.source, d.source_session_id, d.added_at, d.last_contacted_at,
           c.name  AS company_name,
           c.location AS company_location,
           c.kind  AS company_kind,
           p.name  AS person_name,
           p.title AS person_title,
           p.email AS person_email,
           p.linkedin AS person_linkedin,
           p.location AS person_location,
           (SELECT count(*) FROM crm_activities a
             WHERE a.subject_type = 'deal' AND a.subject_id = d.id)::int AS activity_count
      FROM crm_deals d
      LEFT JOIN crm_companies c ON c.id = d.company_id
      LEFT JOIN crm_people    p ON p.id = d.person_id
     WHERE d.scope_key = ${scopeKey}
     ORDER BY d.score DESC NULLS LAST, d.added_at DESC
     LIMIT ${limit}
  `
  return rows.map((r: any) => ({
    id: r.id,
    stage: r.stage,
    companyId: r.company_id ?? null,
    companyName: r.company_name ?? null,
    personId: r.person_id ?? null,
    boardId: r.board_id ?? null,
    displayName: r.person_name ?? r.company_name ?? "Unnamed",
    displayTitle: r.person_title ?? null,
    displayEmail: r.person_email ?? null,
    displayLinkedin: r.person_linkedin ?? null,
    displayLocation: r.person_location ?? r.company_location ?? null,
    displayType: r.company_kind ?? null,
    displayScore: r.score ?? null,
    displayTier: r.tier ?? null,
    whyMatch: r.why_match ?? null,
    notes: r.notes ?? null,
    owner: r.owner ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    source: r.source ?? null,
    sourceSessionId: r.source_session_id ?? null,
    addedAt: iso(r.added_at),
    lastContactedAt: iso(r.last_contacted_at),
    activityCount: r.activity_count ?? 0,
  }))
}

export type DealPatch = {
  stage?: string
  notes?: string | null
  owner?: string | null
  tags?: string[]
  tier?: string | null
  boardId?: string | null
}

/**
 * Apply a patch to one deal, and record a stage change as an activity.
 *
 * `stage` is validated against the persona's definition rather than a CHECK
 * constraint (the table is shared across personas), so an out-of-pipeline value is
 * refused here with a message naming what is allowed instead of being stored and
 * discovered later by a funnel that does not add up.
 */
export async function patchDeal(
  scopeKey: string,
  persona: CrmPersona,
  actorId: string,
  id: string,
  patch: DealPatch,
): Promise<void> {
  const def = definitionFor(persona)

  // firm_id / investor_id live on the linked company and person, not on the deal —
  // the ranker keys off them, so they are fetched here rather than reconstructed.
  const [current] = await sql`
    SELECT d.id, d.stage, d.org_id, d.score, d.source, d.migrated_from_entry_id,
           c.firm_id, p.investor_id
      FROM crm_deals d
      LEFT JOIN crm_companies c ON c.id = d.company_id
      LEFT JOIN crm_people    p ON p.id = d.person_id
     WHERE d.id = ${id} AND d.scope_key = ${scopeKey}
  `
  if (!current) throw new WorkspaceError("That record is not in this workspace.", 404)

  let nextStage: string | null = null
  if (patch.stage !== undefined) {
    const resolved = stageByKey(def, patch.stage)
    if (!resolved) throw new WorkspaceError(stageRefusal(def, patch.stage), 400)
    nextStage = resolved.key
  }

  // A stage move is also the only reliable signal of contact for the funnel's
  // staleness maths, so advancing past the entry stage stamps last_contacted_at
  // when nothing else has.
  const entryStage = def.stages[0]?.key
  const stamps = nextStage && nextStage !== entryStage

  // Only the keys actually supplied are carried, so `notes: null` clears the
  // field while an absent `notes` leaves it alone. A COALESCE per column could
  // not tell those two apart and would silently turn every clear into a no-op.
  const patched = JSON.stringify({
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
    ...(patch.tier !== undefined ? { tier: patch.tier } : {}),
    ...(patch.boardId !== undefined ? { board_id: patch.boardId } : {}),
    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
  })

  await sql`
    UPDATE crm_deals SET
      stage      = COALESCE(${nextStage}, stage),
      notes      = CASE WHEN ${patched}::jsonb ? 'notes'    THEN ${patched}::jsonb->>'notes'    ELSE notes END,
      owner      = CASE WHEN ${patched}::jsonb ? 'owner'    THEN ${patched}::jsonb->>'owner'    ELSE owner END,
      tier       = CASE WHEN ${patched}::jsonb ? 'tier'     THEN ${patched}::jsonb->>'tier'     ELSE tier END,
      board_id   = CASE WHEN ${patched}::jsonb ? 'board_id' THEN ${patched}::jsonb->>'board_id' ELSE board_id END,
      tags       = CASE WHEN ${patched}::jsonb ? 'tags'
                        THEN ARRAY(SELECT jsonb_array_elements_text(${patched}::jsonb->'tags'))
                        ELSE tags END,
      updated_at = now()
    WHERE id = ${id} AND scope_key = ${scopeKey}
  `

  if (nextStage && nextStage !== current.stage) {
    await recordActivity(current.org_id, actorId, {
      kind: "stage_change",
      subjectType: "deal",
      subjectId: id,
      subject: `${labelOf(def, current.stage)} → ${labelOf(def, nextStage)}`,
      metadata: { from: current.stage, to: nextStage },
    })
    if (stamps) {
      await sql`UPDATE crm_deals SET last_contacted_at = COALESCE(last_contacted_at, now()) WHERE id = ${id} AND scope_key = ${scopeKey}`
    }
    // Keep feeding the learned ranker. /api/crm/entries/[id] does this on every
    // stage change, so a cutover that moved writes to crm_deals without it would
    // stop the ranker receiving training labels — and stop it silently, which is
    // the whole reason §3.3 keeps stage keys canonical.
    await recordStageTransition({
      userId: actorId,
      source: "crm_entry",
      subjectId: current.migrated_from_entry_id ?? id,
      firmId: current.firm_id ?? null,
      investorId: current.investor_id ?? null,
      matchScore: current.score ?? null,
      prevStage: current.stage ?? null,
      newStage: nextStage,
      metadata: { crmSource: current.source ?? null, via: "crm_deals" },
    })
  }
}

function labelOf(def: CrmDefinition, key: string): string {
  return stageByKey(def, key)?.label ?? canonicalizeStage(key) ?? key
}

function stageRefusal(def: CrmDefinition, given: string): string {
  const allowed = def.stages.map((s) => s.label).join(", ")
  return `"${given}" is not a stage in this pipeline. Use one of: ${allowed}.`
}

export type ActivityInput = {
  kind: "meeting" | "call" | "email" | "note" | "stage_change" | "task_done"
  subjectType: "company" | "person" | "deal"
  subjectId: string
  subject?: string | null
  body?: string | null
  metadata?: Record<string, unknown>
  occurredAt?: string | null
}

/** Append an activity. The table rejects UPDATE and DELETE, so this is the only way in. */
export async function recordActivity(orgId: string, actorId: string, input: ActivityInput): Promise<void> {
  await sql`
    INSERT INTO crm_activities (org_id, kind, subject_type, subject_id, subject, body, metadata, occurred_at, created_by)
    VALUES (${orgId}, ${input.kind}, ${input.subjectType}, ${input.subjectId},
            ${input.subject ?? null}, ${input.body ?? null},
            ${JSON.stringify(input.metadata ?? {})}::jsonb,
            COALESCE(${input.occurredAt ?? null}::timestamptz, now()), ${actorId})
  `
}

export type ActivityRow = {
  id: string
  kind: string
  subject: string | null
  body: string | null
  occurredAt: string | null
  createdBy: string | null
}

export async function listActivities(scopeKey: string, dealId: string, limit = 100): Promise<ActivityRow[]> {
  const rows = await sql`
    SELECT id, kind, subject, body, occurred_at, created_by
      FROM crm_activities
     WHERE scope_key = ${scopeKey} AND subject_type = 'deal' AND subject_id = ${dealId}
     ORDER BY occurred_at DESC
     LIMIT ${limit}
  `
  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    subject: r.subject ?? null,
    body: r.body ?? null,
    occurredAt: iso(r.occurred_at),
    createdBy: r.created_by ?? null,
  }))
}

/** Per-stage counts for the funnel, in the definition's order. */
export async function stageCounts(scopeKey: string, persona: CrmPersona): Promise<{ key: string; label: string; count: number }[]> {
  const def = definitionFor(persona)
  const rows = await sql`
    SELECT stage, count(*)::int AS n FROM crm_deals WHERE scope_key = ${scopeKey} GROUP BY stage
  `
  const counts = new Map<string, number>(rows.map((r: any) => [r.stage, r.n]))
  return def.stages.map((s) => ({ key: s.key, label: s.label, count: counts.get(s.key) ?? 0 }))
}
