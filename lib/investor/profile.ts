/**
 * The investor's own profile and investing entities (docs/architecture/61 section 4, 64 B1). They belong to the person. A fund never reads this directly: what it sees of an
 * investor is the copy the investor chose to share with that fund (lib/investor/requests.ts).
 */
import { sql } from "@/lib/db"
import { CATEGORIES, type Category, type EntityFacts, type Interests } from "./fit"

export class InvestorError extends Error { constructor(message: string, readonly status = 400, readonly code = "invalid") { super(message); this.name = "InvestorError" } }

export const ENTITY_KINDS = ["individual", "company", "trust", "fund", "family_office"] as const
export type EntityKind = (typeof ENTITY_KINDS)[number]
export const MAX_ENTITIES = 10
export const TERMS_VERSION = "2026-10"

const text = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max)
const strList = (v: unknown, n: number, each: number): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : []).map((x) => text(x, each)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, n)
const money = (v: unknown, field: string): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 1e12) throw new InvestorError(`${field} must be an amount between 0 and 1,000,000,000,000.`)
  return Math.round(n)
}

export interface EntityInput { legalName: string; kind: EntityKind; country: string | null; taxResidence: string | null; category: Category | null; interests: Interests }

/** Reads what a person typed into an entity, refusing what cannot be kept. Pure. */
export function readEntity(raw: any): EntityInput {
  const legalName = text(raw?.legalName, 200)
  if (legalName.length < 2) throw new InvestorError("Give the name of who is investing (at least two characters).")
  const kind = String(raw?.kind ?? "individual")
  if (!(ENTITY_KINDS as readonly string[]).includes(kind)) throw new InvestorError("Choose individual, company, trust, fund or family office.")
  const category = raw?.category === null || raw?.category === undefined || raw?.category === "" ? null : String(raw.category)
  if (category !== null && !(CATEGORIES as readonly string[]).includes(category)) throw new InvestorError("Choose professional, semi-professional, other or not sure.")
  const i = raw?.interests ?? {}
  const ticketMin = money(i.ticketMin, "The smallest cheque"), ticketMax = money(i.ticketMax, "The largest cheque")
  if (ticketMin != null && ticketMax != null && ticketMin > ticketMax) throw new InvestorError("The smallest cheque cannot be larger than the largest.")
  let horizonYears: number | null = null
  if (i.horizonYears !== null && i.horizonYears !== undefined && i.horizonYears !== "") {
    horizonYears = Number(i.horizonYears)
    if (!Number.isFinite(horizonYears) || horizonYears < 1 || horizonYears > 40) throw new InvestorError("The time horizon is between 1 and 40 years.")
    horizonYears = Math.round(horizonYears)
  }
  return {
    legalName, kind: kind as EntityKind, country: text(raw?.country, 80) || null, taxResidence: text(raw?.taxResidence, 80) || null, category: category as Category | null,
    interests: { stages: strList(i.stages, 10, 40), sectors: strList(i.sectors, 20, 60), geographies: strList(i.geographies, 20, 60), ticketMin, ticketMax, horizonYears },
  }
}

export interface ProfileView { userId: string; displayName: string; country: string | null; languages: string[]; contactPref: string | null; about: string | null; createdAt: string }
export interface EntityView extends EntityInput { id: string; createdAt: string; updatedAt: string }

const asList = (v: any): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : [] } catch { return [] } })() : [])
const asObj = (v: any): any => (v && typeof v === "object" ? v : typeof v === "string" ? (() => { try { return JSON.parse(v) } catch { return {} } })() : {})

function profileRow(r: any): ProfileView { return { userId: String(r.user_id), displayName: r.display_name, country: r.country ?? null, languages: asList(r.languages), contactPref: r.contact_pref ?? null, about: r.about ?? null, createdAt: new Date(r.created_at).toISOString() } }
function entityRow(r: any): EntityView {
  const i = asObj(r.interests)
  return { id: String(r.id), legalName: r.legal_name, kind: r.kind, country: r.country ?? null, taxResidence: r.tax_residence ?? null, category: r.category ?? null,
    interests: { stages: asList(i.stages), sectors: asList(i.sectors), geographies: asList(i.geographies), ticketMin: i.ticketMin ?? null, ticketMax: i.ticketMax ?? null, horizonYears: i.horizonYears ?? null },
    createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString() }
}
export const factsOf = (e: Pick<EntityView, "country" | "taxResidence" | "category" | "interests">): EntityFacts => ({ country: e.country, taxResidence: e.taxResidence, category: e.category, interests: e.interests })

export async function getProfile(userId: string): Promise<ProfileView | null> {
  const [r] = (await sql`SELECT * FROM investor_profiles WHERE user_id = ${userId} AND erased_at IS NULL`) as any[]
  return r ? profileRow(r) : null
}
export async function updateProfile(userId: string, raw: any): Promise<ProfileView> {
  const name = text(raw?.displayName, 120)
  if (name.length < 2) throw new InvestorError("Give your name (at least two characters).")
  const [r] = (await sql`UPDATE investor_profiles SET display_name = ${name}, country = ${text(raw?.country, 80) || null}, languages = ${JSON.stringify(strList(raw?.languages, 10, 40))}::jsonb,
      contact_pref = ${text(raw?.contactPref, 40) || null}, about = ${text(raw?.about, 1000) || null}, updated_at = now() WHERE user_id = ${userId} AND erased_at IS NULL RETURNING *`) as any[]
  if (!r) throw new InvestorError("You do not have an investor profile.", 404, "no_profile")
  return profileRow(r)
}

export async function listEntities(userId: string): Promise<EntityView[]> {
  return ((await sql`SELECT * FROM investor_entities WHERE user_id = ${userId} AND archived_at IS NULL ORDER BY created_at`) as any[]).map(entityRow)
}
export async function getEntity(userId: string, id: string): Promise<EntityView | null> {
  const [r] = (await sql`SELECT * FROM investor_entities WHERE id::text = ${id} AND user_id = ${userId} AND archived_at IS NULL`) as any[]
  return r ? entityRow(r) : null
}
export async function createEntity(userId: string, raw: any): Promise<EntityView> {
  const e = readEntity(raw)
  const [n] = (await sql`SELECT count(*)::int AS n FROM investor_entities WHERE user_id = ${userId} AND archived_at IS NULL`) as any[]
  if (Number(n.n) >= MAX_ENTITIES) throw new InvestorError(`You can have up to ${MAX_ENTITIES} investing entities.`, 409, "limit")
  const [r] = (await sql`INSERT INTO investor_entities (user_id, legal_name, kind, country, tax_residence, category, interests) VALUES (${userId}, ${e.legalName}, ${e.kind}, ${e.country}, ${e.taxResidence}, ${e.category}, ${JSON.stringify(e.interests)}::jsonb) RETURNING *`) as any[]
  return entityRow(r)
}
export async function updateEntity(userId: string, id: string, raw: any): Promise<EntityView> {
  const e = readEntity(raw)
  const [r] = (await sql`UPDATE investor_entities SET legal_name = ${e.legalName}, kind = ${e.kind}, country = ${e.country}, tax_residence = ${e.taxResidence}, category = ${e.category}, interests = ${JSON.stringify(e.interests)}::jsonb, updated_at = now()
    WHERE id::text = ${id} AND user_id = ${userId} AND archived_at IS NULL RETURNING *`) as any[]
  if (!r) throw new InvestorError("That entity was not found.", 404, "not_found")
  return entityRow(r)
}
/** An entity with an open relationship cannot be archived: the fund is talking to it. */
export async function archiveEntity(userId: string, id: string): Promise<void> {
  const [open] = (await sql`SELECT 1 AS x FROM fund_relationships WHERE entity_id::text = ${id} AND user_id = ${userId} AND stage IN ('interested', 'in_talks', 'invited_to_onboard', 'onboarding', 'on_hold') LIMIT 1`) as any[]
  if (open) throw new InvestorError("Withdraw your open requests with this entity before removing it.", 409, "open")
  const [last] = (await sql`SELECT count(*)::int AS n FROM investor_entities WHERE user_id = ${userId} AND archived_at IS NULL`) as any[]
  if (Number(last.n) <= 1) throw new InvestorError("You need at least one entity to invest through.", 409, "last")
  const rows = (await sql`UPDATE investor_entities SET archived_at = now() WHERE id::text = ${id} AND user_id = ${userId} AND archived_at IS NULL RETURNING id`) as any[]
  if (!rows.length) throw new InvestorError("That entity was not found.", 404, "not_found")
}

/** True for a signed-in person who has an investor profile and belongs to no workspace: where they land after signing in. */
export async function isInvestorOnly(userId: string): Promise<boolean> {
  const [p] = (await sql`SELECT 1 AS x FROM investor_profiles WHERE user_id = ${userId} AND erased_at IS NULL`) as any[]
  if (!p) return false
  const [m] = (await sql`SELECT 1 AS x FROM memberships WHERE user_id::text = ${userId} LIMIT 1`) as any[]
  return !m
}
