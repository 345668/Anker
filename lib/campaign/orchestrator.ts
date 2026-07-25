/**
 * Campaign orchestrator — the heart of the engine. Takes one received
 * submission and drives it through the pipeline (CAMPAIGN_ENGINE_PLAN.md §5):
 *
 *   assessing → extract → readiness gate ─┬─ decline (feedback email) → STOP
 *                                         └─ proceed → match → create campaign
 *                                            → mint tokens → draft emails
 *                                            → campaign_ready (sender takes over)
 *
 * Fully automatic gate (locked decision). Idempotent per submission: it only
 * acts on status='received' and flips status as it goes, so a re-run or an
 * overlapping cron tick won't double-process.
 */
import { sql } from "@/lib/db"
import { runFounderMatching } from "@/lib/matching/v2/founder-engine"
import { extractStartupProfile, type FileForExtraction } from "@/lib/matching/v2/document-extractor"
import type { StartupProfile, ScoredInvestorEntity } from "@/lib/matching/v2/founder-types"
import { generateBatch } from "@/lib/ai/provider"
import { assessReadiness } from "./assessment"
import { buildDraftPrompt, assembleEmail } from "./draft"
import { mintInterestToken } from "./interest-tokens"
import { toStartupStage, resolveCampaignOwner, readBlobBytes } from "./util"
import { getCampaignSettings } from "./settings"
import { sendAssessmentDecline } from "@/lib/email/founder-lifecycle"

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://www.an-ker.de"
}

export interface ProcessResult {
  submissionId: string
  outcome: "declined" | "campaign_ready" | "skipped" | "failed"
  score?: number
  investors?: number
  campaignId?: string
  detail?: string
}

/** Atomically claim a received submission (received → assessing). */
async function claim(submissionId: string): Promise<any | null> {
  const rows = await sql`
    UPDATE founder_submissions
    SET status = 'assessing', updated_at = NOW()
    WHERE id = ${submissionId} AND status = 'received'
    RETURNING *
  `
  return rows.length ? rows[0] : null
}

async function fail(submissionId: string, detail: string): Promise<ProcessResult> {
  await sql`UPDATE founder_submissions SET status='failed', decline_reason=${detail}, updated_at=NOW() WHERE id=${submissionId}`
  return { submissionId, outcome: "failed", detail }
}

export async function processSubmission(submissionId: string): Promise<ProcessResult> {
  const sub = await claim(submissionId)
  if (!sub) return { submissionId, outcome: "skipped", detail: "not in 'received' state" }

  const settings = await getCampaignSettings()
  const MAX_INVESTORS = settings.maxInvestors
  const SCORE_FLOOR = settings.scoreFloor

  try {
    // ─── 1. Load materials from Blob ─────────────────────────────────────────
    let deck: FileForExtraction | null = null
    if (sub.deck_blob_key) {
      const bytes = await readBlobBytes(sub.deck_blob_key)
      if (bytes) {
        deck = {
          name: String(sub.deck_blob_key).split("/").pop() || "deck.pdf",
          contentType: "application/pdf",
          base64: bytes.toString("base64"),
        }
      }
    }
    const dataRoom: FileForExtraction[] = []
    for (const key of (sub.data_room_keys || []).slice(0, 3)) {
      const bytes = await readBlobBytes(key)
      if (bytes) dataRoom.push({ name: String(key).split("/").pop() || "doc.pdf", contentType: "application/pdf", base64: bytes.toString("base64") })
    }

    // ─── 2. Extract profile (deck + data room), then overlay form fields ─────
    // Founder-provided form fields are HIGHER-TRUST than OCR/vision extraction
    // and are used as the fallback + matchmaking inputs when the deck can't be
    // read. Form value wins; extraction fills the gaps.
    const extracted = await extractStartupProfile(deck, dataRoom, {
      startupName: sub.startup_name,
      founderEmail: sub.founder_email,
    })
    const tr = (sub.traction_json || {}) as Record<string, any>
    const ex = (sub.extra_fields_json || {}) as Record<string, any>
    const splitList = (v: any): string[] =>
      typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []
    const deckRead = (extracted.confidence ?? 0) >= 0.4 || !!extracted.pitchDeckSummary

    // Narrative fallback so assessment/matching have real text even with no deck.
    const narrative = [
      ex.problem ? `Problem: ${ex.problem}` : "",
      ex.marketSize ? `Market: ${ex.marketSize}` : "",
      ex.businessModel ? `Business model: ${ex.businessModel}` : "",
      ex.competition ? `Competition/moat: ${ex.competition}` : "",
      ex.founderBio ? `Founder: ${ex.founderBio}` : "",
    ].filter(Boolean).join("\n")

    const formThesis = splitList(ex.thesisKeywords)
    const startup: StartupProfile = {
      id: `sp_${sub.id}`,
      name: sub.startup_name || extracted.name || "Startup",
      oneLiner: sub.one_liner || extracted.oneLiner,
      description: extracted.description || ex.problem || sub.one_liner || null,
      sectors: (Array.isArray(sub.sectors) && sub.sectors.length ? sub.sectors : extracted.sectors) || [],
      primarySector: (Array.isArray(sub.sectors) && sub.sectors[0]) || extracted.primarySector,
      stage: toStartupStage(sub.stage || extracted.stage),
      location: sub.location || extracted.location || null,
      geographyTargetRegions: splitList(ex.targetRegions),
      askAmount: numOr(sub.raise_amount, extracted.askAmount),
      preMoneyValuation: extracted.preMoneyValuation ?? null,
      checkSizeIdealMin: numOr(sub.check_size_min, extracted.checkSizeIdealMin),
      checkSizeIdealMax: numOr(sub.check_size_max, extracted.checkSizeIdealMax),
      arr: numOr(tr.arr, extracted.arr),
      mrr: numOr(tr.mrr, extracted.mrr),
      growthRateMom: numOr(tr.growthMom, extracted.growthRateMom),
      teamSize: numOr(tr.teamSize, extracted.teamSize),
      foundedYear: numOr(tr.foundedYear, extracted.foundedYear),
      thesisKeywords: formThesis.length ? formThesis : (extracted.thesisKeywords || []),
      founderBios: ex.founderBio ? [ex.founderBio] : extracted.founderBios,
      pitchDeckSummary: extracted.pitchDeckSummary ?? (narrative || null),
      dataRoomSummary: extracted.dataRoomSummary ?? null,
      extractedFrom: extracted.extractedFrom,
    }

    // ─── 3. Conservative readiness gate ──────────────────────────────────────
    // Feed the founder-provided fields into the assessor too, so a failed deck
    // read doesn't make it report "no traction / no team" when the founder
    // actually supplied them on the form.
    const assessment = await assessReadiness({
      startupName: startup.name,
      oneLiner: startup.oneLiner,
      sectors: startup.sectors,
      stage: startup.stage,
      raiseAmount: startup.askAmount,
      extracted: {
        ...extracted,
        arr: startup.arr ?? undefined,
        mrr: startup.mrr ?? undefined,
        growthRateMom: startup.growthRateMom ?? undefined,
        teamSize: startup.teamSize ?? undefined,
        pitchDeckSummary: extracted.pitchDeckSummary || narrative || undefined,
      },
      formTraction: { ...tr, ...ex, deckRead, narrative },
      threshold: settings.readinessThreshold,
    })

    if (assessment.verdict === "decline") {
      await sql`
        UPDATE founder_submissions
        SET status='declined', assessment_score=${assessment.score},
            assessment_json=${JSON.stringify(assessment)}::jsonb,
            decline_reason=${assessment.summary || "Below readiness threshold"},
            startup_profile_id=${startup.id}, updated_at=NOW()
        WHERE id=${sub.id}
      `
      try {
        await sendAssessmentDecline({
          to: sub.founder_email, founderName: sub.founder_name,
          startupName: startup.name, feedback: assessment.gaps,
        })
      } catch (e: any) {
        console.error("[orchestrator] decline email failed:", e?.message ?? e)
      }
      return { submissionId, outcome: "declined", score: assessment.score }
    }

    // ─── 4. Match against the investor universe ──────────────────────────────
    const matching = await runFounderMatching(startup, { maxContacts: MAX_INVESTORS * 3 })
    const picks: ScoredInvestorEntity[] = (matching.contacts || [])
      .filter((c) => !!c.email && c.score >= SCORE_FLOOR)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_INVESTORS)

    // ─── 5. Create the outreach campaign ─────────────────────────────────────
    const ownerId = await resolveCampaignOwner()
    const [campaign] = await sql`
      INSERT INTO outreach_campaigns (user_id, name, description, default_channel, status, created_at, updated_at)
      VALUES (${ownerId}, ${`${startup.name} — investor outreach`},
              ${`Auto-generated from founder submission ${sub.public_ref}. ${picks.length} matched investors.`},
              'email', 'active', NOW(), NOW())
      RETURNING id
    `
    const campaignId = campaign.id as string

    // ─── 6. Insert CRM entries + mint tokens + draft emails ──────────────────
    const entryIds: string[] = []
    for (const inv of picks) {
      const [row] = await sql`
        INSERT INTO campaign_crm_entries (
          outreach_campaign_id, submission_id, investor_id, firm_id,
          investor_email, investor_name, match_score, match_rationale, stage
        ) VALUES (
          ${campaignId}, ${sub.id}, ${inv.id}, ${inv.firmId ?? null},
          ${inv.email}, ${inv.name}, ${Math.round(inv.score)}, ${inv.whyMatch || inv.reasons?.[0] || null}, 'queued'
        )
        ON CONFLICT (outreach_campaign_id, investor_id) WHERE investor_id IS NOT NULL DO NOTHING
        RETURNING id
      `
      if (row?.id) entryIds.push(row.id)
    }

    // Draft in one batched pass (concurrency-limited).
    const draftable = picks.slice(0, entryIds.length)
    const prompts = draftable.map((inv) => buildDraftPrompt({ startup, investor: inv }))
    const results = prompts.length
      ? await generateBatch(prompts, { maxTokens: 500, temperature: 0.5, json: true, task: "campaign_draft" }, 8)
      : []

    for (let i = 0; i < entryIds.length; i++) {
      const entryId = entryIds[i]
      const token = await mintInterestToken(entryId)
      const base = `${appUrl()}/api/public/interest/${token}`
      const { subject, body } = assembleEmail({
        llmJson: results[i] || "",
        startup,
        investorName: draftable[i].name,
        yesUrl: `${base}?a=yes`,
        noUrl: `${base}?a=no`,
        viewUrl: `${base}?a=view`,
      })
      await sql`
        UPDATE campaign_crm_entries
        SET draft_subject=${subject}, draft_body=${body}, updated_at=NOW()
        WHERE id=${entryId}
      `
    }

    // ─── 7. Ready for the sender ─────────────────────────────────────────────
    await sql`
      UPDATE founder_submissions
      SET status='campaign_ready', assessment_score=${assessment.score},
          assessment_json=${JSON.stringify(assessment)}::jsonb,
          startup_profile_id=${startup.id}, outreach_campaign_id=${campaignId},
          send_approved=${settings.autoSend}, updated_at=NOW()
      WHERE id=${sub.id}
    `
    return { submissionId, outcome: "campaign_ready", score: assessment.score, investors: entryIds.length, campaignId }
  } catch (e: any) {
    console.error("[orchestrator] failed for", submissionId, e?.message ?? e)
    return fail(submissionId, e?.message ?? "orchestration error")
  }
}

function numOr(a: any, b: any): number | null {
  const na = a == null ? null : Number(a)
  if (na != null && Number.isFinite(na)) return na
  const nb = b == null ? null : Number(b)
  return nb != null && Number.isFinite(nb) ? nb : null
}
