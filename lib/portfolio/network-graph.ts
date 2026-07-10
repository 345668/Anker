import { sql } from "@/lib/db"

/**
 * Relationship-graph assembly.
 *
 * Merges the user's CRM `contacts` with LinkedIn people captured by the
 * extension (`linkedin_connections`) into a single owner-scoped node/edge
 * graph. Everything is keyed by a normalized LinkedIn URL so a contact and a
 * captured connection that are the same person collapse into one "warm" node.
 *
 * All queries filter by owner_id — there is no RLS on these tables, so scoping
 * is enforced here on every read.
 */

// ── Shared types (safe to import from client components; no runtime DB) ──────

export type NodeKind = "me" | "contact" | "connection"
export type EdgeType = "me" | "mutual" | "company" | "tag" | "deal"

export interface GraphNode {
  id: string
  name: string
  company: string | null
  title: string | null
  headline: string | null
  location: string | null
  image: string | null
  /** 0 = you, 1/2/3 = network distance. */
  degree: number
  /** True when this person exists in the CRM `contacts` table. */
  inCrm: boolean
  kind: NodeKind
  tags: string[]
  status: string | null
  linkedinUrl: string | null
  contactId: string | null
  /** linkedin_connections.id when this node came from a capture — enables
   *  profile editing on the platform. */
  connectionId: string | null
  summary: string | null
  notes: string | null
  jobChangedAt: string | null
  previousCompany: string | null
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  /** Optional label, e.g. shared company or tag name. */
  label?: string
}

export interface GraphStats {
  total: number
  inCrm: number
  connections: number
  byDegree: Record<number, number>
  edges: Record<EdgeType, number>
  truncated: boolean
}

export interface NetworkGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: GraphStats
}

export interface NetworkFilters {
  degrees?: number[]          // which degrees to include (default [1,2,3])
  edgeTypes?: EdgeType[]       // which edge types to compute (default all)
  warmOnly?: boolean           // only CRM-matched nodes
  q?: string | null            // search by name/company/title
  /** Only people captured from LinkedIn by the extension. CRM contacts still
   *  enrich matching nodes (inCrm badge, tags, contactId) but contacts with
   *  no LinkedIn capture are excluded. Default: true on the network page. */
  linkedinOnly?: boolean
}

// Per-group caps keep dense webs (shared company / tag) from exploding into
// O(n^2) edge counts that would choke React Flow.
const COMPANY_CLUSTER_CAP = 12
const TAG_CLUSTER_CAP = 12
const MAX_NODES = 1500

// ── URL normalization ────────────────────────────────────────────────────

export function normalizeLinkedInUrl(u: string | null | undefined): string {
  if (!u) return ""
  let s = String(u).trim().toLowerCase()
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "")
  s = s.split("?")[0].split("#")[0]
  s = s.replace(/\/+$/, "")
  return s
}

function keyFor(url: string, name: string): string {
  const n = normalizeLinkedInUrl(url)
  if (n) return "url:" + n
  return "name:" + name.trim().toLowerCase()
}

function toTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t)).filter(Boolean)
  if (typeof raw === "string" && raw.trim()) {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map(String) } catch { /* ignore */ }
  }
  return []
}

// ── Row shapes ─────────────────────────────────────────────────────────────

interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  linkedin_url: string | null
  avatar: string | null
  tags: unknown
  status: string | null
  email: string | null
}

interface ConnectionRow {
  id: string
  summary: string | null
  notes: string | null
  previous_company: string | null
  job_changed_at: string | null
  linkedin_url: string
  full_name: string
  headline: string | null
  company: string | null
  title: string | null
  location: string | null
  image_url: string | null
  degree: number
}

interface MutualRow {
  person_url: string
  mutual_url: string | null
  mutual_name: string
}

// ── Main assembly ────────────────────────────────────────────────────────

export async function getNetworkGraph(
  ownerId: string,
  filters: NetworkFilters = {},
): Promise<NetworkGraph> {
  const degrees = new Set(filters.degrees?.length ? filters.degrees : [1, 2, 3])
  const edgeTypes = new Set<EdgeType>(
    filters.edgeTypes?.length ? filters.edgeTypes : ["me", "mutual", "company", "tag", "deal"],
  )
  const q = (filters.q || "").trim().toLowerCase()

  const wantDeal = edgeTypes.has("deal")
  const [contacts, connections, mutuals, dealCompanies] = await Promise.all([
    // Contacts are org-wide in this app (single-tenant admin CRM; the existing
    // /api/portfolio/contacts route reads them unscoped too). LinkedIn captures
    // below ARE owner-scoped — they are personal network data.
    sql`
      select id, first_name, last_name, company, title, linkedin_url, avatar, tags, status, email
      from contacts
    ` as Promise<ContactRow[]>,
    sql`
      select id, linkedin_url, full_name, headline, company, title, location, image_url, degree,
             summary, notes, previous_company, job_changed_at
      from linkedin_connections where owner_id = ${ownerId}
    ` as Promise<ConnectionRow[]>,
    sql`
      select person_url, mutual_url, mutual_name
      from linkedin_mutuals where owner_id = ${ownerId}
    ` as Promise<MutualRow[]>,
    // Companies that have a live deal — used to surface "deal-relevant" clusters.
    // Deals link to people only loosely (single contact_email), so instead of
    // per-deal edges we highlight people who sit at a company you're evaluating.
    wantDeal
      ? (sql`
          select distinct lower(trim(company_name)) as company
          from deal_opportunities
          where company_name is not null and trim(company_name) <> ''
        ` as Promise<Array<{ company: string | null }>>)
      : Promise.resolve([] as Array<{ company: string | null }>),
  ])

  // Node map keyed by normalized url (or name fallback). Contacts seed the map
  // first so CRM data wins; connections then enrich or add.
  const byKey = new Map<string, GraphNode>()
  // Secondary index: normalized url -> node id, for edge wiring.
  const urlToId = new Map<string, string>()

  let seq = 0
  const nextId = () => `n${seq++}`

  function upsertNode(input: {
    url: string | null; name: string; company: string | null; title: string | null
    headline: string | null; location: string | null; image: string | null
    degree: number; inCrm: boolean; kind: NodeKind; tags: string[]; status: string | null
    contactId: string | null; connectionId?: string | null; summary?: string | null; notes?: string | null
    jobChangedAt?: string | null; previousCompany?: string | null
  }): GraphNode {
    const key = keyFor(input.url || "", input.name)
    const existing = byKey.get(key)
    if (existing) {
      // Merge: prefer CRM presence + fill missing fields.
      existing.inCrm = existing.inCrm || input.inCrm
      existing.company ||= input.company
      existing.title ||= input.title
      existing.headline ||= input.headline
      existing.location ||= input.location
      existing.image ||= input.image
      existing.contactId ||= input.contactId
      existing.connectionId ||= input.connectionId ?? null
      existing.summary ||= input.summary ?? null
      existing.notes ||= input.notes ?? null
      if (input.inCrm) existing.kind = "contact"
      existing.degree = Math.min(existing.degree, input.degree)
      if (input.tags.length) existing.tags = Array.from(new Set([...existing.tags, ...input.tags]))
      existing.status ||= input.status
      return existing
    }
    const node: GraphNode = {
      id: nextId(),
      name: input.name || "Unknown",
      company: input.company,
      title: input.title,
      headline: input.headline,
      location: input.location,
      image: input.image,
      degree: input.degree,
      inCrm: input.inCrm,
      kind: input.kind,
      tags: input.tags,
      status: input.status,
      linkedinUrl: input.url ? normalizeLinkedInUrl(input.url) : null,
      contactId: input.contactId,
      connectionId: input.connectionId ?? null,
      summary: input.summary ?? null,
      notes: input.notes ?? null,
      jobChangedAt: input.jobChangedAt ?? null,
      previousCompany: input.previousCompany ?? null,
    }
    byKey.set(key, node)
    const nurl = normalizeLinkedInUrl(input.url || "")
    if (nurl) urlToId.set(nurl, node.id)
    return node
  }

  // Synthetic "me" node at the center.
  const me: GraphNode = {
    id: "me", name: "You", company: null, title: null, headline: null, location: null,
    image: null, degree: 0, inCrm: false, kind: "me", tags: [], status: null,
    linkedinUrl: null, contactId: null, connectionId: null, summary: null, notes: null,
    jobChangedAt: null, previousCompany: null,
  }

  // Contacts → degree 1 by default (they're in your CRM / known to you).
  for (const c of contacts) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Unknown"
    upsertNode({
      url: c.linkedin_url, name, company: c.company, title: c.title, headline: null,
      location: null, image: c.avatar, degree: 1, inCrm: true, kind: "contact",
      tags: toTags(c.tags), status: c.status, contactId: c.id,
    })
  }

  // Connections → captured degree. Track their node ids so linkedinOnly can
  // drop CRM-only contacts while keeping CRM enrichment on captured people.
  const capturedIds = new Set<string>()
  for (const cn of connections) {
    const node = upsertNode({
      url: cn.linkedin_url, name: cn.full_name, company: cn.company,
      title: cn.title, headline: cn.headline, location: cn.location, image: cn.image_url,
      degree: cn.degree || 1, inCrm: false, kind: "connection", tags: [], status: null,
      contactId: null, connectionId: cn.id, summary: cn.summary, notes: cn.notes,
      jobChangedAt: cn.job_changed_at, previousCompany: cn.previous_company,
    })
    capturedIds.add(node.id)
  }

  // ── Filtering ──
  let nodes = Array.from(byKey.values()).filter((n) => degrees.has(n.degree))
  if (filters.linkedinOnly) nodes = nodes.filter((n) => capturedIds.has(n.id))
  if (filters.warmOnly) nodes = nodes.filter((n) => n.inCrm)
  if (q) {
    nodes = nodes.filter((n) =>
      n.name.toLowerCase().includes(q) ||
      (n.company || "").toLowerCase().includes(q) ||
      (n.title || "").toLowerCase().includes(q),
    )
  }

  let truncated = false
  if (nodes.length > MAX_NODES) {
    // Keep CRM + lower-degree nodes preferentially.
    nodes.sort((a, b) => Number(b.inCrm) - Number(a.inCrm) || a.degree - b.degree)
    nodes = nodes.slice(0, MAX_NODES)
    truncated = true
  }

  const liveIds = new Set(nodes.map((n) => n.id))
  const edges: GraphEdge[] = []
  let edgeSeq = 0
  const edgeId = () => `e${edgeSeq++}`
  const seen = new Set<string>()
  function addEdge(source: string, target: string, type: EdgeType, label?: string) {
    if (source === target) return
    if (!liveIds.has(source) && source !== "me") return
    if (!liveIds.has(target) && target !== "me") return
    const k = [type, ...[source, target].sort()].join("|")
    if (seen.has(k)) return
    seen.add(k)
    edges.push({ id: edgeId(), source, target, type, label })
  }

  // me → degree-1 nodes
  if (edgeTypes.has("me")) {
    for (const n of nodes) if (n.degree === 1) addEdge("me", n.id, "me")
  }

  // mutual connections: person_url ↔ mutual_url
  if (edgeTypes.has("mutual")) {
    for (const m of mutuals) {
      const pid = urlToId.get(normalizeLinkedInUrl(m.person_url))
      const mid = m.mutual_url ? urlToId.get(normalizeLinkedInUrl(m.mutual_url)) : undefined
      if (pid && mid) addEdge(pid, mid, "mutual")
    }
  }

  // shared company clusters (capped per company)
  if (edgeTypes.has("company")) {
    const byCompany = new Map<string, string[]>()
    for (const n of nodes) {
      const c = (n.company || "").trim().toLowerCase()
      if (!c) continue
      const arr = byCompany.get(c) || []
      if (arr.length < COMPANY_CLUSTER_CAP) { arr.push(n.id); byCompany.set(c, arr) }
    }
    for (const [, ids] of byCompany) {
      if (ids.length < 2) continue
      // star within the cluster to keep edge count linear
      for (let i = 1; i < ids.length; i++) addEdge(ids[0], ids[i], "company")
    }
  }

  // shared tag clusters (CRM contacts only, capped per tag)
  if (edgeTypes.has("tag")) {
    const byTag = new Map<string, string[]>()
    for (const n of nodes) {
      for (const t of n.tags) {
        const key = t.trim().toLowerCase()
        if (!key) continue
        const arr = byTag.get(key) || []
        if (arr.length < TAG_CLUSTER_CAP) { arr.push(n.id); byTag.set(key, arr) }
      }
    }
    for (const [tag, ids] of byTag) {
      if (ids.length < 2) continue
      for (let i = 1; i < ids.length; i++) addEdge(ids[0], ids[i], "tag", tag)
    }
  }

  // deal-relevant clusters: link people who sit at a company that has a live deal.
  if (edgeTypes.has("deal") && dealCompanies.length) {
    const dealSet = new Set(dealCompanies.map((d) => (d.company || "").trim()).filter(Boolean))
    const byDealCompany = new Map<string, string[]>()
    for (const n of nodes) {
      const c = (n.company || "").trim().toLowerCase()
      if (!c || !dealSet.has(c)) continue
      const arr = byDealCompany.get(c) || []
      if (arr.length < COMPANY_CLUSTER_CAP) { arr.push(n.id); byDealCompany.set(c, arr) }
    }
    for (const [company, ids] of byDealCompany) {
      if (ids.length < 2) continue
      for (let i = 1; i < ids.length; i++) addEdge(ids[0], ids[i], "deal", company)
    }
  }

  const byDegree: Record<number, number> = {}
  for (const n of nodes) byDegree[n.degree] = (byDegree[n.degree] || 0) + 1
  const edgeCounts = { me: 0, mutual: 0, company: 0, tag: 0, deal: 0 } as Record<EdgeType, number>
  for (const e of edges) edgeCounts[e.type]++

  return {
    nodes: [me, ...nodes],
    edges,
    stats: {
      total: nodes.length,
      inCrm: nodes.filter((n) => n.inCrm).length,
      connections: connections.length,
      byDegree,
      edges: edgeCounts,
      truncated,
    },
  }
}

/**
 * Intro paths for a target person: which of your 1st-degree connections are
 * shared (mutual) connections with them. Used by the node drawer to answer
 * "who can introduce me to this person?".
 */
export async function getIntroPaths(
  ownerId: string,
  personUrl: string,
): Promise<Array<{ name: string; url: string | null }>> {
  const norm = normalizeLinkedInUrl(personUrl)
  if (!norm) return []
  const rows = await sql`
    select mutual_name, mutual_url
    from linkedin_mutuals
    where owner_id = ${ownerId} and person_url = ${norm}
    order by mutual_name asc
    limit 50
  ` as Array<{ mutual_name: string; mutual_url: string | null }>
  return rows.map((r) => ({ name: r.mutual_name, url: r.mutual_url }))
}
