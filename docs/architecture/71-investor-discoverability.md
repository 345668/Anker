# 71. Build plan: opt-in discoverability (doc 61 P5, last part)

Status: **built 2026-10-20; migration applied to production; both switches verified OFF; see section 7.** Plan as written: Doc 61 section 8: an entity can allow funds whose criteria match to see a limited card with an "invite to connect" button that sends the investor a request, never their contact details. **Off by default, per entity, and behind a platform flag that is off.** It is the feature most likely to need counsel and the privacy notice; it is built so that turning it on is a deliberate decision and so that nothing leaks before then.

## 1. Switches
1. Platform flag `investor_discoverability`, **off**. While off, no entity can be made discoverable, no fund can search, no invitation can be sent, and the API says so.
2. Per entity, **off**, set only by the entity's owner, with the plain statement of what funds will see. Turning it off removes the entity from every search at once.
3. Only a fund that is itself listed (its rules set, its snapshot taken, switched on) may search.

## 2. What a fund sees
A **card**, never a name or an address: the kind of entity (individual, company, trust, fund, family office), country, the investor's self-declared category (labelled as such), the stated cheque range, sectors, stages, regions, time horizon, and how well it fits this fund (the scorer of doc 64, eligibility separate from fit). Ranked eligible first. Up to 50 cards, only entities that are eligible or unclear against the fund's own rules, never an ineligible one. No identity of any person, no team, no email. The card's identifier is opaque to the fund.

## 3. The invitation
The fund presses "Invite to connect" on a card. There is no free text (no unsolicited message). The investor's entity gets an invitation naming the fund and showing its public listing. Limits: 20 invitations a day per fund; one live invitation per fund and entity; after a decline the same fund cannot invite that entity for 90 days. The entity's owner and the people who can act are told by a content-free email that an invitation is waiting.
- **Accept** (owner or a person who can act), choosing what to share (as for a request in doc 64): a relationship starts directly **in talks**, started by the fund, with the eligibility check and the fit stored; the fund is told in the app; from here it is the ordinary conversation of docs 65 to 68. The contact address becomes visible to the fund as for any accepted conversation.
- **Decline:** the fund learns only that it was not taken forward. Nothing about the person or why.
- The fund may withdraw an invitation that is still waiting.

## 4. Transparency
The entity's activity log (doc 69) records every invitation received and every answer. Searching leaves no record on any entity: a fund only ever acts on a card by inviting, and the investor sees the fund by name when it does.

## 5. Data (migration `2026-10-20h-investor-discovery.sql`)
`investor_entities.discoverable_at`; `fund_connect_invites(id, fund_id, entity_id, status 'sent'|'accepted'|'declined'|'withdrawn', invited_by, card jsonb, created_at, answered_at, relationship_id)` (fund-scoped); the platform flag row. Every invitation keeps the card the fund saw.

## 6. Tests
Flag off blocks everything; owner-only toggle; off removes the entity from search at once; only a listed fund searches; cards carry no name, address, team or user id; ineligible entities never appear; ranking; limits (daily, one live, 90 days after a decline); acceptance by a person who can act and not a viewer; the relationship starts in talks, started by the fund, with the stored check; an open relationship already existing is refused; decline reveals nothing; withdrawal; another fund cannot see or answer anything; the registry rules the new table ahead of the funds.

## 7. What was built, and what was not checked (2026-10-20)
- `lib/investor/discovery.ts`; routes `/api/fund/investor-discovery` (cards and invitations; says `open: false` while the flag is off; invite; withdraw), `/api/investor/entities/[id]/discoverable`, `/api/investor/invites`; a "Find investors" section on the fund's investor page (hidden while closed), a "Let funds find you" switch for the owner on the entity dashboard (hidden while closed unless already on), and a "Funds that would like to connect" card on the investor's profile page. Migration `2026-10-20h-investor-discovery.sql` applied to production: the platform flag `investor_discoverability` is **off** (checked on production together with `investor_signup`, also off); the first migration's lock that pinned `discoverable` to false is released, the flag now gates it.
- Tested: 10 integration tests (the switch: off by default, owner only, gated by the flag, off always works; cards carry no name, address, team or user, no ineligible entity, best fit first, closed while the flag is off or the fund unlisted, an entity switched off disappears at once, an existing relationship or a recent decline hides an entity; invitations: no message, content-free notices to the owner and actors only, one live invitation, acceptance by someone who can act and never a viewer starts a conversation in talks started by the fund with the stored check and only the ticked fields, decline reveals nothing and the 90-day wait, the daily limit, withdrawal, an open relationship refuses acceptance, another fund sees nothing, the activity log). Full suite 2339 passing, `tsc` clean.
- **Not checked:** the pages in a browser, a real notice email, and any of it with the flag on. Because this lets a fund find people who did not ask a specific fund to talk, **counsel and the privacy notice must cover it before the flag is turned on** (purpose, lawful basis, what a card reveals, the right to switch off, how long invitations are kept).
