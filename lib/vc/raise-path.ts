/**
 * "Raise your fund": where a fund workspace is on the way from an empty account to a first approved wave of LP outreach (docs/architecture/50).
 * Every step is read from records the product already writes, so nothing new is stored to know where a workspace is.
 */
import { sql } from "@/lib/db"
export type StepId = "fund" | "match" | "shortlist" | "draft" | "send" | "follow"
export interface RaiseStep {
  id: StepId
  label: string
  done: boolean
  detail: string
  href: string | null
  action: "drafts" | "send" | null
  button: string
}
export interface FundFacts {
  id: string
  name: string
  gpName: string | null
  targetRaise: number | null
  minimumCommitment: number | null
  thesis: string | null
  sectors: string[]
  geography: string[]
  gpCommitment: number | null
  fundNumber: number | null
  hq: string | null
  lpTypes: string[]
  valueProposition: string | null
}
export interface RaiseState {
  applicable: boolean
  complete: boolean
  steps: RaiseStep[]
  next: RaiseStep | null
  counts: {
    lpContacts: number
    withEmail: number
    drafts: number
    pendingProposals: number
    authorizations: number
    replies: number
    draftable: number
    draftEmails: number
  }
  /** Up to 25 email drafts of the signed-in sender, ready for the send review. */
  draftEmailIds: string[]
  fund: { id: string; name: string; missing: string[] } | null
}
export const SHORTLIST_MIN = 10
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v)
const money = (n: number) =>
  n >= 1e9
    ? `${+(n / 1e9).toFixed(2)}B`
    : n >= 1e6
      ? `${+(n / 1e6).toFixed(2)}M`
      : n >= 1e3
        ? `${Math.round(n / 1e3)}K`
        : String(n)
export { money }

export function toFundFacts(r: any): FundFacts {
  return {
    id: r.id,
    name: String(r.name ?? r.fund_name ?? "").trim(),
    gpName: r.gp_name ? String(r.gp_name).trim() : null,
    targetRaise: num(r.target_raise) || null,
    minimumCommitment: num(r.minimum_commitment) || null,
    thesis: r.thesis_description ? String(r.thesis_description).trim() : null,
    sectors: list(r.sectors),
    geography: list(r.geographic_focus),
    gpCommitment: num(r.gp_commitment),
    fundNumber: num(r.fund_number),
    hq: r.headquarters_location ? String(r.headquarters_location).trim() : null,
    lpTypes: list(r.target_lp_types),
    valueProposition: r.value_proposition ? String(r.value_proposition).trim() : null,
  }
}
/** What a drafted message may not be written without: the fund's name, who is writing, how much is being raised and what it invests in. */
export function missingForDrafts(f: FundFacts): string[] {
  const m: string[] = []
  if (!f.name) m.push("fund name")
  if (!f.gpName) m.push("GP name")
  if (!f.targetRaise) m.push("target raise")
  if (!f.thesis && !f.sectors.length) m.push("a thesis or sectors")
  return m
}

export async function raiseState(orgId: string, userId: string | null = null): Promise<RaiseState> {
  const [fr] =
    (await sql`SELECT * FROM fund_profiles WHERE org_id = ${orgId} AND is_active = true ORDER BY updated_at DESC NULLS LAST LIMIT 1`) as any[]
  const fund = fr ? toFundFacts(fr) : null
  const missing = fund ? missingForDrafts(fund) : ["a fund profile"]
  const [m] = fund
    ? ((await sql`SELECT count(*)::int AS n FROM lp_match_sessions WHERE fund_profile_id = ${fund.id} AND (coalesce(total_firms_matched, 0) + coalesce(total_contacts_matched, 0)) > 0`) as any[])
    : [{ n: 0 }]
  const [c] =
    (await sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE display_email LIKE '%@%')::int AS emails FROM crm_entries WHERE org_id = ${orgId} AND source = 'lp_matching'`) as any[]
  const [d] =
    (await sql`SELECT count(DISTINCT m.crm_entry_id)::int AS n FROM outreach_messages m JOIN crm_entries e ON e.id = m.crm_entry_id WHERE e.org_id = ${orgId} AND m.kind IN ('email_intro','dm_intro')`) as any[]
  const [p] =
    (await sql`SELECT count(*)::int AS n FROM action_proposals WHERE org_id = ${orgId} AND capability = 'outreach_save_drafts' AND status = 'pending'`) as any[]
  const [a] = (await sql`SELECT count(*)::int AS n FROM send_authorizations WHERE org_id = ${orgId}`) as any[]
  const [r] =
    (await sql`SELECT count(*)::int AS n FROM outreach_replies x JOIN crm_entries e ON e.id = x.crm_entry_id WHERE e.org_id = ${orgId}`) as any[]
  const [dr] =
    (await sql`SELECT count(*)::int AS n FROM crm_entries e WHERE e.org_id = ${orgId} AND e.source = 'lp_matching' AND e.stage = 'queued' AND (e.display_email LIKE '%@%' OR e.display_linkedin IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM outreach_messages x WHERE x.crm_entry_id = e.id AND x.kind IN ('email_intro','dm_intro'))
      AND NOT EXISTS (SELECT 1 FROM action_proposals q WHERE q.org_id = e.org_id AND q.capability = 'outreach_save_drafts' AND q.status = 'pending' AND q.input->>'entryId' = e.id)`) as any[]
  const ready = userId
    ? (
        (await sql`SELECT m.id FROM outreach_messages m JOIN crm_entries e ON e.id = m.crm_entry_id
      WHERE e.org_id = ${orgId} AND m.user_id = ${userId} AND m.kind = 'email_intro' AND m.channel = 'email' AND m.status = 'draft' AND e.display_email LIKE '%@%'
      ORDER BY e.display_score DESC NULLS LAST, m.created_at LIMIT 25`) as any[]
      ).map((x) => String(x.id))
    : []
  const counts = {
    lpContacts: Number(c.n),
    withEmail: Number(c.emails),
    drafts: Number(d.n),
    pendingProposals: Number(p.n),
    authorizations: Number(a.n),
    replies: Number(r.n),
    draftable: Number(dr.n),
    draftEmails: ready.length,
  }
  const fundDone = !!fund && missing.length === 0
  const matchDone = Number(m.n) > 0
  const shortDone = counts.lpContacts >= SHORTLIST_MIN
  const draftDone = counts.drafts > 0 || counts.pendingProposals > 0
  const sendDone = counts.authorizations > 0
  const followDone = counts.replies > 0
  const steps: RaiseStep[] = [
    {
      id: "fund",
      label: "Describe the fund",
      done: fundDone,
      href: "/dashboard/matchmaking",
      action: null,
      button: fund ? "Complete the fund profile" : "Create the fund profile",
      detail: fundDone
        ? `${fund!.name}${fund!.targetRaise ? `, raising ${money(fund!.targetRaise)}` : ""}`
        : fund
          ? `Still needed: ${missing.join(", ")}. Upload the fund deck and the fields fill themselves.`
          : "A fund profile is what the matching and the messages are written from. Upload the fund deck to fill it.",
    },
    {
      id: "match",
      label: "Find LPs",
      done: matchDone,
      href: "/dashboard/matchmaking",
      action: null,
      button: "Run LP matching",
      detail: matchDone
        ? "A ranked list of LPs has been built."
        : "Rank the LPs in the directory against your fund.",
    },
    {
      id: "shortlist",
      label: "Shortlist",
      done: shortDone,
      href: "/dashboard/matchmaking",
      action: null,
      button: "Add the top LPs to your pipeline",
      detail: shortDone
        ? `${counts.lpContacts} LPs in your pipeline${counts.withEmail ? `, ${counts.withEmail} with an email address` : ", none with an email address yet"}.`
        : `Add at least ${SHORTLIST_MIN} from the ranked list to your pipeline (${counts.lpContacts} so far).`,
    },
    {
      id: "draft",
      label: "Write the first wave",
      done: draftDone,
      href: counts.pendingProposals ? "/dashboard/actions" : null,
      action: draftDone ? null : "drafts",
      button: counts.pendingProposals ? "Review the drafts" : "Write drafts for the top LPs",
      detail: counts.pendingProposals
        ? `${counts.pendingProposals} draft${counts.pendingProposals === 1 ? "" : "s"} waiting for your approval in Actions.`
        : draftDone
          ? `${counts.drafts} LP${counts.drafts === 1 ? "" : "s"} have drafts.`
          : counts.draftable
            ? `Writes up to 10 emails and LinkedIn messages from your fund profile. They wait for your approval; nothing is sent.`
            : "Add LPs with an email address or a LinkedIn page first.",
    },
    {
      id: "send",
      label: "Review and send",
      done: sendDone,
      // Drafts waiting for approval come first; once saved, the send review opens right here with the sender's own email drafts.
      href: counts.pendingProposals ? "/dashboard/actions" : ready.length ? null : "/dashboard/send-center",
      action: !counts.pendingProposals && ready.length ? "send" : null,
      button: counts.pendingProposals
        ? "Approve the drafts"
        : ready.length
          ? `Review and send ${ready.length} email${ready.length === 1 ? "" : "s"}`
          : "Review and send",
      detail: sendDone
        ? "You have approved a send."
        : counts.pendingProposals
          ? "Approve the drafts in Actions (one click for all), then review exactly who will get what before anything goes."
          : ready.length
            ? "See each recipient, the text and what will be refused, then approve. Nothing goes without it. LinkedIn messages go through the LinkedIn review queue."
            : "Review exactly who will get what, then approve. Nothing goes without it.",
    },
    {
      id: "follow",
      label: "Follow up",
      done: followDone,
      href: "/vc/crm",
      action: null,
      button: "Open your pipeline",
      detail: followDone
        ? `${counts.replies} repl${counts.replies === 1 ? "y" : "ies"} recorded.`
        : "Replies appear in your pipeline; follow-ups wait for your approval too.",
    },
  ]
  // The way is complete when a wave has been approved; following up is the habit after it, not a gate.
  const complete = fundDone && matchDone && shortDone && draftDone && sendDone
  const next = steps.find((s) => !s.done) ?? null
  return {
    applicable: true,
    complete,
    steps,
    next: complete ? null : next,
    counts,
    draftEmailIds: ready,
    fund: fund ? { id: fund.id, name: fund.name, missing } : null,
  }
}
