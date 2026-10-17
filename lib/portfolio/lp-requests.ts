import { sql } from "@/lib/db"
import { LpError } from "./lp-onboarding"

/**
 * What an investor asks of the fund (docs/architecture/60 section 8). The portal never does these things: it records the request, in the investor's own words, and
 * puts a proposal in front of the fund (doc 43) when the fund has a workspace. Approving the proposal means "the fund has seen this and will answer": it adds a task.
 * Nothing about an investor's holding is changed by a request.
 */
export const KINDS = ["redemption", "transfer", "details_change", "other"] as const
export type RequestKind = (typeof KINDS)[number]
export const KIND_LABEL: Record<RequestKind, string> = { redemption: "Withdrawal or redemption", transfer: "Transfer of my interest", details_change: "Change of my details (address, bank, name)", other: "Something else" }
export const MAX_PER_DAY = 5, MAX_BODY = 1000

/** Does a question to the assistant ask the fund to DO something? Deliberately cautious and bilingual: a miss is answered normally, a hit is handed to the fund. */
const INTENT = /\b(i|we)\b.{0,25}\b(want|wish|would like|need|request|ask|am asking)\b|\b(please|bitte|can i|could i|may i|how do i|how can i|ich m[öo]chte|ich will|wir m[öo]chten|ich beantrage)\b/i
const PATTERNS: Array<[RequestKind, (t: string) => boolean]> = [
  ["redemption", (t) => /\b(redeem|cash out|pull my money|get my money back|exit (?:the )?fund|auszahlen|austreten)\b/i.test(t) || (/\b(withdraw|withdrawal|redemption|r[üu]ckgabe|k[üu]ndigen|k[üu]ndigung)\b/i.test(t) && INTENT.test(t))],
  ["transfer", (t) => /\b(transfer|assign|sell|hand over|gift)\b.{0,40}\b(my|our)\b.{0,30}\b(interest|stake|units|shares|commitment|position|anteil|beteiligung)\b/i.test(t) || (/\b(anteil|beteiligung)\b.{0,30}(?:[üu]bertragen|verkaufen)\b|(?:^|\W)[üu]bertrag(?:en|ung)\b.{0,30}\b(anteil|beteiligung)\b/i.test(t))],
  ["details_change", (t) => /\b(change|update|correct|new|replace)\b.{0,30}\b(my|our)\b.{0,25}\b(address|bank|iban|account details|bank details|name|email|e-mail|tax)\b|(?:^|\W)([äa]nder(?:n|ung)|aktualisier\w*)\b.{0,30}\b(adresse|bankverbindung|iban|name)\b/i.test(t)],
]
export function classifyRequest(text: string): RequestKind | null {
  const t = String(text ?? "")
  for (const [k, test] of PATTERNS) if (test(t)) return k
  return null
}

export interface SubmittedRequest { id: string; kind: RequestKind; proposalId: string | null }
type Propose = (scope: { orgId: string; userId: string; persona?: string | null }, capability: string, input: unknown, ctx: { runId: string | null; trust: "trusted" | "untrusted" }) => Promise<{ proposal: { id: string } }>

/** Records the request, and proposes it to the fund's inbox when the fund belongs to a workspace. */
export async function submitRequest(lp: { lpId: string; fundId: string }, input: { kind: unknown; body: unknown; source?: "form" | "assistant" }, propose?: Propose): Promise<SubmittedRequest> {
  const kind = String(input.kind ?? "other") as RequestKind
  if (!(KINDS as readonly string[]).includes(kind)) throw new LpError("Choose what your request is about.")
  const body = String(input.body ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_BODY)
  if (body.length < 5) throw new LpError("Please say a little more, so the fund can help.")
  const [n] = (await sql`SELECT count(*)::int AS n FROM lp_requests WHERE lp_id = ${lp.lpId} AND created_at > now() - interval '1 day'`) as any[]
  if (Number(n.n) >= MAX_PER_DAY) throw new LpError("You have sent several requests today. The fund has them and will reply; please wait before sending more.", 429, "limit")
  const [org] = (await sql`SELECT o.id::text AS id, (SELECT m.user_id FROM memberships m WHERE m.org_id = o.id AND m.org_role = 'workspace_owner' ORDER BY m.created_at NULLS LAST LIMIT 1) AS owner FROM organizations o WHERE o.fund_id::text = ${lp.fundId} LIMIT 1`) as any[]
  const [r] = (await sql`INSERT INTO lp_requests (fund_id, lp_id, org_id, kind, body, source) VALUES (${lp.fundId}, ${lp.lpId}, ${org?.id ?? null}, ${kind}, ${body}, ${input.source ?? "form"}) RETURNING id`) as any[]
  let proposalId: string | null = null
  if (org?.id && org.owner && propose) {
    try {
      const p = await propose({ orgId: String(org.id), userId: String(org.owner), persona: "vc" }, "lp_request_followup", { requestId: String(r.id) }, { runId: null, trust: "untrusted" })
      proposalId = String(p.proposal.id)
      await sql`UPDATE lp_requests SET proposal_id = ${proposalId} WHERE id = ${String(r.id)}::uuid`
    } catch (e) { console.error("[lp-request] could not make a proposal:", (e as Error)?.message) }
  }
  return { id: String(r.id), kind, proposalId }
}

export interface RequestView { id: string; lpId: string; lpName: string; kind: RequestKind; body: string; source: string; status: "open" | "seen" | "closed"; at: string; viaProposal: boolean }
/** The fund's list. A request with a proposal follows the proposal: applied is "seen", rejected is "closed". */
export async function requestsForFund(fundId: string): Promise<RequestView[]> {
  const rows = (await sql`SELECT r.id, r.lp_id, l.lp_name, r.kind, r.body, r.source, r.status, r.created_at, r.proposal_id, p.status AS pstatus
    FROM lp_requests r JOIN fund_lps l ON l.id = r.lp_id LEFT JOIN action_proposals p ON p.id::text = r.proposal_id WHERE r.fund_id = ${fundId} ORDER BY r.created_at DESC LIMIT 100`) as any[]
  return rows.map((r) => ({ id: String(r.id), lpId: String(r.lp_id), lpName: r.lp_name, kind: r.kind, body: r.body, source: r.source, at: new Date(r.created_at).toISOString().slice(0, 10), viaProposal: !!r.proposal_id,
    status: r.pstatus === "applied" ? "seen" : r.pstatus === "rejected" || r.pstatus === "expired" ? "closed" : r.status }))
}
export async function closeRequest(fundId: string, id: string): Promise<boolean> {
  return ((await sql`UPDATE lp_requests SET status = 'closed', decided_at = now() WHERE id = ${id}::uuid AND fund_id = ${fundId} AND status = 'open' RETURNING id`) as any[]).length > 0
}
/** What the investor sees of their own requests. */
export async function requestsForLp(lpId: string): Promise<Array<{ kind: RequestKind; body: string; at: string; status: string }>> {
  const rows = (await sql`SELECT r.kind, r.body, r.created_at, r.status, p.status AS pstatus FROM lp_requests r LEFT JOIN action_proposals p ON p.id::text = r.proposal_id WHERE r.lp_id = ${lpId} ORDER BY r.created_at DESC LIMIT 10`) as any[]
  return rows.map((r) => ({ kind: r.kind, body: String(r.body).slice(0, 200), at: new Date(r.created_at).toISOString().slice(0, 10), status: r.pstatus === "applied" ? "The fund has seen it" : r.pstatus === "rejected" || r.pstatus === "expired" || r.status === "closed" ? "Closed" : r.status === "seen" ? "The fund has seen it" : "Received" }))
}
