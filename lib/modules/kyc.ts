import { sql } from "@/lib/db"
import { isOpenSanctionsConfigured, screenViaOpenSanctions, type ProviderHit } from "@/lib/modules/opensanctions"

/**
 * KYC / AML screening engine + document collection.
 *
 * The screener normalizes a subject name and fuzzy-matches it (Jaccard token
 * overlap) against the kyc_watchlist, producing sanctions / PEP / adverse-media
 * hits above a threshold. Case risk and status are DERIVED from open hits +
 * document completeness — never hand-typed. The watchlist is a synthetic
 * placeholder in dev and is swapped for a real feed (OpenSanctions / OFAC /
 * a provider) in production without touching this logic.
 */

const num = (v: any) => (v == null ? 0 : Number(v))
export const MATCH_THRESHOLD = 0.5

// ── name matching ────────────────────────────────────────────────────────────
function normalize(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}
function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter(Boolean))
}
/** Jaccard token overlap, 0..1. Full-name match = 1. */
export function nameScore(a: string, b: string): number {
  const A = tokenSet(a), B = tokenSet(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

// ── document checklists ──────────────────────────────────────────────────────
export const REQUIRED_DOCS: Record<"individual" | "entity", { type: string; label: string }[]> = {
  individual: [
    { type: "id_document", label: "Government ID (passport / license)" },
    { type: "proof_of_address", label: "Proof of address" },
    { type: "source_of_funds", label: "Source of funds" },
  ],
  entity: [
    { type: "certificate_of_incorporation", label: "Certificate of incorporation" },
    { type: "ubo_declaration", label: "UBO / ownership declaration" },
    { type: "proof_of_address", label: "Registered address proof" },
    { type: "source_of_funds", label: "Source of funds" },
  ],
}

// ── types ────────────────────────────────────────────────────────────────────
export interface KycCase {
  id: string; fund_id: string | null; fund_lp_id: string | null
  subject_name: string; subject_type: "individual" | "entity"
  status: "not_started" | "in_progress" | "cleared" | "escalated" | "rejected"
  risk_level: "unknown" | "low" | "medium" | "high"
  screened_at: string | null; notes: string | null; created_at: string
  open_hits?: number; total_hits?: number; docs_verified?: number; docs_required?: number
}
export interface KycHit {
  id: string; list: "sanctions" | "pep" | "adverse_media"; match_name: string
  program: string | null; country: string | null; score: number; status: "open" | "cleared" | "confirmed"
  provider: string | null; source_url: string | null
}
export interface KycDocument {
  id: string; doc_type: string; label: string | null
  status: "requested" | "received" | "verified" | "rejected"; file_url: string | null
  requested_at: string | null; received_at: string | null
}

function normCase(r: any): KycCase {
  return {
    id: r.id, fund_id: r.fund_id ?? null, fund_lp_id: r.fund_lp_id ?? null,
    subject_name: r.subject_name, subject_type: r.subject_type,
    status: r.status, risk_level: r.risk_level,
    screened_at: r.screened_at ? String(r.screened_at) : null,
    notes: r.notes ?? null, created_at: String(r.created_at),
    open_hits: r.open_hits != null ? Number(r.open_hits) : undefined,
    total_hits: r.total_hits != null ? Number(r.total_hits) : undefined,
    docs_verified: r.docs_verified != null ? Number(r.docs_verified) : undefined,
    docs_required: r.docs_required != null ? Number(r.docs_required) : undefined,
  }
}

async function ownsCase(userId: string, caseId: string): Promise<{ id: string; subject_name: string; subject_type: "individual" | "entity" } | null> {
  const rows = await sql`SELECT id, subject_name, subject_type FROM kyc_cases WHERE id = ${caseId} AND created_by = ${userId} LIMIT 1`
  return (rows[0] as any) ?? null
}

// ── cases: read ──────────────────────────────────────────────────────────────
export async function listCases(userId: string): Promise<KycCase[]> {
  const rows = await sql`
    SELECT c.*,
      (SELECT COUNT(*) FROM kyc_screening_hits h WHERE h.case_id = c.id AND h.status IN ('open','confirmed')) AS open_hits,
      (SELECT COUNT(*) FROM kyc_screening_hits h WHERE h.case_id = c.id) AS total_hits,
      (SELECT COUNT(*) FROM kyc_documents d WHERE d.case_id = c.id AND d.status = 'verified') AS docs_verified
    FROM kyc_cases c WHERE c.created_by = ${userId} ORDER BY c.created_at DESC`
  return (rows as any[]).map((r) => {
    const c = normCase(r)
    c.docs_required = REQUIRED_DOCS[c.subject_type].length
    return c
  })
}

export async function getCase(userId: string, caseId: string): Promise<{ case: KycCase; hits: KycHit[]; documents: KycDocument[] } | null> {
  const rows = await sql`SELECT * FROM kyc_cases WHERE id = ${caseId} AND created_by = ${userId} LIMIT 1`
  if (!rows[0]) return null
  const c = normCase(rows[0])
  c.docs_required = REQUIRED_DOCS[c.subject_type].length
  const [hits, docs] = await Promise.all([
    sql`SELECT id, list, match_name, program, country, score, status, provider, source_url FROM kyc_screening_hits WHERE case_id = ${caseId} ORDER BY score DESC`,
    sql`SELECT id, doc_type, label, status, file_url, requested_at, received_at FROM kyc_documents WHERE case_id = ${caseId} ORDER BY created_at`,
  ])
  return {
    case: c,
    hits: (hits as any[]).map((h) => ({ ...h, score: num(h.score) })) as KycHit[],
    documents: docs as KycDocument[],
  }
}

// ── cases: write ─────────────────────────────────────────────────────────────
export async function createCase(input: {
  userId: string; subjectName: string; subjectType?: "individual" | "entity"; fundId?: string | null; fundLpId?: string | null
}): Promise<KycCase> {
  const rows = await sql`
    INSERT INTO kyc_cases (created_by, subject_name, subject_type, fund_id, fund_lp_id)
    VALUES (${input.userId}, ${input.subjectName.trim()}, ${input.subjectType ?? "individual"}, ${input.fundId ?? null}, ${input.fundLpId ?? null})
    RETURNING *`
  return normCase(rows[0])
}

/** Create a case per fund LP that doesn't already have one. Returns count created. */
export async function syncCasesFromFund(userId: string, fundId: string): Promise<number> {
  const rows = await sql`
    INSERT INTO kyc_cases (created_by, subject_name, subject_type, fund_id, fund_lp_id)
    SELECT ${userId}, l.lp_name,
           CASE WHEN l.lp_type = 'hnwi' THEN 'individual' ELSE 'entity' END,
           l.fund_id, l.id
    FROM fund_lps l
    WHERE l.fund_id = ${fundId} AND l.status != 'transferred'
      AND NOT EXISTS (SELECT 1 FROM kyc_cases c WHERE c.fund_lp_id = l.id)
    RETURNING id`
  return (rows as any[]).length
}

export async function setCaseStatus(userId: string, caseId: string, status: KycCase["status"], notes?: string | null): Promise<KycCase | null> {
  const rows = await sql`
    UPDATE kyc_cases SET status = ${status}, notes = COALESCE(${notes ?? null}, notes), updated_at = now()
    WHERE id = ${caseId} AND created_by = ${userId} RETURNING *`
  return rows[0] ? normCase(rows[0]) : null
}

// ── screening ────────────────────────────────────────────────────────────────
/** Run the subject name against the watchlist, replace this case's hits, and
 *  recompute risk + status. Returns the fresh case + hits. */
export async function runScreening(userId: string, caseId: string): Promise<{ case: KycCase; hits: KycHit[] } | null> {
  const owned = await ownsCase(userId, caseId)
  if (!owned) return null

  // Real provider (OpenSanctions) when configured; local watchlist otherwise.
  // A provider error propagates so the caller can report that screening didn't
  // run — we never treat a failed screen as "no hits".
  let hits: (ProviderHit & { provider: string })[]
  if (await isOpenSanctionsConfigured()) {
    const res = await screenViaOpenSanctions(owned.subject_name, owned.subject_type)
    hits = res.map((h) => ({ ...h, provider: "opensanctions" }))
  } else {
    const watch = await sql`SELECT name, list, program, country FROM kyc_watchlist` as Array<Record<string, any>>
    hits = watch
      .map((w) => ({ w, score: nameScore(owned.subject_name, w.name) }))
      .filter((m) => m.score >= MATCH_THRESHOLD)
      .map((m) => ({
        list: m.w.list, match_name: m.w.name, program: m.w.program ?? null,
        country: m.w.country ?? null, score: Math.round(m.score * 1000) / 1000,
        source_url: null, provider: "watchlist",
      }))
  }

  // Re-screen from clean: drop prior hits, insert the new match set.
  await sql`DELETE FROM kyc_screening_hits WHERE case_id = ${caseId}`
  for (const h of hits) {
    await sql`
      INSERT INTO kyc_screening_hits (case_id, list, match_name, program, country, score, provider, source_url)
      VALUES (${caseId}, ${h.list}, ${h.match_name}, ${h.program ?? null}, ${h.country ?? null}, ${h.score}, ${h.provider}, ${h.source_url ?? null})`
  }
  await sql`UPDATE kyc_cases SET screened_at = now(), updated_at = now() WHERE id = ${caseId}`
  await recomputeCase(caseId)

  const full = await getCase(userId, caseId)
  return full ? { case: full.case, hits: full.hits } : null
}

/** Derive risk_level + status from open hits and document completeness. Never
 *  overrides a manual 'rejected'. */
export async function recomputeCase(caseId: string): Promise<void> {
  const c = (await sql`SELECT subject_type, status, screened_at FROM kyc_cases WHERE id = ${caseId} LIMIT 1`)[0] as any
  if (!c || c.status === "rejected") return

  const hits = await sql`SELECT list, status FROM kyc_screening_hits WHERE case_id = ${caseId}` as Array<Record<string, any>>
  const active = hits.filter((h) => h.status === "open" || h.status === "confirmed")
  const hasSanction = active.some((h) => h.list === "sanctions")
  const hasPepOrMedia = active.some((h) => h.list === "pep" || h.list === "adverse_media")
  const confirmed = hits.some((h) => h.status === "confirmed")

  const required = REQUIRED_DOCS[(c.subject_type as "individual" | "entity")] ?? []
  const verifiedRows = await sql`SELECT DISTINCT doc_type FROM kyc_documents WHERE case_id = ${caseId} AND status = 'verified'` as Array<{ doc_type: string }>
  const verifiedTypes = new Set(verifiedRows.map((r) => r.doc_type))
  const docsComplete = required.length > 0 && required.every((d) => verifiedTypes.has(d.type))

  const risk = hasSanction ? "high" : hasPepOrMedia ? "medium" : c.screened_at ? "low" : "unknown"

  let status: KycCase["status"]
  if (confirmed) status = "escalated"
  else if (active.length > 0) status = "in_progress"
  else if (docsComplete) status = "cleared"
  else if (c.screened_at || (await hasAnyDoc(caseId))) status = "in_progress"
  else status = "not_started"

  await sql`UPDATE kyc_cases SET risk_level = ${risk}, status = ${status}, updated_at = now() WHERE id = ${caseId}`
}

async function hasAnyDoc(caseId: string): Promise<boolean> {
  const r = await sql`SELECT 1 FROM kyc_documents WHERE case_id = ${caseId} LIMIT 1`
  return !!r[0]
}

// ── hit actions ──────────────────────────────────────────────────────────────
export async function setHitStatus(userId: string, caseId: string, hitId: string, status: KycHit["status"]): Promise<boolean> {
  if (!(await ownsCase(userId, caseId))) return false
  await sql`UPDATE kyc_screening_hits SET status = ${status} WHERE id = ${hitId} AND case_id = ${caseId}`
  await recomputeCase(caseId)
  return true
}

// ── document actions ─────────────────────────────────────────────────────────
export async function requestDocument(userId: string, caseId: string, docType: string, label?: string | null): Promise<KycDocument | null> {
  if (!(await ownsCase(userId, caseId))) return null
  const rows = await sql`
    INSERT INTO kyc_documents (case_id, doc_type, label) VALUES (${caseId}, ${docType}, ${label ?? null})
    RETURNING id, doc_type, label, status, file_url, requested_at, received_at`
  await recomputeCase(caseId)
  return rows[0] as KycDocument
}

export async function setDocumentStatus(userId: string, caseId: string, docId: string, status: KycDocument["status"], fileUrl?: string | null): Promise<boolean> {
  if (!(await ownsCase(userId, caseId))) return false
  await sql`
    UPDATE kyc_documents
    SET status = ${status},
        file_url = COALESCE(${fileUrl ?? null}, file_url),
        received_at = CASE WHEN ${status} IN ('received','verified') AND received_at IS NULL THEN now() ELSE received_at END
    WHERE id = ${docId} AND case_id = ${caseId}`
  await recomputeCase(caseId)
  return true
}
