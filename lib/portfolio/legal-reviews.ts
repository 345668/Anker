/**
 * Legal & Compliance — phase 5: submit-for-legal-review workflow + credits.
 *
 * Two storage surfaces:
 *
 *  1. `legal_reviews`  one row per submission. The submit endpoint pins
 *     a snapshot of values + approvals + per-section completion at the
 *     moment of submission so the audit trail survives further edits.
 *
 *  2. `funds.legal_credits_balance` + `legal_credit_transactions`
 *     a thin ledger over a counter column. Each submission decrements
 *     1 credit; the canvas Purchase button calls grantCredits() with
 *     reason="purchase". Mocked for now — phase-5 doesn't wire Stripe.
 *
 * Schema-drift guards probe `information_schema` once per process, then
 * the public API short-circuits gracefully when migrations haven't run.
 * Without these guards the canvas crashes for any fund in a deployment
 * that's missing the meta column — same pattern as legal-fields.ts.
 */

import { sql } from "@/lib/db"
import { getFundById, type FundFull } from "@/lib/portfolio/funds"
import { getLegalFields, computeCompletion, type LegalFieldsCompletion } from "@/lib/portfolio/legal-fields"
import { ALL_LEGAL_FIELDS } from "@/lib/portfolio/legal-fields-taxonomy"

// ── types ───────────────────────────────────────────────────────────────

export type LegalReviewStatus =
  | "draft"           // synthetic — no row exists yet
  | "submitted"
  | "in_review"
  | "needs_changes"
  | "approved"
  | "cancelled"

export interface LegalReviewRow {
  id: string
  fundId: string
  status: Exclude<LegalReviewStatus, "draft">
  submittedAt: string
  submittedBy: string | null
  completedAt: string | null
  reviewerEmail: string | null
  reviewerNotes: string | null
  creditsUsed: number
  totalFields: number
  approvedFields: number
  filledFields: number
  emptyFields: number
}

export interface LegalReviewState {
  currentStatus: LegalReviewStatus
  currentReview: LegalReviewRow | null
  history: LegalReviewRow[]
  creditsBalance: number
  /** Required fields that are still empty — gates submission. */
  blockingFields: { key: string; label: string }[]
  /** Submit is allowed when blockingFields is empty AND credits >= 1. */
  canSubmit: boolean
}

export interface SubmitForReviewInput {
  fundId: string
  submittedBy: string | null
  reviewerEmail?: string | null
}

// ── schema probes ──────────────────────────────────────────────────────-

let _reviewsTableCheck: Promise<boolean> | null = null
function hasLegalReviewsTable(): Promise<boolean> {
  if (_reviewsTableCheck) return _reviewsTableCheck
  _reviewsTableCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'legal_reviews'
         LIMIT 1`
      return r.length > 0
    } catch { return false }
  })()
  return _reviewsTableCheck
}

let _creditsColumnCheck: Promise<boolean> | null = null
function hasCreditsColumn(): Promise<boolean> {
  if (_creditsColumnCheck) return _creditsColumnCheck
  _creditsColumnCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'funds'
           AND column_name = 'legal_credits_balance'
         LIMIT 1`
      return r.length > 0
    } catch { return false }
  })()
  return _creditsColumnCheck
}

// ── reads ───────────────────────────────────────────────────────────────

export async function getReviewState(fundId: string): Promise<LegalReviewState> {
  const [credits, latestRow, history] = await Promise.all([
    getCreditsBalance(fundId),
    getLatestReview(fundId),
    getReviewHistory(fundId, 5),
  ])
  const blockingFields = await computeBlockingFields(fundId)
  const currentStatus: LegalReviewStatus = latestRow?.status ?? "draft"
  // canSubmit no longer requires credits (the gate was removed); we
  // still expose creditsBalance so a future billing wire-in can
  // re-introduce the gate without a schema change.
  const canSubmit = blockingFields.length === 0 && currentStatus === "draft"
  return {
    currentStatus,
    currentReview: latestRow,
    history,
    creditsBalance: credits,
    blockingFields,
    canSubmit,
  }
}

export async function getCreditsBalance(fundId: string): Promise<number> {
  if (!(await hasCreditsColumn())) return 0
  try {
    const rows = await sql`
      SELECT COALESCE(legal_credits_balance, 0) AS balance
        FROM funds WHERE id = ${fundId}::uuid LIMIT 1`
    return Number(rows[0]?.balance ?? 0)
  } catch (e) {
    console.error("[legal-reviews getCreditsBalance]", e)
    return 0
  }
}

export async function getLatestReview(fundId: string): Promise<LegalReviewRow | null> {
  if (!(await hasLegalReviewsTable())) return null
  try {
    // Active rows only — once cancelled or approved we still want the
    // canvas to flip back to Draft so the team can iterate on the next
    // submission.
    const rows = await sql`
      SELECT * FROM legal_reviews
       WHERE fund_id = ${fundId}::uuid
         AND status IN ('submitted', 'in_review', 'needs_changes')
       ORDER BY submitted_at DESC
       LIMIT 1`
    if (rows.length === 0) return null
    return mapRow(rows[0])
  } catch (e) {
    console.error("[legal-reviews getLatestReview]", e)
    return null
  }
}

export async function getReviewHistory(fundId: string, limit = 10): Promise<LegalReviewRow[]> {
  if (!(await hasLegalReviewsTable())) return []
  try {
    const rows = await sql`
      SELECT * FROM legal_reviews
       WHERE fund_id = ${fundId}::uuid
       ORDER BY submitted_at DESC
       LIMIT ${limit}`
    return rows.map(mapRow)
  } catch (e) {
    console.error("[legal-reviews getReviewHistory]", e)
    return []
  }
}

/**
 * True while a submission is actively with legal counsel
 * (`submitted` / `in_review`).  `needs_changes` deliberately unlocks —
 * that status means the reviewer sent the docs back for edits.
 * Field-write endpoints call this to reject edits during a review so
 * the reviewer's snapshot matches what the team sees.
 */
export async function isEditingLocked(fundId: string): Promise<boolean> {
  const active = await getLatestReview(fundId)
  return active != null && (active.status === "submitted" || active.status === "in_review")
}

// Required-but-empty fields gate submission. Same definition the editor
// uses (`required: true`) so the operator sees the same red asterisks
// they'd see in the editor mapped 1:1 to the blocker list.
async function computeBlockingFields(fundId: string): Promise<{ key: string; label: string }[]> {
  const payload = await getLegalFields(fundId)
  if (!payload) return []
  const blocking: { key: string; label: string }[] = []
  for (const f of ALL_LEGAL_FIELDS) {
    if (!f.required) continue
    if (f.inputType === "computed") continue  // auto-filled when inputs land
    const v = payload.values[f.key]
    const filled = v != null && v !== "" && !(Array.isArray(v) && v.length === 0)
    if (!filled) blocking.push({ key: f.key, label: f.label })
  }
  return blocking
}

function mapRow(r: any): LegalReviewRow {
  return {
    id: r.id,
    fundId: r.fund_id,
    status: r.status,
    submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : new Date(r.submitted_at).toISOString(),
    submittedBy: r.submitted_by ?? null,
    completedAt: r.completed_at ? (typeof r.completed_at === "string" ? r.completed_at : new Date(r.completed_at).toISOString()) : null,
    reviewerEmail: r.reviewer_email ?? null,
    reviewerNotes: r.reviewer_notes ?? null,
    creditsUsed: Number(r.credits_used ?? 1),
    totalFields: Number(r.total_fields ?? 0),
    approvedFields: Number(r.approved_fields ?? 0),
    filledFields: Number(r.filled_fields ?? 0),
    emptyFields: Number(r.empty_fields ?? 0),
  }
}

// ── writes ──────────────────────────────────────────────────────────────

export class LegalSubmitError extends Error {
  constructor(msg: string, public readonly code: string) { super(msg); this.name = "LegalSubmitError" }
}

export async function submitForReview(input: SubmitForReviewInput): Promise<LegalReviewState> {
  if (!(await hasLegalReviewsTable())) {
    throw new LegalSubmitError("legal_reviews table missing — run the phase-5 migration first.", "schema_missing")
  }
  const fund = await getFundById(input.fundId)
  if (!fund) throw new LegalSubmitError("Fund not found", "not_found")

  // Active submission already in flight? Block — Submit is a new-row op.
  const active = await getLatestReview(input.fundId)
  if (active) {
    throw new LegalSubmitError(`Already in review (status: ${active.status})`, "already_in_review")
  }
  // Required-field gate. The credits gate has been removed — credits
  // remain as a column for forward-compat but no longer block submit.
  const blocking = await computeBlockingFields(input.fundId)
  if (blocking.length > 0) {
    throw new LegalSubmitError(
      `${blocking.length} required field(s) still empty: ${blocking.slice(0, 3).map(b => b.label).join(", ")}${blocking.length > 3 ? ", …" : ""}`,
      "blocking_fields",
    )
  }

  // Snapshot the values + approvals + per-section completion at the
  // moment of submission. Even if the editor keeps moving, the legal
  // reviewer sees exactly what was sent.
  const payload = await getLegalFields(input.fundId)
  if (!payload) throw new LegalSubmitError("Could not load fund payload", "not_found")
  const snap = payload.values
  const apr = payload.approvals
  const comp: LegalFieldsCompletion = payload.completion

  const reviewId = await runSubmitTxn({
    fundId: input.fundId,
    submittedBy: input.submittedBy,
    reviewerEmail: input.reviewerEmail ?? null,
    snapshot: snap,
    approvals: apr,
    completion: comp,
  })
  console.log(`[legal-reviews] submitted fund=${input.fundId} review=${reviewId} by=${input.submittedBy ?? "?"}`)

  // Notify legal counsel — best-effort transactional mail. A failed
  // send never rolls back the submission; the reviewer email is on the
  // review row so it can be resent manually.
  if (input.reviewerEmail) {
    try {
      const { sendEmail, isResendConfigured } = await import("@/lib/email/resend")
      if (isResendConfigured()) {
        const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
        const reviewUrl = appUrl ? `${appUrl}/dashboard/portfolio/fund/legal/review?fund=${fund.slug ?? input.fundId}` : null
        await sendEmail({
          to: input.reviewerEmail,
          subject: `Legal review requested — ${fund.name ?? "fund"} (${comp.filled}/${comp.total} fields filled)`,
          text: [
            `A fund-formation document set was submitted for legal review.`,
            ``,
            `Fund: ${fund.name ?? input.fundId}`,
            `Submitted by: ${input.submittedBy ?? "unknown"}`,
            `Fields: ${comp.filled}/${comp.total} filled, ${comp.approved} approved, ${comp.empty} empty`,
            reviewUrl ? `` : null,
            reviewUrl ? `Review: ${reviewUrl}` : null,
          ].filter((l): l is string => l !== null).join("\n"),
          noTracking: true,
        })
      }
    } catch (e) {
      console.error("[legal-reviews] counsel notification failed (submission unaffected):", e)
    }
  }

  return getReviewState(input.fundId)
}

async function runSubmitTxn(args: {
  fundId: string
  submittedBy: string | null
  reviewerEmail: string | null
  snapshot: Record<string, any>
  approvals: Record<string, any>
  completion: LegalFieldsCompletion
}): Promise<string> {
  // Single statement per call — Neon HTTP doesn't expose BEGIN/COMMIT
  // over the serverless driver. The credits-decrement + ledger write
  // were removed when the credits gate came out of the UI; the
  // legal_credits_balance column and legal_credit_transactions table
  // stay in the schema as forward-compat scaffolding.
  const inserted = await sql`
    INSERT INTO legal_reviews (
      fund_id, status, submitted_by, reviewer_email,
      snapshot_values, snapshot_approvals,
      credits_used, total_fields, approved_fields, filled_fields, empty_fields
    ) VALUES (
      ${args.fundId}::uuid,
      'submitted',
      ${args.submittedBy},
      ${args.reviewerEmail},
      ${JSON.stringify(args.snapshot)}::jsonb,
      ${JSON.stringify(args.approvals)}::jsonb,
      0,
      ${args.completion.total},
      ${args.completion.approved},
      ${args.completion.filled},
      ${args.completion.empty}
    )
    RETURNING id`
  const reviewId = inserted[0].id
  return reviewId
}

// The legal_credit_transactions ledger is no longer written on submit.
// It stays in the schema as forward-compat scaffolding; the admin-only
// /api/.../legal/credits route below is the only writer today.

// ── credit ledger ──────────────────────────────────────────────────────-

export async function grantCredits(args: {
  fundId: string
  amount: number
  reason: "purchase" | "grant" | "refund" | "adjustment"
  memo?: string | null
  createdBy?: string | null
}): Promise<number> {
  if (!(await hasCreditsColumn())) {
    throw new LegalSubmitError("Credits column missing — run the phase-5 migration first.", "schema_missing")
  }
  if (args.amount === 0) return getCreditsBalance(args.fundId)
  if (args.amount < 0 && args.reason !== "adjustment") {
    throw new LegalSubmitError("Only adjustments may decrement credits.", "bad_request")
  }
  const balance = await getCreditsBalance(args.fundId)
  const newBalance = balance + args.amount
  if (newBalance < 0) throw new LegalSubmitError("Would overdraft credit balance.", "overdraft")
  await sql`
    UPDATE funds
       SET legal_credits_balance = ${newBalance},
           updated_at = NOW()
     WHERE id = ${args.fundId}::uuid`
  await sql`
    INSERT INTO legal_credit_transactions (
      fund_id, delta, reason, balance_after, memo, created_by
    ) VALUES (
      ${args.fundId}::uuid,
      ${args.amount},
      ${args.reason},
      ${newBalance},
      ${args.memo ?? null},
      ${args.createdBy ?? null}
    )`
  console.log(`[legal-reviews] credits ${args.amount > 0 ? "+" : ""}${args.amount} fund=${args.fundId} reason=${args.reason} balance=${newBalance}`)
  return newBalance
}

// ── reviewer actions (phase-5 lite — full inbox lands later) ───────────-

export async function setReviewStatus(args: {
  reviewId: string
  status: "in_review" | "needs_changes" | "approved" | "cancelled"
  reviewerEmail?: string | null
  reviewerNotes?: string | null
}): Promise<LegalReviewRow | null> {
  if (!(await hasLegalReviewsTable())) return null
  const completed = args.status === "approved" || args.status === "cancelled"
  const rows = await sql`
    UPDATE legal_reviews
       SET status         = ${args.status},
           reviewer_email = COALESCE(${args.reviewerEmail ?? null}, reviewer_email),
           reviewer_notes = COALESCE(${args.reviewerNotes ?? null}, reviewer_notes),
           completed_at   = CASE WHEN ${completed} THEN NOW() ELSE completed_at END,
           updated_at     = NOW()
     WHERE id = ${args.reviewId}::uuid
     RETURNING *`
  return rows[0] ? mapRow(rows[0]) : null
}
