/**
 * Twenty CRM client.
 *
 * Twenty (https://github.com/twentyhq/twenty) is a self-hostable CRM
 * with a GraphQL + REST API. We use the GraphQL API for upserts and
 * the REST API for reads, since GraphQL upserts in Twenty are
 * deeply nested and the REST endpoints are flatter.
 *
 * Configuration is via env:
 *   TWENTY_BASE_URL    e.g. http://localhost:3010
 *   TWENTY_API_KEY     created in Settings → Developers → API & Webhooks
 *
 * If either is unset, every method here returns `{ skipped: true }`
 * — Anker keeps working without Twenty present.
 */

import { GraphQLClient, gql } from "graphql-request"

export interface TwentyConfig {
  baseUrl: string
  apiKey: string
}

export interface TwentyCompany {
  id?: string
  name: string
  domainName?: string
  city?: string
  employees?: number | null
  industry?: string | null
  /** Anker firm id stored on a custom column. */
  ankerFirmId?: string
}

export interface TwentyPerson {
  id?: string
  firstName: string
  lastName: string
  email?: string
  jobTitle?: string
  city?: string
  linkedinUrl?: string
  companyId?: string
  /** Anker investor id stored on a custom column. */
  ankerInvestorId?: string
}

export type TwentyOpportunityStage =
  | "NEW"            // ↔ crm_entries.stage = queued
  | "SCREENING"      // ↔ contacted
  | "MEETING"        // ↔ meeting / responded
  | "PROPOSAL"       // ↔ in_diligence
  | "CUSTOMER"       // ↔ committed
  | "CLOSED_LOST"    // ↔ passed

export interface TwentyOpportunity {
  id?: string
  name: string
  stage: TwentyOpportunityStage
  amount?: number | null
  closeDate?: string | null
  companyId?: string
  pointOfContactId?: string
  /** Anker crm_entry id stored on a custom column. */
  ankerCrmEntryId?: string
}

let _client: GraphQLClient | null = null
let _config: TwentyConfig | null = null

export function getTwentyConfig(): TwentyConfig | null {
  if (_config) return _config
  const baseUrl = (process.env.TWENTY_BASE_URL ?? "").trim()
  const apiKey = (process.env.TWENTY_API_KEY ?? "").trim()
  if (!baseUrl || !apiKey) return null
  _config = { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey }
  return _config
}

export function isTwentyConfigured(): boolean {
  return getTwentyConfig() !== null
}

function client(): GraphQLClient {
  if (_client) return _client
  const cfg = getTwentyConfig()
  if (!cfg) throw new Error("Twenty not configured (TWENTY_BASE_URL + TWENTY_API_KEY)")
  _client = new GraphQLClient(`${cfg.baseUrl}/graphql`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  })
  return _client
}

// ─── Companies ─────────────────────────────────────────────────────────
const FIND_COMPANY_BY_ANKER = gql`
  query FindCompanyByAnker($filter: CompanyFilterInput) {
    companies(filter: $filter, paging: { first: 1 }) {
      edges { node { id name } }
    }
  }
`

const CREATE_COMPANY = gql`
  mutation CreateCompany($data: CompanyCreateInput!) {
    createCompany(data: $data) { id name }
  }
`

const UPDATE_COMPANY = gql`
  mutation UpdateCompany($id: UUID!, $data: CompanyUpdateInput!) {
    updateCompany(id: $id, data: $data) { id name }
  }
`

export async function upsertCompany(c: TwentyCompany): Promise<{ id: string }> {
  if (!isTwentyConfigured()) return { id: "" }
  const c0 = client()
  // 1. find by Anker custom column if supplied
  if (c.ankerFirmId) {
    try {
      const found: any = await c0.request(FIND_COMPANY_BY_ANKER, {
        filter: { ankerFirmId: { eq: c.ankerFirmId } },
      })
      const node = found?.companies?.edges?.[0]?.node
      if (node?.id) {
        await c0.request(UPDATE_COMPANY, { id: node.id, data: companyMutationData(c) })
        return { id: node.id }
      }
    } catch {
      // custom column might not exist yet — fall through to create
    }
  }
  const created: any = await c0.request(CREATE_COMPANY, { data: companyMutationData(c) })
  return { id: created.createCompany.id }
}

function companyMutationData(c: TwentyCompany): any {
  return {
    name: c.name,
    domainName: c.domainName ? { primaryLinkUrl: c.domainName, primaryLinkLabel: c.domainName, secondaryLinks: [] } : undefined,
    address: c.city ? { addressCity: c.city, addressCountry: null, addressLat: null, addressLng: null, addressState: null, addressStreet1: null, addressStreet2: null, addressPostcode: null } : undefined,
    employees: c.employees ?? null,
    // Custom field — only included if the Twenty workspace has it.
    // The wrapper swallows errors if the column doesn't exist.
    ...(c.ankerFirmId ? { ankerFirmId: c.ankerFirmId } : {}),
  }
}

// ─── People ────────────────────────────────────────────────────────────
const FIND_PERSON_BY_ANKER = gql`
  query FindPersonByAnker($filter: PersonFilterInput) {
    people(filter: $filter, paging: { first: 1 }) {
      edges { node { id name { firstName lastName } } }
    }
  }
`
const CREATE_PERSON = gql`
  mutation CreatePerson($data: PersonCreateInput!) {
    createPerson(data: $data) { id }
  }
`
const UPDATE_PERSON = gql`
  mutation UpdatePerson($id: UUID!, $data: PersonUpdateInput!) {
    updatePerson(id: $id, data: $data) { id }
  }
`

export async function upsertPerson(p: TwentyPerson): Promise<{ id: string }> {
  if (!isTwentyConfigured()) return { id: "" }
  const c0 = client()
  if (p.ankerInvestorId) {
    try {
      const found: any = await c0.request(FIND_PERSON_BY_ANKER, {
        filter: { ankerInvestorId: { eq: p.ankerInvestorId } },
      })
      const node = found?.people?.edges?.[0]?.node
      if (node?.id) {
        await c0.request(UPDATE_PERSON, { id: node.id, data: personMutationData(p) })
        return { id: node.id }
      }
    } catch { /* column missing, fall through */ }
  }
  const created: any = await c0.request(CREATE_PERSON, { data: personMutationData(p) })
  return { id: created.createPerson.id }
}

function personMutationData(p: TwentyPerson): any {
  return {
    name: { firstName: p.firstName, lastName: p.lastName },
    emails: p.email ? { primaryEmail: p.email, additionalEmails: [] } : undefined,
    jobTitle: p.jobTitle,
    city: p.city,
    linkedinLink: p.linkedinUrl ? { primaryLinkUrl: p.linkedinUrl, primaryLinkLabel: p.linkedinUrl, secondaryLinks: [] } : undefined,
    company: p.companyId ? { id: p.companyId } : undefined,
    ...(p.ankerInvestorId ? { ankerInvestorId: p.ankerInvestorId } : {}),
  }
}

// ─── Opportunities ─────────────────────────────────────────────────────
const FIND_OPPORTUNITY_BY_ANKER = gql`
  query FindOpportunityByAnker($filter: OpportunityFilterInput) {
    opportunities(filter: $filter, paging: { first: 1 }) {
      edges { node { id name stage } }
    }
  }
`
const CREATE_OPPORTUNITY = gql`
  mutation CreateOpportunity($data: OpportunityCreateInput!) {
    createOpportunity(data: $data) { id stage }
  }
`
const UPDATE_OPPORTUNITY = gql`
  mutation UpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
    updateOpportunity(id: $id, data: $data) { id stage }
  }
`

export async function upsertOpportunity(o: TwentyOpportunity): Promise<{ id: string; stage: TwentyOpportunityStage }> {
  if (!isTwentyConfigured()) return { id: "", stage: o.stage }
  const c0 = client()
  if (o.ankerCrmEntryId) {
    try {
      const found: any = await c0.request(FIND_OPPORTUNITY_BY_ANKER, {
        filter: { ankerCrmEntryId: { eq: o.ankerCrmEntryId } },
      })
      const node = found?.opportunities?.edges?.[0]?.node
      if (node?.id) {
        const updated: any = await c0.request(UPDATE_OPPORTUNITY, {
          id: node.id, data: opportunityMutationData(o),
        })
        return { id: node.id, stage: updated.updateOpportunity.stage }
      }
    } catch { /* column missing, fall through */ }
  }
  const created: any = await c0.request(CREATE_OPPORTUNITY, { data: opportunityMutationData(o) })
  return { id: created.createOpportunity.id, stage: created.createOpportunity.stage }
}

function opportunityMutationData(o: TwentyOpportunity): any {
  return {
    name: o.name,
    stage: o.stage,
    amount: o.amount != null ? { amountMicros: Math.round(o.amount * 1_000_000), currencyCode: "USD" } : undefined,
    closeDate: o.closeDate,
    company: o.companyId ? { id: o.companyId } : undefined,
    pointOfContact: o.pointOfContactId ? { id: o.pointOfContactId } : undefined,
    ...(o.ankerCrmEntryId ? { ankerCrmEntryId: o.ankerCrmEntryId } : {}),
  }
}

// ─── Inbound: read Opportunity stages back ─────────────────────────────
const READ_OPPORTUNITIES = gql`
  query ReadOpportunities($filter: OpportunityFilterInput, $first: Int) {
    opportunities(filter: $filter, paging: { first: $first }) {
      edges { node { id stage ankerCrmEntryId } }
    }
  }
`

export async function readOpportunityStages(ankerCrmEntryIds: string[]): Promise<{ ankerCrmEntryId: string; stage: TwentyOpportunityStage; opportunityId: string }[]> {
  if (!isTwentyConfigured() || ankerCrmEntryIds.length === 0) return []
  const c0 = client()
  try {
    const data: any = await c0.request(READ_OPPORTUNITIES, {
      filter: { ankerCrmEntryId: { in: ankerCrmEntryIds } },
      first: ankerCrmEntryIds.length,
    })
    const out: { ankerCrmEntryId: string; stage: TwentyOpportunityStage; opportunityId: string }[] = []
    for (const e of data?.opportunities?.edges ?? []) {
      const n = e.node
      if (n?.ankerCrmEntryId) {
        out.push({ ankerCrmEntryId: n.ankerCrmEntryId, stage: n.stage, opportunityId: n.id })
      }
    }
    return out
  } catch (e: any) {
    // Custom column might not exist yet
    console.warn("[twenty] readOpportunityStages failed:", e?.message)
    return []
  }
}

/** Convenience: build the Twenty UI URL for a record. */
export function twentyUrl(kind: "company" | "person" | "opportunity", id: string): string | null {
  const cfg = getTwentyConfig()
  if (!cfg || !id) return null
  return `${cfg.baseUrl}/object/${kind}/${id}`
}
