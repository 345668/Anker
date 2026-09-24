/**
 * Founder matching runs, results, profiles and exclusions
 * (docs/architecture/14 §6). Replaces the 24-hour JSONB session cache: a run
 * is kept for 180 days, its results are rows that can be paged, filtered and
 * exported, and each run records which profile version produced it.
 *
 * Every read and write is scoped to the workspace (org): runs are the
 * company's fundraising work, shared by its members, never visible to
 * another workspace.
 */
import { sql } from "@/lib/db"
import type { FirmGroup, FounderMatchingResult, ScoredInvestorEntity, StartupProfile } from "./founder-types"

export type Scope = { userId: string; orgId: string }

// ─── Payload shaping ────────────────────────────────────────────────────────

const cut = (s: string | null | undefined, n: number) => (s && s.length > n ? s.slice(0, n) + "…" : s ?? null)

/** What a result row keeps of an entity: everything shown or exported, trimmed text, no raw records. */
function slim(e: ScoredInvestorEntity | null | undefined) {
  if (!e) return null
  return {
    id: e.id, kind: e.kind, name: e.name, title: e.title ?? null, type: e.type, location: e.location,
    sectors: e.sectors, stages: e.stages ?? [], website: e.website, linkedin: e.linkedin,
    email: e.email ?? null, emailStatus: e.emailStatus ?? null, firmId: e.firmId ?? null,
    checkSizeMin: e.checkSizeMin ?? null, checkSizeMax: e.checkSizeMax ?? null, portfolioCount: e.portfolioCount ?? null,
    score: e.score, tier: e.tier, whyMatch: e.whyMatch, reasons: e.reasons, tags: e.tags,
    components: e.components ?? null, gates: e.gates ?? [], investorClass: e.investorClass ?? null,
    country: e.country ?? null, seniority: e.seniority ?? null, inCrm: e.inCrm ?? false,
    lastInvestmentAt: e.lastInvestmentAt ?? null, lastInvestmentNote: e.lastInvestmentNote ?? null,
    lastInvestmentSource: (e as any).lastInvestmentSource ?? null,
    description: cut((e as any).description, 400), bio: cut(e.bio, 300), segments: (e as any).segments ?? [],
  }
}

export type SlimEntity = NonNullable<ReturnType<typeof slim>>
export interface GroupPayload { firm: SlimEntity; primary: SlimEntity | null; alternates: SlimEntity[]; scoreFrom: FirmGroup["scoreFrom"]; peopleScored: number }

// ─── Runs ───────────────────────────────────────────────────────────────────

/**
 * What a save actually managed to do (doc 20 §2.1).
 *
 * `shown.failed` is the important field: the match_shown write is telemetry
 * and must never fail a run, but a silent failure is how the CHECK-constraint
 * defect survived from matching v3 to doc 17 — every insert failed, every
 * failure became a console warning, and the count sat at zero while runs
 * reported healthy.
 */
export interface RunReceipt {
  runId: string
  groups: number
  independents: number
  shown: { recorded: number; failed: string | null }
}

export async function saveRun(
  result: FounderMatchingResult,
  startup: StartupProfile,
  scope: Scope,
  opts: { options?: Record<string, unknown>; profileVersionId?: string | null; showTop?: number } = {},
): Promise<RunReceipt> {
  await sql`
    INSERT INTO founder_match_runs (id, org_id, user_id, profile_version_id, engine_version, options, startup, totals,
                                    tier_counts, segment_counts, funnel, semantic, exclusions)
    VALUES (${result.sessionId}, ${scope.orgId}, ${scope.userId}, ${opts.profileVersionId ?? null}, ${result.engineVersion ?? "founder-v2"},
            ${JSON.stringify({ ...(opts.options ?? {}), weights: result.weightSource ?? "expert" })}::jsonb, ${JSON.stringify(startup)}::jsonb,
            ${JSON.stringify({ ...result.totals, qualifiedBeforeCap: result.qualifiedBeforeCap ?? null, emailVerification: result.emailVerification ?? null, durationMs: result.durationMs })}::jsonb,
            ${JSON.stringify(result.tierCounts)}::jsonb, ${JSON.stringify(result.segmentCounts)}::jsonb,
            ${JSON.stringify(result.funnel)}::jsonb, ${JSON.stringify(result.semantic ?? null)}::jsonb,
            ${JSON.stringify(result.exclusions ?? null)}::jsonb)`

  const rows = [
    ...(result.groups ?? []).map((g, i) => ({
      run_id: result.sessionId, kind: "group", rank: i + 1, entity_id: String(g.firm.id), firm_id: String(g.firm.id),
      score: g.firm.score, tier: g.firm.tier, name: g.firm.name, email_status: g.primary?.emailStatus ?? null,
      payload: { firm: slim(g.firm), primary: slim(g.primary), alternates: g.alternates.map(slim), scoreFrom: g.scoreFrom, peopleScored: g.peopleScored },
    })),
    ...(result.independents ?? []).map((p, i) => ({
      run_id: result.sessionId, kind: "independent", rank: i + 1, entity_id: String(p.id), firm_id: null,
      score: p.score, tier: p.tier, name: p.name, email_status: p.emailStatus ?? null, payload: { person: slim(p) },
    })),
  ]
  for (let i = 0; i < rows.length; i += 500) {
    await sql.unsafe(
      `INSERT INTO founder_match_results (run_id, kind, rank, entity_id, firm_id, score, tier, name, email_status, payload)
       SELECT run_id, kind, rank, entity_id, firm_id, score, tier, name, email_status, payload
         FROM jsonb_to_recordset($1::jsonb) AS x(run_id text, kind text, rank int, entity_id text, firm_id text,
              score real, tier text, name text, email_status text, payload jsonb)`,
      [JSON.stringify(rows.slice(i, i + 500))],
    )
  }

  // What the founder was shown — the first labelled data for learning (doc 10 L11).
  const shown = (result.groups ?? []).slice(0, opts.showTop ?? 200)
  let recorded = 0
  let failed: string | null = null
  if (shown.length) {
    try {
      await sql.unsafe(
        `INSERT INTO match_outcome_events (user_id, event_type, source, subject_id, firm_id, investor_id, match_score, metadata)
         SELECT $1, 'match_shown', 'founder_match', x.subject_id, x.firm_id, x.investor_id, x.score, x.metadata
           FROM jsonb_to_recordset($2::jsonb) AS x(subject_id text, firm_id text, investor_id text, score int, metadata jsonb)`,
        [scope.userId, JSON.stringify(shown.map((g, i) => ({
          subject_id: `${result.sessionId}:${g.firm.id}`, firm_id: String(g.firm.id), investor_id: g.primary?.id ?? null,
          score: Math.round(g.firm.score), metadata: { runId: result.sessionId, rank: i + 1, orgId: scope.orgId },
        })))],
      )
      recorded = shown.length
    } catch (e: any) {
      // Never fails the run — but never invisible either (doc 20 §2.1).
      failed = String(e?.message ?? e).slice(0, 300)
      console.error(`[founder-runs] match_shown NOT recorded for run ${result.sessionId}: ${failed}`)
    }
    // The run says, in its own row, whether the evidence about it was written.
    await sql`UPDATE founder_match_runs
                 SET totals = totals || ${JSON.stringify({ shownRecorded: recorded, shownFailed: failed })}::jsonb
               WHERE id = ${result.sessionId}`.catch(() => {})
  }

  return {
    runId: result.sessionId,
    groups: (result.groups ?? []).length,
    independents: (result.independents ?? []).length,
    shown: { recorded, failed },
  }
}

export interface RunSummary {
  id: string; createdAt: string; engineVersion: string; startupName: string; totals: any; tierCounts: any
  segmentCounts: any; funnel: any; semantic: any; exclusions: any; options: any; startup: StartupProfile
}

function toSummary(r: any): RunSummary {
  return {
    id: r.id, createdAt: new Date(r.created_at).toISOString(), engineVersion: r.engine_version, startupName: r.startup?.name ?? "",
    totals: r.totals, tierCounts: r.tier_counts, segmentCounts: r.segment_counts, funnel: r.funnel, semantic: r.semantic,
    exclusions: r.exclusions, options: r.options, startup: r.startup,
  }
}

export async function getRun(runId: string, scope: Scope): Promise<RunSummary | null> {
  const [r] = await sql`SELECT * FROM founder_match_runs WHERE id = ${runId} AND org_id = ${scope.orgId} AND expires_at > now()`
  return r ? toSummary(r) : null
}

export async function listRuns(scope: Scope, limit = 20): Promise<RunSummary[]> {
  const rows = await sql`SELECT * FROM founder_match_runs WHERE org_id = ${scope.orgId} AND expires_at > now() ORDER BY created_at DESC LIMIT ${limit}`
  return rows.map(toSummary)
}

export interface ResultQuery {
  kind: "group" | "independent"
  page?: number
  limit?: number
  tier?: string | null
  emailStatus?: string | null
  q?: string | null
}

export async function pageResults(runId: string, scope: Scope, query: ResultQuery) {
  const run = await getRun(runId, scope)
  if (!run) return null
  const limit = Math.max(1, Math.min(200, query.limit ?? 50))
  const page = Math.max(1, query.page ?? 1)
  const params: unknown[] = [runId, query.kind]
  const where = ["run_id = $1", "kind = $2"]
  if (query.tier) { params.push(query.tier); where.push(`tier = $${params.length}`) }
  if (query.emailStatus) { params.push(query.emailStatus); where.push(`email_status = $${params.length}`) }
  if (query.q?.trim()) { params.push(`%${query.q.trim().replace(/[\\%_]/g, "\\$&")}%`); where.push(`(name ILIKE $${params.length} OR payload::text ILIKE $${params.length})`) }
  const [count] = await sql.unsafe(`SELECT count(*)::int AS n FROM founder_match_results WHERE ${where.join(" AND ")}`, params)
  params.push(limit, (page - 1) * limit)
  const rows = await sql.unsafe(
    `SELECT rank, score, tier, name, email_status, payload FROM founder_match_results
      WHERE ${where.join(" AND ")} ORDER BY rank LIMIT $${params.length - 1} OFFSET $${params.length}`, params)
  return { run, total: Number(count?.n ?? 0), page, limit, rows: rows.map((r: any) => ({ rank: r.rank, score: r.score, tier: r.tier, name: r.name, emailStatus: r.email_status, ...r.payload })) }
}

/** Every result of a run, for exports (rank order). */
export async function allResults(runId: string, scope: Scope): Promise<{ run: RunSummary; groups: GroupPayload[]; independents: SlimEntity[] } | null> {
  const run = await getRun(runId, scope)
  if (!run) return null
  const rows = await sql`SELECT kind, payload FROM founder_match_results WHERE run_id = ${runId} ORDER BY kind, rank`
  return {
    run,
    groups: rows.filter((r: any) => r.kind === "group").map((r: any) => r.payload),
    independents: rows.filter((r: any) => r.kind === "independent").map((r: any) => r.payload.person),
  }
}

/** Rebuild the result shape the existing workbook and reports take. */
export function toMatchingResult(data: NonNullable<Awaited<ReturnType<typeof allResults>>>): FounderMatchingResult {
  const { run, groups, independents } = data
  const firms = groups.map((g) => g.firm) as any[]
  const primaries = groups.map((g) => g.primary).filter(Boolean) as any[]
  return {
    sessionId: run.id, startupProfileId: run.startup.id, startupName: run.startupName, ranAt: run.createdAt,
    durationMs: run.totals?.durationMs ?? 0, funnel: run.funnel, totals: run.totals, tierCounts: run.tierCounts,
    segmentCounts: run.segmentCounts, firms, contacts: [...primaries, ...independents] as any[],
    engineVersion: run.engineVersion, semantic: run.semantic, exclusions: run.exclusions,
    groups: groups.map((g) => ({ ...g, firm: g.firm as any, primary: g.primary as any, alternates: g.alternates as any[] })),
    independents: independents as any[],
    qualifiedBeforeCap: run.totals?.qualifiedBeforeCap ?? undefined,
  }
}

// ─── Profiles (docs/architecture/14 §8) ─────────────────────────────────────

export async function latestProfile(scope: Scope): Promise<{ id: string; version: number; fields: any; provenance: any; createdAt: string } | null> {
  const [r] = await sql`SELECT * FROM startup_profiles WHERE org_id = ${scope.orgId} ORDER BY version DESC LIMIT 1`
  return r ? { id: r.id, version: r.version, fields: r.fields, provenance: r.provenance, createdAt: new Date(r.created_at).toISOString() } : null
}

/** Save a new version; returns its id. Unchanged fields do not create a version. */
export async function saveProfile(scope: Scope, fields: Record<string, unknown>, provenance: Record<string, string>): Promise<{ id: string; version: number }> {
  const latest = await latestProfile(scope)
  if (latest && JSON.stringify(latest.fields) === JSON.stringify(fields) && JSON.stringify(latest.provenance) === JSON.stringify(provenance)) {
    return { id: latest.id, version: latest.version }
  }
  const version = (latest?.version ?? 0) + 1
  const id = `spv_${crypto.randomUUID()}`
  await sql`INSERT INTO startup_profiles (id, org_id, version, fields, provenance, created_by)
            VALUES (${id}, ${scope.orgId}, ${version}, ${JSON.stringify(fields)}::jsonb, ${JSON.stringify(provenance)}::jsonb, ${scope.userId})`
  return { id, version }
}

// ─── Exclusions (doc 11 §6) ─────────────────────────────────────────────────

export async function setExclusion(scope: Scope, entityKey: string, excluded: boolean, reason: string | null = null) {
  if (!/^(firm|contact):[\w-]{1,200}$/.test(entityKey)) throw new Error("invalid entity key")
  if (excluded) {
    await sql`INSERT INTO founder_match_exclusions (org_id, entity_key, reason, created_by) VALUES (${scope.orgId}, ${entityKey}, ${reason}, ${scope.userId})
              ON CONFLICT (org_id, entity_key) DO UPDATE SET reason = EXCLUDED.reason`
  } else {
    await sql`DELETE FROM founder_match_exclusions WHERE org_id = ${scope.orgId} AND entity_key = ${entityKey}`
  }
}
