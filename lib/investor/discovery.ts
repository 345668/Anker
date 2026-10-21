/**
 * Opt-in discoverability (docs/architecture/71). An entity's owner may let funds find a limited card; a listed fund may invite it to connect. Off by platform flag and off per entity.
 * A card never carries a name, an address, a team or a user id; an invitation has no free text.
 */
import { sql } from "@/lib/db"
import { EMAILS, LEGAL_VERSION } from "./legal"
import { fitFor, NOT_RAISING, type FundFit } from "./fit"
import { InvestorError, factsOf, interestsOf, logEvent, relationshipEntityIds, requireEntity, type EntityView } from "./profile"
import { listedFund } from "./listing"
import { DEFAULT_SHARE, sharedCopy, type ShareChoice } from "./requests"

export const FLAG = "investor_discoverability"
/** Cards are shown only when at least this many entities have opted in, so a card cannot point to one person. Proposed; counsel to confirm. */
export const DISCOVERY_MIN_POOL = 10
export const FUND_INVITES_PER_DAY = 20, DECLINE_COOLDOWN_DAYS = 90, CARDS_MAX = 50
type Send = (m: { to: string; subject: string; text: string }) => Promise<void>
const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
const defaultSend: Send = async (m) => {
  const { isResendConfigured, sendEmail } = await import("@/lib/email/resend")
  if (!isResendConfigured()) return
  await sendEmail({ ...m, noTracking: true })
}

export async function discoverabilityOpen(): Promise<boolean> {
  try { const [r] = (await sql`SELECT enabled FROM platform_flags WHERE key = ${FLAG}`) as any[]; return !!r?.enabled } catch { return false }
}
const CLOSED = () => new InvestorError("Finding investors is not open yet.", 403, "closed")

// ─── the investor's switch ─────────────────────────────────────────────────────

/** Only the owner. Turning it on needs the flag; turning it off always works. */
export async function setDiscoverable(userId: string, entityId: string, on: boolean): Promise<{ discoverable: boolean }> {
  const e = await requireEntity(userId, entityId, "view")
  if (e.role !== "owner") throw new InvestorError("Only the owner of this entity can change this.", 403, "owner_only")
  if (on && !(await discoverabilityOpen())) throw CLOSED()
  await sql`UPDATE investor_entities SET discoverable = ${on}, discoverable_at = ${on ? new Date().toISOString() : null}, discoverable_version = ${on ? LEGAL_VERSION : null}, updated_at = now() WHERE id = ${entityId}`
  await logEvent(entityId, userId, on ? "discoverable_on" : "discoverable_off")
  return { discoverable: on }
}
export async function discoverableState(userId: string, entityId: string): Promise<{ discoverable: boolean; open: boolean }> {
  await requireEntity(userId, entityId, "view")
  const [r] = (await sql`SELECT discoverable FROM investor_entities WHERE id = ${entityId}`) as any[]
  return { discoverable: !!r?.discoverable, open: await discoverabilityOpen() }
}

// ─── the fund's search ─────────────────────────────────────────────────────────

export interface Card {
  cardId: string; kind: string; country: string | null; category: string | null; categoryNote: string
  interests: { sectors: string[]; stages: string[]; geographies: string[]; ticketMin: number | null; ticketMax: number | null; horizonYears: number | null }
  eligibility: string; score: number | null; confidence: string; sentence: string; invited: boolean
}
const cardOf = (e: any, fit: FundFit, invited: boolean): Card => {
  const i = interestsOf(e.interests)
  return { cardId: String(e.id), kind: e.kind, country: e.country ?? null, category: e.category ?? null, categoryNote: "self-declared by the investor",
    interests: i,
    eligibility: fit.eligibility.status, score: fit.fit.score, confidence: fit.fit.confidence, sentence: fit.sentence, invited }
}
async function listedOrThrow(fundId: string) {
  if (!(await discoverabilityOpen())) throw CLOSED()
  const f = await listedFund(fundId)
  if (!f) throw new InvestorError("List your fund to investors first: set who may invest and switch it on.", 409, "not_listed")
  return f
}

/** Opt-in entities that this fund's own rules allow, best fit first. No ineligible entity is ever returned. */
export async function searchForFund(fundId: string): Promise<Card[]> {
  const fund = await listedOrThrow(fundId)
  const [pool] = (await sql`SELECT count(*)::int n FROM investor_entities WHERE discoverable = true AND archived_at IS NULL`) as any[]
  if (Number(pool.n) < DISCOVERY_MIN_POOL) return []
  const rows = (await sql`SELECT e.id, e.kind, e.country, e.tax_residence, e.category, e.interests FROM investor_entities e WHERE e.discoverable = true AND e.archived_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM fund_relationships r WHERE r.fund_id = ${fundId} AND r.entity_id = e.id AND r.stage IN ('interested', 'in_talks', 'invited_to_onboard', 'onboarding', 'on_hold', 'active'))
    AND NOT EXISTS (SELECT 1 FROM fund_connect_invites i WHERE i.fund_id = ${fundId} AND i.entity_id = e.id AND i.status = 'declined' AND i.answered_at > now() - make_interval(days => ${DECLINE_COOLDOWN_DAYS}))
    LIMIT 2000`) as any[]
  const live = new Set(((await sql`SELECT entity_id FROM fund_connect_invites WHERE fund_id = ${fundId} AND status = 'sent'`) as any[]).map((r) => String(r.entity_id)))
  const ORDER: Record<string, number> = { eligible: 0, unclear: 1 }
  return rows
    .map((e) => ({ e, fit: fitFor(factsOf({ country: e.country ?? null, taxResidence: e.tax_residence ?? null, category: e.category ?? null, interests: interestsOf(e.interests) }), fund.facts) }))
    .filter((x) => x.fit.eligibility.status !== "ineligible")
    .sort((a, b) => ORDER[a.fit.eligibility.status] - ORDER[b.fit.eligibility.status] || (b.fit.fit.score ?? -1) - (a.fit.fit.score ?? -1))
    .slice(0, CARDS_MAX)
    .map((x) => cardOf(x.e, x.fit, live.has(String(x.e.id))))
}

// ─── the invitation ────────────────────────────────────────────────────────────

async function teamEmails(entityId: string): Promise<string[]> {
  return ((await sql`SELECT DISTINCT p.email FROM profiles p WHERE p.email IS NOT NULL AND p.id::text IN (SELECT user_id FROM investor_entities WHERE id = ${entityId} UNION SELECT user_id FROM investor_entity_members WHERE entity_id = ${entityId} AND role = 'can_act')`) as any[]).map((r) => String(r.email))
}
export async function inviteEntity(fundId: string, by: string, cardId: string, send: Send = defaultSend): Promise<{ id: string }> {
  const fund = await listedOrThrow(fundId)
  if (NOT_RAISING.has((fund.snapshot.status ?? "").toLowerCase())) throw new InvestorError("Your fund is closed to new investors.", 409, "closed")
  const cards = await searchForFund(fundId)
  const card = cards.find((c) => c.cardId === cardId)
  if (!card) throw new InvestorError("That investor is no longer available to invite.", 404, "not_found")
  const [n] = (await sql`SELECT count(*)::int n FROM fund_connect_invites WHERE fund_id = ${fundId} AND created_at > now() - interval '1 day'`) as any[]
  if (Number(n.n) >= FUND_INVITES_PER_DAY) throw new InvestorError("You have sent the most invitations allowed in a day. Try again tomorrow.", 429, "cap")
  let row: any
  try { [row] = (await sql`INSERT INTO fund_connect_invites (fund_id, entity_id, invited_by, card) VALUES (${fundId}, ${cardId}::uuid, ${by}, ${JSON.stringify(card)}::jsonb) RETURNING id`) as any[] }
  catch (e: any) { if (e?.code === "23505") throw new InvestorError("You have already invited this investor.", 409, "exists"); throw e }
  await logEvent(cardId, by, "fund_invited", { fund: fund.snapshot.name })
  for (const to of await teamEmails(cardId)) await send({ to, ...EMAILS.fundInvite({ url: appUrl() }) }).catch(() => {})
  return { id: String(row.id) }
}
export async function withdrawInvite(fundId: string, inviteId: string): Promise<void> {
  const rows = (await sql`UPDATE fund_connect_invites SET status = 'withdrawn', answered_at = now() WHERE id::text = ${inviteId} AND fund_id = ${fundId} AND status = 'sent' RETURNING id`) as any[]
  if (!rows.length) throw new InvestorError("That invitation was not found, or it has been answered.", 404, "not_found")
}
/** The fund's own invitations. An entity's identity is not part of this until it accepts and becomes an ordinary conversation. */
export async function invitesOfFund(fundId: string): Promise<Array<{ id: string; status: string; createdAt: string; answeredAt: string | null; card: Card }>> {
  const rows = (await sql`SELECT id, status, created_at, answered_at, card FROM fund_connect_invites WHERE fund_id = ${fundId} ORDER BY created_at DESC LIMIT 200`) as any[]
  return rows.map((r) => ({ id: String(r.id), status: r.status === "declined" ? "not taken forward" : r.status, createdAt: new Date(r.created_at).toISOString(), answeredAt: r.answered_at ? new Date(r.answered_at).toISOString() : null, card: typeof r.card === "string" ? JSON.parse(r.card) : r.card }))
}

// ─── the investor's answer ─────────────────────────────────────────────────────

export interface InviteView { id: string; entityId: string; entityName: string; fundId: string; fundName: string; summary: string | null; whoMayInvest: string | null; createdAt: string }
export async function invitesForMe(userId: string): Promise<InviteView[]> {
  const ids = await relationshipEntityIds(userId)
  const rows = (await sql`SELECT i.id, i.entity_id, i.fund_id, i.created_at, e.legal_name, l.snapshot FROM fund_connect_invites i JOIN investor_entities e ON e.id = i.entity_id LEFT JOIN fund_listings l ON l.fund_id = i.fund_id
    WHERE i.status = 'sent' AND i.entity_id::text = ANY(${ids}::text[]) ORDER BY i.created_at DESC`) as any[]
  return rows.map((r) => { const s = typeof r.snapshot === "string" ? JSON.parse(r.snapshot) : r.snapshot ?? {}
    return { id: String(r.id), entityId: String(r.entity_id), entityName: r.legal_name, fundId: String(r.fund_id), fundName: s.name ?? "A fund", summary: s.strategy ?? s.description ?? null, whoMayInvest: s.whoMayInvest ?? null, createdAt: new Date(r.created_at).toISOString() } })
}
export async function answerInvite(userId: string, inviteId: string, action: "accept" | "decline", share: Partial<ShareChoice> = {}): Promise<{ stage?: string; relationshipId?: string }> {
  const [inv] = (await sql`SELECT * FROM fund_connect_invites WHERE id::text = ${inviteId} AND status = 'sent'`) as any[]
  if (!inv) throw new InvestorError("That invitation was not found, or it has been answered.", 404, "not_found")
  const entity: EntityView = await requireEntity(userId, String(inv.entity_id), "act")
  if (action === "decline") {
    await sql`UPDATE fund_connect_invites SET status = 'declined', answered_at = now() WHERE id = ${inv.id}`
    await logEvent(entity.id, userId, "invitation_declined", { fundId: inv.fund_id })
    return {}
  }
  const fund = await listedFund(String(inv.fund_id))
  if (!fund) throw new InvestorError("That fund is no longer listed.", 409, "not_listed")
  const choice: ShareChoice = { ...DEFAULT_SHARE, ...share }
  for (const k of Object.keys(choice) as (keyof ShareChoice)[]) choice[k] = choice[k] === true
  const fit = fitFor(factsOf(entity), fund.facts)
  let rel: any
  try {
    ;[rel] = (await sql`INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage, initiated_by, shared, eligibility_check, fit, decided_by, decided_at, statement_version)
      VALUES (${inv.fund_id}, ${entity.id}, ${userId}, 'in_talks', 'fund', ${JSON.stringify(sharedCopy(entity, choice))}::jsonb, ${JSON.stringify(fit.eligibility)}::jsonb,
        ${JSON.stringify({ score: fit.fit.score, confidence: fit.fit.confidence, listingVersion: fund.version })}::jsonb, ${inv.invited_by}, now(), ${LEGAL_VERSION}) RETURNING id`) as any[]
  } catch (e: any) {
    if (e?.code === "23505") throw new InvestorError("This entity already has an open relationship with that fund.", 409, "open")
    throw e
  }
  await sql`UPDATE fund_connect_invites SET status = 'accepted', answered_at = now(), relationship_id = ${String(rel.id)}::uuid WHERE id = ${inv.id}`
  await logEvent(entity.id, userId, "invitation_accepted", { fundId: inv.fund_id })
  const people = (await sql`SELECT m.user_id::text AS id, m.org_id FROM organizations o JOIN memberships m ON m.org_id = o.id WHERE o.fund_id = ${inv.fund_id} AND m.org_role IN ('workspace_owner', 'admin')`) as any[]
  const { createNotification } = await import("@/lib/notifications/store")
  for (const p of people) await createNotification({ userId: p.id, orgId: p.org_id, kind: "investor_request", title: "An investor accepted your invitation", body: "Open the investor requests to start the conversation.", href: "/dashboard/investor-requests", dedupeKey: `invacc:${rel.id}` }).catch(() => {})
  return { stage: "in_talks", relationshipId: String(rel.id) }
}
