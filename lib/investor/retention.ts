/**
 * Retention that runs (docs/architecture/73 section 3). The periods live in `retention-policy.ts` (PROPOSED, for counsel to confirm) so the counsel pack is generated from the same numbers.
 * What this never removes: a fund's relationship records and its own messages, and anything a fund has already checked: those are the fund's, under its own retention.
 */
import { sql } from "@/lib/db"

export { RETENTION } from "./retention-policy"
import { RETENTION } from "./retention-policy"

type Rule = { key: string; what: string; count: () => Promise<number>; apply: () => Promise<number> }
const n = async (q: Promise<any>) => Number(((await q) as any[])[0]?.n ?? 0)

const rules = (): Rule[] => [
  { key: "signup_codes", what: "Pending sign-up codes",
    count: () => n(sql`SELECT count(*)::int n FROM investor_signup_codes WHERE created_at < now() - make_interval(days => ${RETENTION.signupCodesDays})`),
    apply: async () => ((await sql`DELETE FROM investor_signup_codes WHERE created_at < now() - make_interval(days => ${RETENTION.signupCodesDays}) RETURNING id`) as any[]).length },
  { key: "claim_codes", what: "Pending claim codes",
    count: () => n(sql`SELECT count(*)::int n FROM investor_claim_codes WHERE created_at < now() - make_interval(days => ${RETENTION.claimCodesDays})`),
    apply: async () => ((await sql`DELETE FROM investor_claim_codes WHERE created_at < now() - make_interval(days => ${RETENTION.claimCodesDays}) RETURNING id`) as any[]).length },
  { key: "team_invites", what: "Answered, revoked and expired team invitations",
    count: () => n(sql`SELECT count(*)::int n FROM investor_entity_invites WHERE COALESCE(accepted_at, revoked_at, expires_at) < now() - make_interval(days => ${RETENTION.closedTeamInviteDays}) AND (accepted_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at < now())`),
    apply: async () => ((await sql`DELETE FROM investor_entity_invites WHERE COALESCE(accepted_at, revoked_at, expires_at) < now() - make_interval(days => ${RETENTION.closedTeamInviteDays}) AND (accepted_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at < now()) RETURNING id`) as any[]).length },
  { key: "fund_invites_expire", what: "Discoverability invitations left unanswered (closed as withdrawn)",
    count: () => n(sql`SELECT count(*)::int n FROM fund_connect_invites WHERE status = 'sent' AND created_at < now() - make_interval(days => ${RETENTION.fundInviteExpireDays})`),
    apply: async () => ((await sql`UPDATE fund_connect_invites SET status = 'withdrawn', answered_at = now() WHERE status = 'sent' AND created_at < now() - make_interval(days => ${RETENTION.fundInviteExpireDays}) RETURNING id`) as any[]).length },
  { key: "fund_invite_cards", what: "Cards kept on answered discoverability invitations",
    count: () => n(sql`SELECT count(*)::int n FROM fund_connect_invites WHERE status <> 'sent' AND answered_at < now() - make_interval(days => ${RETENTION.fundInviteCardWipeDays}) AND card <> '{}'::jsonb`),
    apply: async () => ((await sql`UPDATE fund_connect_invites SET card = '{}'::jsonb WHERE status <> 'sent' AND answered_at < now() - make_interval(days => ${RETENTION.fundInviteCardWipeDays}) AND card <> '{}'::jsonb RETURNING id`) as any[]).length },
  { key: "passport_archived", what: "Passport files of entities archived long ago (bytes wiped)",
    count: () => n(sql`SELECT count(*)::int n FROM passport_documents WHERE superseded = false AND entity_id IN (SELECT id FROM investor_entities WHERE archived_at < now() - make_interval(days => ${RETENTION.archivedEntityPassportDays}))`),
    apply: async () => ((await sql`UPDATE passport_documents SET superseded = true, content_enc = ''::bytea WHERE superseded = false AND entity_id IN (SELECT id FROM investor_entities WHERE archived_at < now() - make_interval(days => ${RETENTION.archivedEntityPassportDays})) RETURNING id`) as any[]).length },
  { key: "passport_superseded", what: "Superseded passport records that were never shared",
    count: () => n(sql`SELECT count(*)::int n FROM passport_documents d WHERE d.superseded = true AND d.created_at < now() - make_interval(days => ${RETENTION.supersededPassportDays}) AND NOT EXISTS (SELECT 1 FROM passport_shares s WHERE s.document_id = d.id)`),
    apply: async () => ((await sql`DELETE FROM passport_documents d WHERE d.superseded = true AND d.created_at < now() - make_interval(days => ${RETENTION.supersededPassportDays}) AND NOT EXISTS (SELECT 1 FROM passport_shares s WHERE s.document_id = d.id) RETURNING d.id`) as any[]).length },
  { key: "attachments_closed", what: "Message attachments of conversations closed for a year (the messages stay)",
    count: () => n(sql`SELECT count(*)::int n FROM relationship_attachments WHERE relationship_id IN (SELECT id FROM fund_relationships WHERE stage IN ('declined', 'withdrawn') AND updated_at < now() - make_interval(days => ${RETENTION.closedAttachmentsDays}))`),
    apply: async () => ((await sql`DELETE FROM relationship_attachments WHERE relationship_id IN (SELECT id FROM fund_relationships WHERE stage IN ('declined', 'withdrawn') AND updated_at < now() - make_interval(days => ${RETENTION.closedAttachmentsDays})) RETURNING id`) as any[]).length },
  { key: "entity_events", what: "Entity activity log entries",
    count: () => n(sql`SELECT count(*)::int n FROM investor_entity_events WHERE at < now() - make_interval(days => ${RETENTION.eventsDays})`),
    apply: async () => ((await sql`DELETE FROM investor_entity_events WHERE at < now() - make_interval(days => ${RETENTION.eventsDays}) RETURNING id`) as any[]).length },
]

/** Runs every rule (or only counts, with dryRun). A second run finds nothing more to do. */
export async function runRetention(opts: { dryRun?: boolean } = {}): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const r of rules()) out[r.key] = opts.dryRun ? await r.count() : await r.apply()
  return out
}
export const retentionRules = () => rules().map((r) => ({ key: r.key, what: r.what }))
