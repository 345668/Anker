# 05. Discoverability: the purpose

*Questions 22 to 24. Wording: `07`, "Discoverability". Draft; not legal advice. Built last because it is the feature most likely to need counsel; closed by its own platform switch `investor_discoverability` (off) and, per entity, by the owner's choice (off).*

## Purpose
Today an investor finds funds and asks to talk. Discoverability lets the other direction happen without the investor having picked a specific fund: a listed fund can see that investors who meet its own rules exist and invite them to connect. Purpose limitation: **to let a fund invite an investor who has said they are open to being found; nothing else.** It is not a directory, not a mailing list and not searchable by name.

## What it does *(tested)*
- **Three switches, all off.** The platform switch; the owner of an entity turning it on for that entity (only the owner; it records the time and the wording version); and the fund being itself listed. Turning the platform switch off stops everything at once; an entity switched off disappears from search at once.
- **What a fund sees: a card, never a person.** The kind of entity, country, the investor's self-declared category (labelled), cheque range, sectors, stages, regions and time horizon, and how well it fits this fund. **Never** a name, an email, a team member or any identifier that could be traced to a user. The card's identifier is opaque.
- **Who is shown.** Only entities that meet the fund's own rules (an ineligible entity is never shown), that the fund has no relationship with and that did not decline it in the last 90 days; up to 50, eligible first, then by fit.
- **Small-population safeguard (proposed).** No card is shown at all until **at least 10 entities** have opted in across the platform, so a card cannot point to one person in the early days.
- **The invitation.** The fund presses "Invite to connect". There is **no free text**: a fund cannot write to someone who has not answered. Limits: 20 invitations a day per fund, one live invitation per fund and entity, 90 days before a declined entity can be invited by the same fund, invitations unanswered after 30 days close.
- **What the investor receives.** An in-app invitation naming the fund and showing its listing, and a content-free email to the entity's owner and people who can act: "A fund would like to connect with one of your investing entities. See it and decide here: … Nothing is shared with the fund unless you accept."
- **The answer.** *Accept*: the investor ticks what to share (as for any request); a conversation opens, started by the fund; the fund sees the shared copy and the investor's email address, as in any accepted conversation. *Decline*: the fund learns only "not taken forward". Declining needs no reason.
- **Transparency.** The entity's activity log shows every invitation received and every answer; the investor sees the fund by name. Searching leaves no trace on any entity (only an invitation does).
- **Switching off** is always available and immediate; the card text kept on an answered invitation is emptied after 180 days (`08`).

## What it does not do
- No contact details are ever given to a fund before the investor accepts.
- No automated decision with legal or similar effect: the ranking only orders cards.
- No use of the investor's passport or conversations.

## Proposed position
Consent (Article 6(1)(a)) given by the owner per entity, informed by the statement in `07` (`discoverability_owner`), withdrawable at any time. Recipients: listed funds that meet the rules. The fund is controller of what it receives after acceptance.

## Questions for counsel
- **22.** Is the owner's switch, with that statement, valid consent? Is the invitation notice (in-app and email) direct marketing requiring its own consent (UWG section 7, ePrivacy), given the investor opted in to being found? Should the email be dropped in favour of in-app only?
- **23.** Is a card (kind, country, category, cheque range, interests) identifying in a small population, and is a floor of 10 right?
- **24.** Article 22: any concern with ranking cards by fit?

**Recommendation to the founder:** this is the last switch to open. It is useful only when many investors have signed up, which the first two switches must produce first.
