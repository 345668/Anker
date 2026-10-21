/**
 * An investor asks a fund to talk, and the fund answers (docs/architecture/61 sections 5 and 6, 64 B5).
 *
 * The request is an expression of interest, not an offer or an obligation. One open request per entity per fund (the database enforces it), a daily limit the fund sets, what is
 * shared is a copy with the time it was made, and the investor's contact address reaches the fund only when the fund accepts. A fund sees its own requests and nothing else.
 */
import { sql } from "@/lib/db"
import { fitFor, NOT_RAISING, type FundFit } from "./fit"
import { InvestorError, factsOf, requireEntity, getProfile, logEvent, relationshipEntityIds, type EntityView } from "./profile"
import { listedFund, type ListedFund } from "./listing"
import { blockedByFund } from "./talks"
import { nextStepFor, syncStages } from "./bridge"
import { LEGAL_VERSION, TEXTS } from "./legal"

export const OPEN_STAGES = ["interested", "in_talks", "invited_to_onboard", "onboarding", "on_hold"] as const
export const NOTE_MAX = 1000
export const TIMINGS = ["now", "this_quarter", "this_year", "exploring"] as const

/** What the investor may choose to share with this one fund. Name, country, category and interests are the default; the address only on acceptance. */
export interface ShareChoice { name: boolean; country: boolean; category: boolean; interests: boolean }
export const DEFAULT_SHARE: ShareChoice = { name: true, country: true, category: true, interests: true }

export interface RequestInput { entityId: string; fundId: string; indicativeMin?: unknown; indicativeMax?: unknown; timing?: unknown; note?: unknown; share?: Partial<ShareChoice> }

const amount = (v: unknown, field: string): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 1e12) throw new InvestorError(`${field} must be an amount between 0 and 1,000,000,000,000.`)
  return Math.round(n)
}

/** The copy of the entity that goes to the fund, made from what the investor chose to share. */
export function sharedCopy(e: EntityView, share: ShareChoice, now = new Date()) {
  return {
    at: now.toISOString(), choice: share,
    ...(share.name ? { name: e.legalName, kind: e.kind } : { kind: e.kind }),
    ...(share.country ? { country: e.country } : {}),
    ...(share.category ? { category: e.category, categoryNote: "self-declared by the investor" } : {}),
    ...(share.interests ? { interests: e.interests } : {}),
  }
}

export async function fitForEntity(userId: string, entityId: string, fund: ListedFund): Promise<{ entity: EntityView; fit: FundFit }> {
  const entity = await requireEntity(userId, entityId, "act")
  return { entity, fit: fitFor(factsOf(entity), fund.facts) }
}

export async function requestToConnect(userId: string, input: RequestInput): Promise<{ id: string; fit: FundFit }> {
  if (!(await getProfile(userId))) throw new InvestorError("Create your investor profile first.", 403, "no_profile")
  const fund = await listedFund(String(input.fundId ?? ""))
  if (!fund) throw new InvestorError("That fund is not listed.", 404, "not_listed")
  if (NOT_RAISING.has((fund.snapshot.status ?? "").toLowerCase())) throw new InvestorError("That fund is closed to new investors.", 409, "closed")
  if (await blockedByFund(userId, fund.facts.fundId)) throw new InvestorError("This fund is not able to take a request from you.", 403, "blocked")
  const { entity, fit } = await fitForEntity(userId, String(input.entityId ?? ""), fund)
  if (fund.rules.strict && fit.eligibility.status === "ineligible") throw new InvestorError(TEXTS.strictRefusal.text, 403, "ineligible")
  const note = String(input.note ?? "").trim()
  if (note.length > NOTE_MAX) throw new InvestorError(`Keep the note to ${NOTE_MAX} characters.`)
  const timing = input.timing == null || input.timing === "" ? null : String(input.timing)
  if (timing !== null && !(TIMINGS as readonly string[]).includes(timing)) throw new InvestorError("Choose when you could invest: now, this quarter, this year or still exploring.")
  const min = amount(input.indicativeMin, "The indicative minimum"), max = amount(input.indicativeMax, "The indicative maximum")
  if (min != null && max != null && min > max) throw new InvestorError("The indicative minimum cannot be above the maximum.")
  const share: ShareChoice = { ...DEFAULT_SHARE, ...(input.share ?? {}) }
  for (const k of Object.keys(share) as (keyof ShareChoice)[]) share[k] = share[k] === true

  // The fund's own limit on how many new requests it takes a day.
  const [today] = (await sql`SELECT count(*)::int AS n FROM fund_relationships WHERE fund_id = ${fund.facts.fundId} AND created_at > date_trunc('day', now())`) as any[]
  if (Number(today.n) >= fund.rules.dailyCap) throw new InvestorError("The fund is not taking more requests today. Please try again tomorrow.", 429, "cap")

  let row: any
  try {
    ;[row] = (await sql`INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage, initiated_by, indicative_min, indicative_max, timing, note, shared, eligibility_check, fit, statement_version)
      VALUES (${fund.facts.fundId}, ${entity.id}, ${userId}, 'interested', 'investor', ${min}, ${max}, ${timing}, ${note || null}, ${JSON.stringify(sharedCopy(entity, share))}::jsonb,
        ${JSON.stringify(fit.eligibility)}::jsonb, ${JSON.stringify({ score: fit.fit.score, confidence: fit.fit.confidence, listingVersion: fund.version })}::jsonb, ${LEGAL_VERSION}) RETURNING id`) as any[]
  } catch (e: any) {
    if (e?.code === "23505" || /fund_relationships_open_uq|duplicate key/i.test(String(e?.message))) throw new InvestorError("You already have an open request with this fund for this entity.", 409, "open")
    throw e
  }
  await logEvent(entity.id, userId, "request_sent", { fundId: fund.facts.fundId, fund: fund.snapshot.name })
  await notifyFund(fund.facts.fundId, String(row.id), fund.snapshot.name).catch((e) => console.warn("[investor-request] notify failed:", e?.message))
  return { id: String(row.id), fit }
}

/** In-app notification for the fund's owners and admins: that something is waiting, never what. */
async function notifyFund(fundId: string, relId: string, fundName: string) {
  const { createNotification } = await import("@/lib/notifications/store")
  const people = (await sql`SELECT m.user_id::text AS id, m.org_id FROM organizations o JOIN memberships m ON m.org_id = o.id WHERE o.fund_id = ${fundId} AND m.org_role IN ('workspace_owner', 'admin')`) as any[]
  for (const p of people) await createNotification({ userId: p.id, orgId: p.org_id, kind: "investor_request", title: `A new investor request for ${fundName}`, body: "An investor has asked to talk. Open the requests to answer.", href: "/dashboard/investor-requests", dedupeKey: `invreq:${relId}` })
}

export interface InvestorRequestView { id: string; fundId: string; fundName: string; entityId: string; entityName: string; stage: string; createdAt: string; decidedAt: string | null; note: string | null; message: string; nextStep: string | null }
const STAGE_MESSAGE: Record<string, string> = {
  interested: "Sent. The fund has not answered yet.", in_talks: "The fund accepted and wants to talk.", invited_to_onboard: "The fund has invited you to onboard.", onboarding: "You are onboarding with this fund.",
  active: "You are an investor in this fund.", on_hold: "On hold.", declined: "The fund is not able to take this forward.", withdrawn: "You withdrew this request.",
}
export async function myRequests(userId: string, opts: { entityId?: string } = {}): Promise<InvestorRequestView[]> {
  await syncStages().catch(() => {})
  const ids = (await relationshipEntityIds(userId)).filter((id) => !opts.entityId || id === opts.entityId)
  const rows = (await sql`SELECT r.id, r.fund_id, r.entity_id, r.stage, r.created_at, r.decided_at, r.note, l.snapshot->>'name' AS fund_name, e.legal_name, lp.onboarding_state
    FROM fund_relationships r JOIN investor_entities e ON e.id = r.entity_id LEFT JOIN fund_listings l ON l.fund_id = r.fund_id LEFT JOIN fund_lps lp ON lp.id = r.fund_lp_id WHERE r.entity_id::text = ANY(${ids}::text[]) ORDER BY r.created_at DESC LIMIT 100`) as any[]
  return rows.map((r) => ({ id: String(r.id), fundId: String(r.fund_id), fundName: r.fund_name ?? "A fund", entityId: String(r.entity_id), entityName: r.legal_name, stage: r.stage, createdAt: new Date(r.created_at).toISOString(),
    decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null, note: r.note ?? null, message: STAGE_MESSAGE[r.stage] ?? r.stage, nextStep: r.stage === "invited_to_onboard" || r.stage === "onboarding" || r.stage === "active" ? nextStepFor(r.onboarding_state) : null }))
}

/** The investor takes a request back. Allowed until the fund has invited them to onboard. */
export async function withdraw(userId: string, relId: string): Promise<void> {
  const ids = await relationshipEntityIds(userId, "act")
  const rows = (await sql`UPDATE fund_relationships SET stage = 'withdrawn', updated_at = now() WHERE id::text = ${relId} AND entity_id::text = ANY(${ids}::text[]) AND stage IN ('interested', 'in_talks', 'on_hold') RETURNING id, entity_id`) as any[]
  if (!rows.length) throw new InvestorError("That request cannot be withdrawn: it was not found, or it has moved on to onboarding.", 404, "not_found")
  await logEvent(String(rows[0].entity_id), userId, "request_withdrawn", { relationshipId: relId })
}

// ─── the fund's side ───────────────────────────────────────────────────────────

export interface InboundView {
  id: string; stage: string; createdAt: string; decidedAt: string | null; timing: string | null; note: string | null
  indicative: { min: number | null; max: number | null }
  shared: Record<string, unknown>; eligibility: { status: string; failed: string[]; unclear: string[] } | null; fit: { score: number | null; confidence: string } | null
  /** The investor's address, only once the fund has accepted. */
  contactEmail: string | null
  /** The fund's investor record, once invited, and where onboarding stands. */
  lpId: string | null; onboardingState: string | null
}
const obj = (v: any) => (v && typeof v === "object" ? v : typeof v === "string" ? (() => { try { return JSON.parse(v) } catch { return null } })() : null)

export async function inbound(fundId: string, opts: { stage?: string } = {}): Promise<InboundView[]> {
  await syncStages(fundId).catch(() => {})
  const rows = (await sql`SELECT r.*, p.email, lp.onboarding_state FROM fund_relationships r LEFT JOIN investor_entities ie ON ie.id = r.entity_id LEFT JOIN profiles p ON p.id::text = ie.user_id LEFT JOIN fund_lps lp ON lp.id = r.fund_lp_id
    WHERE r.fund_id = ${fundId} AND (${opts.stage ?? null}::text IS NULL OR r.stage = ${opts.stage ?? null}) ORDER BY r.created_at DESC LIMIT 200`) as any[]
  return rows.map((r) => ({
    id: String(r.id), stage: r.stage, createdAt: new Date(r.created_at).toISOString(), decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null, timing: r.timing ?? null, note: r.note ?? null,
    indicative: { min: r.indicative_min == null ? null : Number(r.indicative_min), max: r.indicative_max == null ? null : Number(r.indicative_max) },
    shared: obj(r.shared) ?? {}, eligibility: obj(r.eligibility_check), fit: obj(r.fit),
    lpId: r.fund_lp_id ?? null, onboardingState: r.onboarding_state ?? null,
    contactEmail: ["in_talks", "invited_to_onboard", "onboarding", "active"].includes(r.stage) ? r.email ?? null : null,
  }))
}

/** Accept (the fund wants to talk) or decline (quietly: no reason is shown as a verdict). Only a request still waiting can be decided. */
export async function decide(fundId: string, relId: string, decision: "accept" | "decline", by: string, reason?: string): Promise<{ stage: string }> {
  const stage = decision === "accept" ? "in_talks" : "declined"
  const rows = (await sql`UPDATE fund_relationships SET stage = ${stage}, decided_by = ${by}, decided_at = now(), reason = ${reason ? String(reason).slice(0, 500) : null}, updated_at = now()
    WHERE id::text = ${relId} AND fund_id = ${fundId} AND stage = 'interested' RETURNING id`) as any[]
  if (!rows.length) throw new InvestorError("That request was not found, or it has already been answered.", 404, "not_found")
  return { stage }
}
