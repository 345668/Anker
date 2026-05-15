/**
 * Outreach orchestrator — the agentic loop.
 *
 *   For one CRM entry, decide which step to run next and run it:
 *
 *     1. ENRICH         — if linked firm has empty `description` /
 *                         `sectors`, kick off enrichFirm() once.
 *     2. PROFILE        — if no investor profile cached for this entry,
 *                         build one via buildInvestorProfile() and
 *                         persist it on the entry's metadata.
 *     3. DRAFT          — if no `outreach_messages` rows exist,
 *                         generate the 4-step DM sequence (drafts only).
 *     4. CLASSIFY-REPLY — for any unclassified inbound reply text the
 *                         user dropped on the entry, classify + draft.
 *     5. SYNC           — finally, run the CRM-sync layer to make sure
 *                         crm_entries.stage matches reality.
 *
 *   HARD RULE — never auto-sends.  All sending stays manual /
 *   HeyReach-mediated, per the 8fundraising playbook's approval gate.
 *
 *   `mode` controls how aggressive the agent is:
 *     "auto"           — run all relevant steps in sequence
 *     "research-only"  — steps 1-2
 *     "draft-only"     — steps 1-3
 *
 * `tick()` runs the agent across many entries — useful for cron-style
 * jobs.  By default it picks the 25 oldest queued entries with
 * incomplete data and runs them through `auto`.
 */

import { sql } from "@/lib/db"
import { enrichFirm } from "@/lib/admin/enrichment"
import { buildInvestorProfile, type InvestorProfile } from "./profile-builder"
import { syncCrmStageFromOutreach } from "./crm-sync"
import { classifyAndDraftReply } from "@/lib/ai/reply-handler"
import { resolveProvider } from "@/lib/ai/provider"

export type AgentMode = "auto" | "research-only" | "draft-only"

export interface RunAgentInput {
  crmEntryId: string
  mode?: AgentMode
  /** Founder context — required if `auto` or `draft-only` will trigger
   *  the DM personalizer.  When omitted we skip the DRAFT step instead
   *  of erroring. */
  founder?: {
    companyName: string
    oneLiner: string
    facts: string[]
    calendarUrl?: string
    currency?: "USD" | "EUR" | "GBP"
  }
  /** Force-rerun even if data is already populated. */
  force?: boolean
  /** Actor that kicked the run off — used for the agent_runs row. */
  actorUserId?: string | null
  /** How the run was triggered — manual UI, scheduled cron, etc. */
  trigger?: "manual" | "tick" | "schedule" | "api"
}

export interface RunAgentResult {
  crmEntryId: string
  mode: AgentMode
  steps: AgentStepResult[]
  durationMs: number
  finalStage: string | null
}

export interface AgentStepResult {
  step: "enrich" | "profile" | "draft" | "classify_reply" | "sync"
  status: "ok" | "skipped" | "error"
  /** Human-readable reason — useful for the agent log UI. */
  detail: string
  durationMs: number
  data?: any
}

/** Run the agent against one CRM entry. */
export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const t0 = Date.now()
  const mode = input.mode ?? "auto"
  const steps: AgentStepResult[] = []

  const [entry] = await sql`SELECT * FROM crm_entries WHERE id = ${input.crmEntryId} LIMIT 1`
  if (!entry) {
    return {
      crmEntryId: input.crmEntryId,
      mode,
      steps: [{ step: "sync", status: "error", detail: "CRM entry not found", durationMs: 0 }],
      durationMs: Date.now() - t0,
      finalStage: null,
    }
  }
  const e = entry as any

  // ─── Step 1: ENRICH the linked firm if data is thin ──────────────────
  if (e.firm_id) {
    const before = Date.now()
    try {
      const [firm] = await sql`SELECT id, description, sectors FROM investment_firms WHERE id = ${e.firm_id} LIMIT 1`
      const f = firm as any
      const isThin = !f?.description || (Array.isArray(f.sectors) ? f.sectors.length === 0 : f?.sectors == null)
      if (isThin || input.force) {
        const r = await enrichFirm({ firmId: e.firm_id, overwrite: !!input.force })
        steps.push({
          step: "enrich", status: "ok",
          detail: `${r.changes.length} field${r.changes.length === 1 ? "" : "s"} updated via ${r.generatedBy}`,
          durationMs: Date.now() - before,
          data: { changes: r.changes, generatedBy: r.generatedBy },
        })
      } else {
        steps.push({ step: "enrich", status: "skipped", detail: "firm already has description + sectors", durationMs: Date.now() - before })
      }
    } catch (err: any) {
      steps.push({ step: "enrich", status: "error", detail: err?.message ?? "enrich failed", durationMs: Date.now() - before })
    }
  } else {
    steps.push({ step: "enrich", status: "skipped", detail: "no firm linked on entry", durationMs: 0 })
  }

  // ─── Step 2: PROFILE the investor (cached on entry's notes JSON) ─────
  let profile: InvestorProfile | null = null
  {
    const before = Date.now()
    try {
      const cached = parseProfileNote(e.notes)
      if (cached && !input.force) {
        profile = cached
        steps.push({ step: "profile", status: "skipped", detail: "profile cached on entry", durationMs: Date.now() - before })
      } else if (e.investor_id || e.firm_id) {
        profile = await buildInvestorProfile({
          investorId: e.investor_id ?? undefined,
          firmId: e.firm_id ?? undefined,
        })
        await persistProfileToEntry(input.crmEntryId, profile)
        steps.push({
          step: "profile", status: "ok",
          detail: `${profile.talkingPoints.length} talking-points, ${profile.attributedDeals.length} attributed deals · ${profile.generatedBy}`,
          durationMs: Date.now() - before,
          data: { confidence: profile.confidence, generatedBy: profile.generatedBy },
        })
      } else {
        steps.push({ step: "profile", status: "skipped", detail: "no investor or firm linked", durationMs: Date.now() - before })
      }
    } catch (err: any) {
      steps.push({ step: "profile", status: "error", detail: err?.message ?? "profile failed", durationMs: Date.now() - before })
    }
  }

  // ─── Step 3: DRAFT the 4-step DM sequence ────────────────────────────
  if (mode !== "research-only") {
    const before = Date.now()
    if (!input.founder?.companyName || !input.founder?.oneLiner) {
      steps.push({ step: "draft", status: "skipped", detail: "founder context missing — fill 'Your context for outreach' on /dashboard/shortlist", durationMs: Date.now() - before })
    } else {
      // Re-use the existing DM personalizer endpoint via the underlying
      // module to avoid an HTTP round-trip from a server-side caller.
      try {
        const { generateOutreachSequence } = await import("@/lib/ai/dm-personalizer")
        const partner = {
          firstName: firstWord(e.display_name),
          fullName: e.display_name,
          title: e.display_title ?? undefined,
          firm: e.display_type ?? "their fund",
          recommendedHook: profile?.talkingPoints?.[0],
        }
        const existing = await sql`
          SELECT id FROM outreach_messages
          WHERE crm_entry_id = ${input.crmEntryId}
          LIMIT 1
        `
        if (existing.length && !input.force) {
          steps.push({ step: "draft", status: "skipped", detail: "drafts already exist for this entry", durationMs: Date.now() - before })
        } else {
          const seq = await generateOutreachSequence(input.founder, partner)
          await persistDrafts(input.crmEntryId, e.user_id, seq)
          steps.push({
            step: "draft", status: "ok",
            detail: "4-step sequence drafted (status=draft, no auto-send)",
            durationMs: Date.now() - before,
            data: { day0Chars: seq.day0.length, day3Chars: seq.day3.length },
          })
        }
      } catch (err: any) {
        steps.push({ step: "draft", status: "error", detail: err?.message ?? "draft failed", durationMs: Date.now() - before })
      }
    }
  }

  // ─── Step 4: CLASSIFY any pending inbound replies ────────────────────
  // Scan outreach_replies for rows on this entry where classification IS
  // NULL (i.e. someone dropped raw inbound text but never classified it
  // — happens when the composer was offline, or a webhook ingested a
  // reply but couldn't reach the AI).  For each one, run the classifier
  // and persist {classification, draft_response, recommended_stage}.
  // The CRM stage transition happens in Step 5 (sync) — we don't double-
  // advance here.
  {
    const before = Date.now()
    try {
      const pending = await sql`
        SELECT id, inbound_text, in_reply_to_message_id
        FROM outreach_replies
        WHERE crm_entry_id = ${input.crmEntryId}
          AND classification IS NULL
        ORDER BY received_at ASC
        LIMIT 5
      `
      if (pending.length === 0) {
        steps.push({ step: "classify_reply", status: "skipped", detail: "no pending inbound replies", durationMs: Date.now() - before })
      } else if (!input.founder?.companyName || !input.founder?.oneLiner) {
        steps.push({
          step: "classify_reply", status: "skipped",
          detail: `${pending.length} pending replies — founder context missing, can't classify`,
          durationMs: Date.now() - before,
        })
      } else {
        const provider = await resolveProvider()
        const generatedBy = provider === "anthropic" ? "anthropic:claude-haiku-4-5"
          : provider === "ollama" ? `ollama:${process.env.OLLAMA_MODEL ?? "default"}`
          : "heuristic"

        let classified = 0
        const labels: string[] = []
        for (const r of pending as any[]) {
          // Find the original DM so the classifier can match tone.
          let originalDm = ""
          if (r.in_reply_to_message_id) {
            const [m] = await sql`SELECT body FROM outreach_messages WHERE id = ${r.in_reply_to_message_id} LIMIT 1`
            if (m) originalDm = (m as any).body
          } else {
            const [m] = await sql`
              SELECT body FROM outreach_messages
              WHERE crm_entry_id = ${input.crmEntryId}
                AND status IN ('sent','delivered','replied')
              ORDER BY sent_at DESC NULLS LAST
              LIMIT 1
            `
            if (m) originalDm = (m as any).body
          }
          const cls = await classifyAndDraftReply({
            partnerName: e.display_name,
            partnerFirm: e.display_type ?? "their fund",
            partnerTitle: e.display_title ?? undefined,
            ourOriginalDm: originalDm,
            theirReply: r.inbound_text,
            founder: input.founder,
          })
          await sql`
            UPDATE outreach_replies SET
              classification     = ${cls.classification},
              draft_response     = ${cls.draft},
              recommended_stage  = ${cls.recommendedStage},
              reengage_on        = ${cls.reengageOnIso ?? null}::date,
              generated_by       = ${generatedBy},
              notes              = ${cls.notes ?? null},
              updated_at         = NOW()
            WHERE id = ${r.id}
          `
          if (r.in_reply_to_message_id) {
            await sql`
              UPDATE outreach_messages SET status = 'replied', updated_at = NOW()
              WHERE id = ${r.in_reply_to_message_id}
                AND status NOT IN ('cancelled','failed')
            `
          }
          classified++
          labels.push(cls.classification)
        }
        steps.push({
          step: "classify_reply", status: "ok",
          detail: `${classified} classified · ${labels.join(", ")}`,
          durationMs: Date.now() - before,
          data: { classified, labels, generatedBy },
        })
      }
    } catch (err: any) {
      steps.push({ step: "classify_reply", status: "error", detail: err?.message ?? "classify failed", durationMs: Date.now() - before })
    }
  }

  // ─── Step 5: SYNC the CRM stage ──────────────────────────────────────
  {
    const before = Date.now()
    try {
      const r = await syncCrmStageFromOutreach(input.crmEntryId)
      steps.push({
        step: "sync", status: "ok",
        detail: r.changed ? `${r.before} → ${r.after} (${r.reason})` : `held at ${r.before} (${r.reason})`,
        durationMs: Date.now() - before,
        data: r,
      })
    } catch (err: any) {
      steps.push({ step: "sync", status: "error", detail: err?.message ?? "sync failed", durationMs: Date.now() - before })
    }
  }

  // Final stage read
  const [after] = await sql`SELECT stage FROM crm_entries WHERE id = ${input.crmEntryId} LIMIT 1`
  const result: RunAgentResult = {
    crmEntryId: input.crmEntryId,
    mode,
    steps,
    durationMs: Date.now() - t0,
    finalStage: (after as any)?.stage ?? null,
  }

  // Persist the run to agent_runs.  Best-effort — failures here never
  // break the call (the result has already been computed).
  try {
    const trigger = input.trigger ?? "manual"
    const anyError = steps.find((s) => s.status === "error")?.detail ?? null
    await sql`
      INSERT INTO agent_runs (
        crm_entry_id, user_id, mode, trigger, steps, duration_ms, final_stage, error,
        started_at, finished_at
      ) VALUES (
        ${input.crmEntryId},
        ${input.actorUserId ?? null},
        ${mode},
        ${trigger},
        ${JSON.stringify(steps)}::jsonb,
        ${result.durationMs},
        ${result.finalStage},
        ${anyError},
        ${new Date(t0).toISOString()}::timestamptz,
        NOW()
      )
    `
  } catch (err: any) {
    console.warn("[outreach-agent] agent_runs insert failed:", err?.message)
  }

  return result
}

/** Cron-style: pick N entries due for agent work and run them. */
export async function tick(opts: {
  limit?: number
  userId?: string
  actorUserId?: string | null
  mode?: AgentMode
  trigger?: RunAgentInput["trigger"]
  founder?: RunAgentInput["founder"]
} = {}): Promise<{ processed: number; results: RunAgentResult[] }> {
  const cap = Math.max(1, Math.min(100, opts.limit ?? 25))
  const rows = opts.userId
    ? await sql`
        SELECT id FROM crm_entries
        WHERE user_id = ${opts.userId} AND stage IN ('queued', 'contacted', 'responded')
        ORDER BY updated_at ASC
        LIMIT ${cap}
      `
    : await sql`
        SELECT id FROM crm_entries
        WHERE stage IN ('queued', 'contacted', 'responded')
        ORDER BY updated_at ASC
        LIMIT ${cap}
      `
  const results: RunAgentResult[] = []
  for (const r of rows as any[]) {
    const result = await runAgent({
      crmEntryId: r.id,
      mode: opts.mode ?? "research-only",
      founder: opts.founder,
      actorUserId: opts.actorUserId ?? null,
      trigger: opts.trigger ?? "tick",
    })
    results.push(result)
  }
  return { processed: results.length, results }
}

// ─── persistence helpers ───────────────────────────────────────────────
function firstWord(s: string): string {
  if (!s) return ""
  return s.split(/\s+/)[0] ?? ""
}

const PROFILE_NOTE_TAG = "<!--anker:investor-profile-->"

function parseProfileNote(notes: string | null | undefined): InvestorProfile | null {
  if (!notes || typeof notes !== "string") return null
  const idx = notes.indexOf(PROFILE_NOTE_TAG)
  if (idx === -1) return null
  const tail = notes.slice(idx + PROFILE_NOTE_TAG.length).trim()
  const m = tail.match(/^```json\n([\s\S]*?)\n```/)
  if (!m) return null
  try { return JSON.parse(m[1]) as InvestorProfile } catch { return null }
}

async function persistProfileToEntry(crmEntryId: string, profile: InvestorProfile) {
  const block =
    `\n\n${PROFILE_NOTE_TAG}\n\`\`\`json\n${JSON.stringify(stripEvidenceForCache(profile))}\n\`\`\`\n`
  // Replace any existing profile block (from `<!--…-->` to next blank line)
  await sql`
    UPDATE crm_entries SET
      notes = CASE
        WHEN notes IS NULL OR notes = '' THEN ${block}
        WHEN position(${PROFILE_NOTE_TAG} in notes) > 0
          THEN regexp_replace(notes, '${PROFILE_NOTE_TAG}[\\s\\S]*?\`\`\`\\s*', ${PROFILE_NOTE_TAG} || E'\\n' || ${`\`\`\`json\n${JSON.stringify(stripEvidenceForCache(profile))}\n\`\`\``})
        ELSE notes || ${block}
      END,
      updated_at = NOW()
    WHERE id = ${crmEntryId}
  `
}

/** Strip the heavy `evidence.*` fields before serialising into the
 *  notes column — keeps the cached blob small. */
function stripEvidenceForCache(p: InvestorProfile) {
  return {
    fullName: p.fullName,
    title: p.title,
    firm: p.firm,
    headline: p.headline,
    summary: p.summary,
    sectors: p.sectors,
    stages: p.stages,
    citations: p.citations,
    attributedDeals: p.attributedDeals,
    recentSignals: p.recentSignals,
    talkingPoints: p.talkingPoints,
    openQuestions: p.openQuestions,
    redFlags: p.redFlags,
    confidence: p.confidence,
    generatedBy: p.generatedBy,
    cachedAt: new Date().toISOString(),
  }
}

async function persistDrafts(
  crmEntryId: string,
  userId: string | null,
  seq: { day0: string; day3: string; day7: string; day14: string; notes?: string },
) {
  const KINDS: { kind: "connection_request" | "follow_up" | "different_angle" | "close_loop"; step: number; field: keyof typeof seq }[] = [
    { kind: "connection_request", step: 0,  field: "day0"  },
    { kind: "follow_up",          step: 3,  field: "day3"  },
    { kind: "different_angle",    step: 7,  field: "day7"  },
    { kind: "close_loop",         step: 14, field: "day14" },
  ]
  for (const k of KINDS) {
    const body = (seq as any)[k.field] as string | undefined
    if (!body) continue
    await sql`
      INSERT INTO outreach_messages (
        user_id, crm_entry_id, kind, step_number, channel,
        body, status, generated_by, model_notes, created_at, updated_at
      ) VALUES (
        ${userId}, ${crmEntryId}, ${k.kind}, ${k.step}, 'linkedin',
        ${body}, 'draft', 'agent:ollama', ${seq.notes ?? null},
        NOW(), NOW()
      )
      ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
        body         = EXCLUDED.body,
        status       = CASE WHEN outreach_messages.status IN ('sent','delivered','replied','accepted')
                            THEN outreach_messages.status ELSE 'draft' END,
        model_notes  = EXCLUDED.model_notes,
        updated_at   = NOW()
    `
  }
}
