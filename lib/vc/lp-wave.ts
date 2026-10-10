/** Write the first wave of LP drafts as proposals (docs/architecture/50 §4): bounded, from the fund profile, one pending proposal per LP, nothing sent. */
import { sql } from "@/lib/db"
import { propose as realPropose } from "@/lib/actions/store"
import { generateDetailed } from "@/lib/ai/provider"
import { buildLpPrompt, checkLpDraft } from "./lp-draft"
import { missingForDrafts, toFundFacts } from "./raise-path"
export const WAVE_PER_REQUEST = 10
export const WAVE_PER_DAY = 25
export const RUN_ID = "raise-path"
export interface WaveScope {
  orgId: string
  userId: string
  persona?: string | null
  email?: string | null
}
export interface WaveDeps {
  generate: (prompt: string) => Promise<string>
  propose: typeof realPropose
}
const defaultDeps: WaveDeps = {
  generate: async (p) =>
    (await generateDetailed(p, { task: "dm_personalize", maxTokens: 700, temperature: 0.6 })).text,
  propose: realPropose,
}
export class WaveError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message)
  }
}
export interface WaveResult {
  proposed: number
  skipped: Array<{ name: string; reason: string }>
  remainingToday: number
  stoppedAtLimit: boolean
  considered: number
}

export async function draftLpWave(
  scope: WaveScope,
  want: number,
  deps: WaveDeps = defaultDeps,
): Promise<WaveResult> {
  const [fr] =
    (await sql`SELECT * FROM fund_profiles WHERE org_id = ${scope.orgId} AND is_active = true ORDER BY updated_at DESC NULLS LAST LIMIT 1`) as any[]
  if (!fr) throw new WaveError("Create the fund profile first: the messages are written from it.")
  const fund = toFundFacts(fr),
    missing = missingForDrafts(fund)
  if (missing.length)
    throw new WaveError(
      `Add these to the fund profile first, so the messages are accurate: ${missing.join(", ")}.`,
    )
  const [t] =
    (await sql`SELECT count(*)::int AS n FROM action_proposals WHERE org_id = ${scope.orgId} AND run_id = ${RUN_ID} AND created_at >= date_trunc('day', now())`) as any[]
  const room = Math.max(0, WAVE_PER_DAY - Number(t.n))
  if (!room)
    throw new WaveError(
      `Today's limit of ${WAVE_PER_DAY} drafted contacts is reached. Review them in Actions, then continue tomorrow.`,
      429,
    )
  const n = Math.max(1, Math.min(WAVE_PER_REQUEST, Math.floor(want) || WAVE_PER_REQUEST, room))
  // Contacts with an email first (the sendable channel), then by match score; skip anyone who already has a draft or a pending proposal.
  const entries =
    (await sql`SELECT e.id, e.display_name, e.display_title, e.display_type, e.display_location, e.why_match, e.research_summary
    FROM crm_entries e
    WHERE e.org_id = ${scope.orgId} AND e.source = 'lp_matching' AND e.stage = 'queued' AND (e.display_email LIKE '%@%' OR e.display_linkedin IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM outreach_messages m WHERE m.crm_entry_id = e.id AND m.kind IN ('email_intro','dm_intro'))
      AND NOT EXISTS (SELECT 1 FROM action_proposals p WHERE p.org_id = e.org_id AND p.capability = 'outreach_save_drafts' AND p.status = 'pending' AND p.input->>'entryId' = e.id)
    ORDER BY coalesce(e.display_email LIKE '%@%', false) DESC, e.display_score DESC NULLS LAST, e.added_at ASC LIMIT ${n}`) as any[]
  const out: WaveResult = {
    proposed: 0,
    skipped: [],
    remainingToday: room,
    stoppedAtLimit: false,
    considered: entries.length,
  }
  for (const e of entries) {
    try {
      const d = checkLpDraft(await deps.generate(buildLpPrompt(e, fund)), e, fund)
      if (d.skip) {
        out.skipped.push({ name: e.display_name ?? "A contact", reason: d.skip })
        continue
      }
      // The LP's research brief came from crawled pages, so the run is marked untrusted: the proposal can only ever be reviewed by a person, never auto-applied.
      await deps.propose(
        { orgId: scope.orgId, userId: scope.userId, persona: scope.persona ?? "vc" } as any,
        "outreach_save_drafts",
        { entryId: String(e.id), subject: d.subject, email: d.email, dm: d.dm },
        { runId: RUN_ID, trust: "untrusted" },
        { userId: scope.userId, email: scope.email },
      )
      out.proposed++
      out.remainingToday--
    } catch (err: any) {
      if (err?.status === "budget_stopped") {
        out.stoppedAtLimit = true
        out.skipped.push({ name: e.display_name ?? "A contact", reason: "stopped at the AI spending limit" })
        break
      }
      out.skipped.push({
        name: e.display_name ?? "A contact",
        reason: `no draft: ${String(err?.message ?? err).slice(0, 80)}`,
      })
    }
  }
  return out
}
