/**
 * The investor's rights, implemented (docs/architecture/73 section 4): a copy of everything held about them, and erasure.
 * Erasure removes the person and what is theirs, and ANONYMISES what funds keep: a fund's relationship, its own messages and its onboarding records stay, with the name removed.
 */
import { sql } from "@/lib/db"
import { logAudit } from "@/lib/audit/audit-log"
import { InvestorError, getProfile, listEntities } from "./profile"
import { revokeShare } from "./passport"
import { TEXTS, LEGAL_VERSION } from "./legal"

const iso = (v: any) => (v ? new Date(v).toISOString() : null)
const json = (v: any) => (typeof v === "string" ? (() => { try { return JSON.parse(v) } catch { return null } })() : v ?? null)

/** Everything held about the person, as data. No file contents: passport files are downloaded one by one. */
export async function exportInvestor(userId: string): Promise<Record<string, unknown>> {
  const profile = await getProfile(userId)
  if (!profile) throw new InvestorError("You do not have an investor profile.", 404, "no_profile")
  const [acct] = (await sql`SELECT email FROM profiles WHERE id::text = ${userId}`) as any[]
  const [terms] = (await sql`SELECT terms_version, terms_accepted_at FROM investor_profiles WHERE user_id = ${userId}`) as any[]
  const entities = await listEntities(userId)
  const ids = entities.map((e) => e.id)
  const owned = entities.filter((e) => e.role === "owner").map((e) => e.id)
  const rel = (await sql`SELECT r.id, r.fund_id, r.entity_id, r.stage, r.initiated_by, r.indicative_min, r.indicative_max, r.timing, r.note, r.shared, r.eligibility_check, r.fit, r.created_at, r.decided_at, r.nda_accepted_at, r.statement_version, COALESCE(l.snapshot->>'name', f.name) AS fund_name
    FROM fund_relationships r LEFT JOIN fund_listings l ON l.fund_id = r.fund_id LEFT JOIN funds f ON f.id = r.fund_id WHERE r.entity_id::text = ANY(${ids}::text[]) ORDER BY r.created_at`) as any[]
  const relIds = rel.map((r) => String(r.id))
  const msgs = (await sql`SELECT m.id, m.relationship_id, m.sender, m.body, m.created_at, (SELECT json_agg(json_build_object('filename', a.filename, 'sizeBytes', a.size_bytes)) FROM relationship_attachments a WHERE a.message_id = m.id) AS attachments
    FROM relationship_messages m WHERE m.relationship_id::text = ANY(${relIds}::text[]) ORDER BY m.created_at`) as any[]
  const meetings = (await sql`SELECT relationship_id, proposed_by, starts_at, link, note, status, created_at FROM relationship_meetings WHERE relationship_id::text = ANY(${relIds}::text[]) ORDER BY created_at`) as any[]
  const events = (await sql`SELECT entity_id, action, detail, at FROM investor_entity_events WHERE entity_id::text = ANY(${ids}::text[]) ORDER BY at`) as any[]
  const docs = (await sql`SELECT id, entity_id, doc_type, filename, size_bytes, created_at, superseded FROM passport_documents WHERE entity_id::text = ANY(${ids}::text[]) AND superseded = false`) as any[]
  const shares = (await sql`SELECT s.entity_id, s.doc_type, s.with_fund, s.shared_at, s.revoked_at, s.retained, s.consent_version, COALESCE(l.snapshot->>'name', f.name) AS fund_name FROM passport_shares s LEFT JOIN fund_listings l ON l.fund_id = s.with_fund LEFT JOIN funds f ON f.id = s.with_fund WHERE s.entity_id::text = ANY(${ids}::text[])`) as any[]
  const team = (await sql`SELECT m.entity_id, m.role, m.created_at, p.display_name FROM investor_entity_members m LEFT JOIN investor_profiles p ON p.user_id = m.user_id WHERE m.entity_id::text = ANY(${owned}::text[])`) as any[]
  const invites = (await sql`SELECT entity_id, email, role, created_at, expires_at, accepted_at, revoked_at FROM investor_entity_invites WHERE entity_id::text = ANY(${owned}::text[])`) as any[]
  const fundInvites = (await sql`SELECT entity_id, fund_id, status, created_at, answered_at, card FROM fund_connect_invites WHERE entity_id::text = ANY(${ids}::text[])`) as any[]
  const lp = (await sql`SELECT lp_id, fund_id, created_at FROM lp_accounts WHERE user_id = ${userId}`.catch(() => [])) as any[]
  return {
    exportedAt: new Date().toISOString(), wordingVersion: LEGAL_VERSION,
    account: { email: acct?.email ?? null, termsVersion: terms?.terms_version ?? null, termsAcceptedAt: iso(terms?.terms_accepted_at) },
    profile, entities,
    requests: rel.map((r) => ({ id: String(r.id), fund: r.fund_name, entityId: String(r.entity_id), stage: r.stage, startedBy: r.initiated_by, indicativeMin: r.indicative_min == null ? null : Number(r.indicative_min), indicativeMax: r.indicative_max == null ? null : Number(r.indicative_max), timing: r.timing, note: r.note, sharedWithFund: json(r.shared), eligibilityCheck: json(r.eligibility_check), fit: json(r.fit), createdAt: iso(r.created_at), decidedAt: iso(r.decided_at), ndaAcceptedAt: iso(r.nda_accepted_at), statementVersion: r.statement_version })),
    conversations: msgs.map((m) => ({ requestId: String(m.relationship_id), from: m.sender, body: m.body, at: iso(m.created_at), attachments: json(m.attachments) ?? [] })),
    meetings: meetings.map((m) => ({ requestId: String(m.relationship_id), proposedBy: m.proposed_by, startsAt: iso(m.starts_at), link: m.link, note: m.note, status: m.status, at: iso(m.created_at) })),
    passport: { documents: docs.map((d) => ({ entityId: String(d.entity_id), type: d.doc_type, filename: d.filename, sizeBytes: Number(d.size_bytes), addedAt: iso(d.created_at) })), shares: shares.map((s) => ({ entityId: String(s.entity_id), type: s.doc_type, fund: s.fund_name, sharedAt: iso(s.shared_at), takenBackAt: iso(s.revoked_at), keptByFund: !!s.retained, consentVersion: s.consent_version })) },
    team: { members: team.map((t) => ({ entityId: String(t.entity_id), name: t.display_name, role: t.role, since: iso(t.created_at) })), invitations: invites.map((i) => ({ entityId: String(i.entity_id), email: i.email, role: i.role, sentAt: iso(i.created_at), answeredAt: iso(i.accepted_at ?? i.revoked_at) })) },
    fundInvitations: fundInvites.map((i) => ({ entityId: String(i.entity_id), status: i.status, sentAt: iso(i.created_at), answeredAt: iso(i.answered_at) })),
    investorPortalLinks: lp.map((l) => ({ fundId: String(l.fund_id), since: iso(l.created_at) })),
    activity: events.map((e) => ({ entityId: String(e.entity_id), action: e.action, at: iso(e.at), detail: json(e.detail) })),
  }
}

export interface ErasureSummary { entitiesAnonymised: number; passportFilesRemoved: number; sharedCopiesDeleted: number; sharedCopiesKeptByFunds: number; requestsWithdrawn: number; messagesRemoved: number; accountDeleted: boolean; whatFundsKeep: string[] }

/**
 * Erases the investor. `deleteAccount` removes the sign-in (injected so tests need no auth service). Needs the typed confirmation.
 */
export async function eraseInvestor(userId: string, confirm: unknown, deleteAccount: (userId: string) => Promise<void>): Promise<ErasureSummary> {
  if (String(confirm ?? "") !== TEXTS.eraseConfirmPhrase.text) throw new InvestorError(`Type ${TEXTS.eraseConfirmPhrase.text} to confirm.`, 400, "confirm")
  if (!(await getProfile(userId))) throw new InvestorError("You do not have an investor profile.", 404, "no_profile")
  const [acct] = (await sql`SELECT lower(email) AS email FROM profiles WHERE id::text = ${userId}`) as any[]
  const s: ErasureSummary = { entitiesAnonymised: 0, passportFilesRemoved: 0, sharedCopiesDeleted: 0, sharedCopiesKeptByFunds: 0, requestsWithdrawn: 0, messagesRemoved: 0, accountDeleted: false,
    whatFundsKeep: ["The fact that a conversation took place, with your name removed", "The fund’s own messages", "Onboarding records the fund is required to keep, including documents it has already checked", "A record that you accepted an NDA, without your address or browser details"] }
  const owned = ((await sql`SELECT id, kind FROM investor_entities WHERE user_id = ${userId}`) as any[])
  for (const e of owned) {
    const id = String(e.id)
    // Take back what funds have not yet looked at; what they have checked they keep.
    for (const sh of (await sql`SELECT id FROM passport_shares WHERE entity_id = ${id}::uuid AND revoked_at IS NULL`) as any[]) {
      try { const r = await revokeShare(userId, id, String(sh.id)); if (r.outcome === "deleted") s.sharedCopiesDeleted++ } catch { /* an entity already archived: nothing to take back */ }
    }
    s.sharedCopiesKeptByFunds += Number(((await sql`SELECT count(*)::int n FROM passport_shares WHERE entity_id = ${id}::uuid AND retained = true AND revoked_at IS NOT NULL`) as any[])[0].n)
    s.passportFilesRemoved += ((await sql`DELETE FROM passport_documents WHERE entity_id = ${id}::uuid RETURNING id`) as any[]).length
    await sql`DELETE FROM investor_entity_members WHERE entity_id = ${id}::uuid`
    await sql`DELETE FROM investor_entity_invites WHERE entity_id = ${id}::uuid`
    await sql`DELETE FROM investor_entity_events WHERE entity_id = ${id}::uuid`
    await sql`DELETE FROM fund_connect_invites WHERE entity_id = ${id}::uuid`
    const rels = (await sql`SELECT id, stage FROM fund_relationships WHERE entity_id = ${id}::uuid`) as any[]
    const relIds = rels.map((r) => String(r.id))
    s.requestsWithdrawn += ((await sql`UPDATE fund_relationships SET stage = 'withdrawn', updated_at = now() WHERE entity_id = ${id}::uuid AND stage IN ('interested', 'in_talks', 'on_hold') RETURNING id`) as any[]).length
    await sql`UPDATE fund_relationships SET user_id = 'erased', shared = jsonb_build_object('erased', true, 'kind', ${e.kind}::text), note = NULL, timing = NULL, indicative_min = NULL, indicative_max = NULL, nda_ip = NULL, nda_agent_hash = NULL, updated_at = now() WHERE entity_id = ${id}::uuid`
    await sql`DELETE FROM relationship_attachments WHERE message_id IN (SELECT id FROM relationship_messages WHERE relationship_id::text = ANY(${relIds}::text[]) AND sender = 'investor')`
    s.messagesRemoved += ((await sql`UPDATE relationship_messages SET body = '[removed at the investor’s request]', sender_user_id = 'erased' WHERE relationship_id::text = ANY(${relIds}::text[]) AND sender = 'investor' RETURNING id`) as any[]).length
    await sql`DELETE FROM relationship_meetings WHERE relationship_id::text = ANY(${relIds}::text[]) AND proposed_by = 'investor'`
    await sql`UPDATE investor_entities SET legal_name = 'Erased investor', country = NULL, tax_residence = NULL, category = NULL, interests = '{}'::jsonb, user_id = 'erased', archived_at = now(), discoverable = false, discoverable_at = NULL, discoverable_version = NULL, updated_at = now() WHERE id = ${id}::uuid`
    s.entitiesAnonymised++
  }
  // Their part in other people's teams, and what is addressed to them.
  await sql`DELETE FROM investor_entity_members WHERE user_id = ${userId}`
  if (acct?.email) await sql`DELETE FROM investor_entity_invites WHERE lower(email) = ${acct.email}`
  await sql`UPDATE investor_entity_events SET user_id = 'erased' WHERE user_id = ${userId}`
  await sql`DELETE FROM investor_claim_codes WHERE user_id = ${userId}`
  await sql`DELETE FROM lp_accounts WHERE user_id = ${userId}`.catch(() => {})
  await sql`DELETE FROM investor_profiles WHERE user_id = ${userId}`
  const [ws] = (await sql`SELECT 1 AS x FROM memberships WHERE user_id::text = ${userId} LIMIT 1`) as any[]
  if (!ws) {
    await sql`DELETE FROM profiles WHERE id::text = ${userId}`.catch(() => {})
    await deleteAccount(userId)
    s.accountDeleted = true
  }
  await logAudit({ actorId: userId, action: "investor.erased", targetType: "investor", targetId: userId, metadata: { entities: s.entitiesAnonymised, accountDeleted: s.accountDeleted } })
  return s
}
