import { createHash, randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import { callInput } from "./contracts"
import { CallError, type CallScope } from "./access"

export async function saveCall(scope: CallScope, input: unknown, source = "paste") {
  if (!scope.writable) throw new CallError("View-only workspace.", 403)
  const parsed = callInput.safeParse(input)
  if (!parsed.success) throw new CallError(parsed.error.issues[0].message)
  const value = parsed.data
  if (value.crmEntryId) {
    if (scope.persona === "lp") throw new CallError("LP notes cannot link to operational CRM records.", 403)
    const [entry] = await sql`SELECT id FROM crm_entries WHERE id = ${value.crmEntryId} AND user_id = ${scope.userId}`
    if (!entry) throw new CallError("Contact unavailable.", 404)
  }
  // Independent from the token/device: reconnecting cannot duplicate an upload.
  const hash = createHash("sha256").update(JSON.stringify({ ...value, consent: undefined })).digest("hex")
  const [created] = await sql`INSERT INTO investor_calls
    (user_id, org_id, persona, title, investor_name, transcript, crm_entry_id, occurred_at, external_id, content_hash, source, status)
    VALUES (${scope.userId}, ${scope.orgId}, ${scope.persona}, ${value.title}, ${value.investorName ?? null}, ${value.transcript},
      ${value.crmEntryId ?? null}, ${value.occurredAt ?? null}::timestamptz, ${value.externalId}, ${hash}, ${source}, 'captured')
    ON CONFLICT (user_id, org_id, external_id) WHERE external_id IS NOT NULL DO NOTHING RETURNING id, status`
  if (created) return { call: created, duplicate: false }
  const [existing] = await sql`SELECT id, status, content_hash, deleted_at FROM investor_calls
    WHERE user_id = ${scope.userId} AND org_id = ${scope.orgId} AND external_id = ${value.externalId}`
  if (existing?.deleted_at) throw new CallError("This imported call was deleted. Remove the queued copy; it will not be recreated.", 410)
  if (!existing || existing.content_hash !== hash) throw new CallError("This upload ID already belongs to different content. Save edited content as a new call.", 409)
  return { call: { id: existing.id, status: existing.status }, duplicate: true }
}

export async function getCall(scope: CallScope, id: string) {
  const [call] = await sql`SELECT * FROM investor_calls WHERE id = ${id} AND user_id = ${scope.userId} AND org_id = ${scope.orgId} AND deleted_at IS NULL`
  if (!call) throw new CallError("Call not found in this workspace.", 404)
  return call
}

export async function claimAnalysis(scope: CallScope, id: string) {
  if (!scope.writable) throw new CallError("View-only workspace.", 403)
  const runId = randomUUID()
  const [call] = await sql`UPDATE investor_calls SET status = 'analyzing', analysis_started_at = now(),
    analysis_run_id = ${runId}, analysis_error = NULL, updated_at = now()
    WHERE id = ${id} AND user_id = ${scope.userId} AND org_id = ${scope.orgId}
      AND deleted_at IS NULL
      AND (status <> 'analyzing' OR analysis_started_at < now() - interval '3 minutes') RETURNING *`
  if (!call) throw new CallError("Call unavailable or analysis already running. A stalled analysis can be retried after three minutes.", 409)
  return { call, runId }
}

export async function createCallFollowup(scope: CallScope, id: string, draft: string) {
  if (scope.persona === "lp" || !scope.writable) throw new CallError("Outreach is unavailable for this workspace role.", 403)
  const call = await getCall(scope, id)
  if (call.outreach_message_id) return { outreachMessageId: call.outreach_message_id, duplicate: true }
  if (!call.crm_entry_id) throw new CallError("Link a personal CRM contact before creating a draft.")
  if (!draft.trim() || draft.length > 12000) throw new CallError("Add a draft of at most 12,000 characters.")
  // One atomic statement. Never replace another draft or reset a sent message.
  const [result] = await sql`WITH locked AS (
      SELECT * FROM investor_calls WHERE id = ${id} AND user_id = ${scope.userId} AND org_id = ${scope.orgId}
        AND outreach_message_id IS NULL AND deleted_at IS NULL FOR UPDATE
    ), inserted AS (
      INSERT INTO outreach_messages(user_id, crm_entry_id, kind, step_number, channel, body, status, subject, email_to, tracking_id, created_at, updated_at)
      SELECT ${scope.userId}, c.crm_entry_id, 'follow_up', 2, 'email', ${draft.trim()}, 'draft', 'Following up on our call', e.display_email, ${randomUUID()}, now(), now()
      FROM locked c JOIN crm_entries e ON e.id = c.crm_entry_id AND e.user_id = ${scope.userId}
      ON CONFLICT (crm_entry_id, kind) DO NOTHING RETURNING id
    ) UPDATE investor_calls SET outreach_message_id = inserted.id, updated_at = now() FROM inserted
      WHERE investor_calls.id = ${id} RETURNING inserted.id`
  if (result) return { outreachMessageId: result.id, duplicate: false }
  const saved = await getCall(scope, id)
  if (saved.outreach_message_id) return { outreachMessageId: saved.outreach_message_id, duplicate: true }
  throw new CallError("This contact already has a follow-up message, or is no longer available. Review the outbox; no message was overwritten.", 409)
}

export async function deleteCall(scope: CallScope, id: string) {
  if (!scope.writable) throw new CallError("View-only workspace.", 403)
  // Purge content; keep only the import receipt so a lost-response retry cannot resurrect it.
  const rows = await sql`UPDATE investor_calls SET deleted_at = now(), updated_at = now(), status = 'deleted',
    transcript = NULL, title = NULL, investor_name = NULL, occurred_at = NULL, summary = NULL, sentiment = NULL,
    interest_level = NULL, objections = NULL, next_steps = NULL, key_questions = NULL, draft_followup = NULL,
    recommended_stage = NULL, crm_entry_id = NULL, outreach_message_id = NULL, generated_by = NULL,
    analysis_run_id = NULL, analysis_started_at = NULL, analysis_error = NULL
    WHERE id = ${id} AND user_id = ${scope.userId} AND org_id = ${scope.orgId} AND deleted_at IS NULL RETURNING id`
  if (!rows.length) throw new CallError("Call not found.", 404)
  return { ok: true }
}
