# 69. Build plan: teams and a dashboard per entity (doc 61 P5, part 2)

Status: **built 2026-10-20; migration applied to production; see section 8.** Plan as written: Follows docs 64 to 68. Doc 61 section 8: an entity can have people with roles (owner, can act, can view): an advisor or a family member. Every action is attributed to a person. The investor's dashboard has a view per entity. Discoverability (the rest of P5) is a separate document.

## 1. Roles
- **Owner:** the person who created the entity. Edits it, archives it, manages the team. There is one owner in this slice.
- **Can act:** asks funds to talk, withdraws, writes messages, accepts an NDA, proposes and answers meetings, links a record a fund added. Cannot edit the entity or the team.
- **Can view:** reads the entity's requests, threads, documents and meetings. Writes nothing.
- A fund sees **the entity** (what the investor chose to share) and never the team. The contact address a fund receives on acceptance is the owner's. Notices go to the owner and to the people who can act, unless the conversation is muted.

## 2. Joining
The owner invites by email with a role (at most 10 people per entity, at most 10 open invitations). The invitation email says only that an invitation is waiting. The person signs in with that address, which must be confirmed, and sees the invitation on their investor profile page; **accepting is theirs alone** and needs no link or code. A person without an investor profile creates one first (`/investor/start`). An invitation expires after 14 days, can be revoked by the owner, and cannot be used by anyone whose confirmed address differs. A member can leave; the owner can remove a member or change a role.

## 3. Attribution
An event log per entity (`investor_entity_events`): who did what and when (request sent, withdrawn, NDA accepted, entity edited, team changes). It is shown on the entity's dashboard to everyone on the team. Messages already carry their sender.

## 4. Dashboard per entity
`/investor/entities/[id]`: the entity and the person's role, its requests with stage and next step, the team, pending invitations (owner), and recent activity. The list of requests can be filtered by entity.

## 5. Data (migration `2026-10-20f-investor-team.sql`)
`investor_entity_members(entity_id, user_id, role, added_by, created_at)`, `investor_entity_invites(id, entity_id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at)` with one open invitation per entity and address, `investor_entity_events(id, entity_id, user_id, action, detail, at)`. All three are investor-owned in the tenant registry (they belong to the people, not a workspace).

## 6. Access rule
Every investor-side read and write goes through one check: the entity belongs to the person (owner) or the person is a member with a role that allows the action. A relationship is reached through its entity, not through the person who started it, so removing someone ends their access at once.

## 7. Tests
Owner and each role against each action; a non-member sees and does nothing; removal ends access; an invitation only for a confirmed matching address, expiring, revocable, once; limits; the owner cannot be invited or removed; a fund never sees the team and gets the owner's address; notices reach the owner and the people who can act; events are written; existing behaviour for single-person entities is unchanged.

## 8. What was built, and what was not checked (2026-10-20)
- `lib/investor/team.ts` (team, invitations, dashboard); the single access rule in `lib/investor/profile.ts` (`entityIdsFor`, `relationshipEntityIds`, `requireEntity`) now used by requests, conversations, documents, NDA, meetings and claims; routes `/api/investor/entities/[id]/{dashboard,team}` and `/api/investor/invitations`; `/investor/entities/[id]`; an invitations card and an "Open" link per entity on the profile page. A viewer who tries a write is told their role is view only. Migration `2026-10-20f-investor-team.sql` applied to production; the registry classes the three tables as investor-owned.
- Changed on purpose: a relationship is reached through its entity, not through whoever started it; the contact address a fund receives, and the person a fund's accepted request writes to, is the owner's, and notices go to the owner and the people who can act.
- Tested: 11 integration tests on top of the 88 earlier ones, which pass unchanged (roles against each action, invitation rules, limits, expiry, revoke and decline, removal ends access at once, the fund never sees the team, notices to the right people, the dashboard and the attributed activity). Full suite 2316 passing, `tsc` clean.
- **Not checked:** the invitation email delivered, the dashboard and the invitations card in a browser, an invited person with no account (they must create a profile first; sign-up is closed while the flag is off). Co-owners are not supported: one owner per entity.
