# 61. Spec: the investor's own side (profile, interest in a fund, talks, onboarding, several funds)

Status: **spec. Nothing is built.** Extends doc 60 (the LP leg), which covers what happens **after a fund has an investor on its list**. This document covers what comes **before and around it**: an investor who creates their own profile, asks to join a fund, talks to it, is invited to onboard, and may do the same with other funds and for several investing entities. Raised by the founder on 2026-10-18, after the live test of doc 60 (2026-10-17) showed that the whole leg starts from a fund adding an investor by hand. Builds on 60, 54 (privacy), 41 (entitlements), 43 (action layer) and 56 (alerts).

## 1. What is true today (measured 2026-10-18)
- **Every investor relationship starts with the fund.** An investor exists only as a row a fund added (`fund_lps`). Nothing lets an investor start one: no sign-up for investors, no way to ask a fund to take them on. The 8 existing rows are demo records.
- **No investor identity outside a fund.** An investor has no profile of their own. What the portal knows about them is per fund (`fund_lps`, the details they confirmed in doc 60). The optional account made in doc 60 L5 (`lp_accounts`) ties a sign-in to one investor row per fund, not to a person who has several.
- **Sign-up is invitation-only** with the shared platform code or a per-person token. Doc 60 deliberately made an investor account possible only from inside a code-verified portal session. There is no public investor sign-up and no email confirmation step for one (the existing sign-up marks addresses as confirmed without asking).
- **A listing flag exists and is off for every fund.** `funds.listed_for_lps` and a discovery lens for investors (`/lp/discover`) are built, but the page is reachable only by people a fund has already attached, so it cannot be how a new investor finds a fund. All 4 funds are `listed_for_lps = false`.
- **An investor-profile table exists and is empty.** `lp_entities` (name, type, contact, address, tax id, KYC status, accredited flag, 17 columns) has 0 rows and is firm-linked; it was never used.
- **No investor persona is in use:** 0 of 14 memberships. The pipeline a fund uses for investors today is the fundraise stage on `fund_lps` (`prospective`, `invited`, `signed`, `countersigned`) plus the matching engine that proposes investors to contact (directory-driven, outbound).

## 2. The journey this spec adds
```
 Investor: create profile ──► find a fund ──► ask to connect ──► (fund replies) ──► talks ──► invited to onboard ──► full onboarding (doc 60) ──► active investor
                                   │                │                  │                │                  │
                                   │                └─ declined ◄──────┘                └─ declined/withdrawn / on hold
 Fund: (or it starts here) ──► invites a known investor ──► same relationship, starts at "talks" or "invited to onboard"
```
One investor, **one profile**, any number of **investing entities** (themselves, their family trust, their company), each with any number of **funds**. The same relationship record serves both directions: the investor can ask, or the fund can invite.

## 3. Principles
1. **The investor owns their profile; each fund owns its relationship.** What a fund learns is what the investor shares with it, fund by fund, and the investor can see and withdraw it.
2. **Nothing reaches a fund without the investor choosing to send it,** and nothing about an investor is visible to other funds.
3. **A fund decides who it talks to.** Interest is a request, not an entitlement. Declining is quiet and carries no obligation to explain.
4. **Eligibility first, honestly.** Funds state who may invest (investor category, countries, minimum ticket); the investor sees a plain self-check before sending interest. Anker routes the conversation; it is not an offer of securities and gives no advice. Marketing rules differ by country, so a fund's visibility to investors is its own switch and counsel reviews the wording before any fund goes public (section 11).
5. **Onboarding is the existing leg.** When a fund invites an investor to onboard, doc 60 takes over unchanged (details, terms, verification, subscription, countersign, account and statements); this document only supplies who the investor is and which fund they are joining.
6. **Free for investors** (doc 42). The fund's plan carries the cost.

## 4. The investor's profile
- **Account.** An investor signs up with an email address and a password, **confirms the address with an emailed code** (the same six-digit mechanism as the portal), accepts the privacy notice and terms (versioned), and lands on their dashboard. Signing up needs no invitation. Rate limits per address and per network; abuse reports; unconfirmed accounts see nothing and are removed after 7 days.
- **Core profile (the person):** name, country, languages, how they prefer to be contacted, a short "about me" (optional, never required).
- **Investing entities.** Each is "who is investing": an individual (default, created at sign-up), a company, a trust, a fund, a family office. Per entity: legal name, kind, country and tax residence, investor category (professional, semi-professional, other, not sure: **self-declared and labelled as such**), the kinds of funds they look at (stage, sectors, geographies, typical ticket range, time horizon), and optional discoverability (section 8). A person manages several entities from one login.
- **What stays out of the profile:** tax numbers and identity documents. Those are asked for **per fund, at onboarding** (doc 60), because a fund's compliance team, not Anker, decides what it needs. A later "verification passport" (section 12, P6) lets an investor reuse documents with their consent.
- **Claiming existing records.** A fund may already have added the investor (doc 60). When the investor signs up with a confirmed address that matches such a record, the dashboard offers "This fund added you as an investor. Link it to my profile" (after a code sent to that address); the investor entity is created from what they confirm, and the fund's relationship appears on their dashboard. The L5 account made inside a portal session becomes the same thing: it is migrated, not duplicated.

## 5. Finding a fund and asking to connect
- **Fund page for investors.** A fund that chooses to be listed (`listed_for_lps`, now meaningful) shows a short public page: name, manager, strategy, stage and sector focus, target size, vintage, domicile and structure, minimum commitment, who may invest, status (raising, closing, closed), and the people to talk to. Nothing confidential: documents appear only after the fund accepts (section 6). The fund controls every field and can switch the page off at any time.
- **Browsing.** Search and filters for listed funds (the existing discovery lens, finally reachable by any confirmed investor). No ranking that favours paying funds without saying so.
- **Eligibility self-check** before sending interest: the fund's stated criteria against the investor's entity (category, country, ticket). A mismatch warns and explains; the fund's own rule decides whether the request can still be sent.
- **Request to connect** (the first stage): choose the investing entity, an indicative ticket (a range, optional), timing, a short note, and which profile fields to share with this fund (the entity's name, country, category and interests are the default; contact email is shared only on the fund's acceptance). One open request per entity per fund. A fund can set a daily cap.
- **Without a listing,** an investor can still be introduced by a fund's invitation link or a code the fund gives out; the flow after that is identical.

## 6. The relationship: stages, who moves them, what each unlocks
| Stage | Meaning | Moved by | Unlocks |
| --- | --- | --- | --- |
| `interested` | The investor asked to connect | Investor (or fund on invite) | The fund sees the request and what the investor shared |
| `in_talks` | The fund accepted; a conversation has started | Fund | Message thread, fund materials the fund chooses to share, meeting requests; the investor's contact email is shared |
| `invited_to_onboard` | The fund wants to proceed | Fund | An investor record is created for the fund (`fund_lps`), linked to the entity, and **doc 60 begins**: details, terms, verification, subscription |
| `onboarding` | The investor is working through doc 60 | Automatic | The portal checklist and everything in doc 60 |
| `active` | Countersigned | Automatic from doc 60 | Capital account, statements, notices, documents |
| `on_hold` | Paused by either side | Either | Nothing new; history kept |
| `declined` / `withdrawn` | The fund declined / the investor withdrew | Fund / investor | The fund stops seeing new information; messages become read-only |
- **Reasons** are optional for the fund and never shown as a verdict; the investor sees "The fund is not able to take this forward" plus anything the fund chooses to write.
- **Nudges.** A request unanswered for 7 days raises a reminder to the fund's owners (in-app and the existing alert path), and after 14 days offers the investor a one-line withdrawal. A relationship quiet for 30 days in `in_talks` asks both sides whether to continue. No automatic decline.
- **The fund can also start it:** inviting an investor (doc 60 L1) now creates a relationship directly at `in_talks` or `invited_to_onboard`, so both directions end in the same place.

## 7. Talks
- **Message thread** per relationship: plain text up to 4,000 characters, attachments as PDF up to 4 MB, notified by short email with a link (never the message, the fund name only, no amounts). Either side can mute or block (a block ends the relationship as `declined`). No realtime chat.
- **Materials the fund shares** (deck, factsheet, terms summary, data room access) are granted per relationship from the fund's own library, opened through the logged download route of doc 60, withdrawn at any time. An NDA can be required first: accepted in the portal with the version and time recorded.
- **Meeting request:** a proposed time or the fund's booking link; the platform stores the link and the outcome, not the call.
- **Notes** the fund keeps about an investor are the fund's and are never shown to the investor.

## 8. Several funds, several entities, several people
- **Dashboard** for the investor (`/lp`, extended): each fund with its stage and the next thing they must do, an inbox of questions from funds, a "find funds" entry, and per entity tabs. A fund's activity appears only on that fund's row.
- **Isolation.** A fund sees the relationship, the shared fields, the thread and its own onboarding records. It does not see the investor's other funds, entities or whether they are talking to anyone else.
- **Team access (later, P5):** an entity can have people with roles (owner, can act, can view): an advisor or a family member. Every action is attributed to a person.
- **Discoverability (opt-in, default off):** an entity can allow funds whose criteria match to see a limited card (kind, country, ticket range, interests, not the name) with a "invite to connect" button that sends the investor a request, never their contact details. Off until the first fund customer needs it; counsel and the privacy notice first.

## 9. The fund's side
- **Investor pipeline** in the fund workspace (extends the LP panel of doc 60): inbound requests with the shared fields and eligibility check, filters, accept or decline in one click, bulk decline, a board by stage (interested, in talks, invited to onboard, onboarding, active), reminders, internal notes, assignee. A new request appears in the Actions inbox as a proposal (doc 43, low risk, untrusted source) so approving is the same gesture as elsewhere; the investor's text is quoted, never acted on.
- **Eligibility rules the fund sets:** allowed investor categories, allowed countries, minimum ticket, whether professional-only, whether an NDA is required, a daily cap. Requests that fail a hard rule are held for the fund with a reason, not silently dropped.
- **Plan and metering:** a fund's plan sets how many relationships it can hold and whether it may list; the investor side is free. Messaging and storage count toward the fund's allowance (doc 58).
- **Reporting:** per fund, requests received, accepted, time to respond, conversion between stages. These feed the activation view.

## 10. Data, privacy and security
- **A new class of data:** the investor's profile belongs to **the investor**, not to any workspace, so it sits outside tenant erasure and export. Rules: a fund workspace's erasure removes its relationships, threads and shared-field copies; an investor's own erasure (doc 54 request) removes the profile and entities and **anonymises** the relationship rows each fund keeps (the fund keeps its legal records, such as a countersigned subscription, under its own retention). The tenant registry gets an explicit "investor-owned" category and a test that no table is both.
- **Sharing is a copy with a purpose:** what an investor shares with a fund is stored with that fund's relationship, versioned, with the time. Withdrawing consent hides it from new views and marks the copy for removal unless the fund must keep it (onboarding records).
- **Abuse:** sign-up and message rate limits, a report button, a block, link and file checks as in doc 60, emails that never contain content.
- **Authentication:** the same account mechanism as other users, with email confirmation before any use; password reset through the existing flow. MFA is a later option (G15 of doc 37).
- **No unsolicited contact:** a fund cannot message an investor who has not interacted with it; discoverability never reveals contact details.

## 11. Regulatory care (not legal advice)
Offering or marketing a fund to investors is regulated differently by country and investor type (professional-only regimes, pre-marketing rules, financial promotion rules). So: listing is **off by default and per fund**; each fund states who may invest and the page says so; Anker shows no performance figures or returns on a public page; every investor request states that it is an expression of interest and not an offer or an obligation; counsel reviews the page template, the self-check wording and the first listed funds before any goes live (a founder step, like the privacy notice). Anker's role is stated plainly as a communication and administration platform.

## 12. Slices
- **P1 (about 3 days): the profile.** Public investor sign-up with email code, profile and entities, dashboard shell, claim of fund-added records, migration of L5 accounts into profiles. Alerts for sign-up abuse.
- **P2 (about 3 days): listing and interest.** Fund page and switch, discovery for any confirmed investor, eligibility self-check, request to connect, the fund's inbound queue with accept and decline, proposal in the Actions inbox.
- **P3 (about 3 days): talks.** Relationship stages and history, message thread with email notifications, shared materials per relationship, NDA step, reminders and nudges.
- **P4 (about 2 days): the bridge to doc 60.** "Invite to onboard" creates the fund's investor record from the entity and relationship; the portal and dashboard show the doc 60 checklist under that fund; stage follows doc 60 to `active`.
- **P5 (about 3 days): several entities and people,** team roles, per-entity dashboards, opt-in discoverability with the limited card.
- **P6 (about 3 days): verification passport.** Reuse of identity documents across funds with per-fund consent and revocation, so a second fund's onboarding does not ask again; the fund still reviews and decides.
About 17 working days. P1 to P4 make the whole journey possible for one entity and several funds; P5 and P6 are depth.

## 13. Tests
Sign-up needs a confirmed address; an unconfirmed account sees nothing and expires; rate limits; claim needs the code and matches only the confirmed address; the migrated L5 account is one profile, not two. A listed fund shows only what it chose; a delisted fund disappears; the eligibility self-check and the fund's hard rules; one open request per entity per fund; the daily cap. A fund sees only its own relationships and only the fields shared; another fund sees nothing; withdrawing consent hides the copy. Stage moves: who may do which, the forbidden ones (an investor cannot accept their own request, cannot move to `onboarding`), `invited_to_onboard` creates exactly one investor record and doc 60 runs from it. Messages: size and file rules, notification emails carry no content, block ends the relationship, muted threads stay quiet. Erasure: a fund's erasure leaves the profile; an investor's erasure anonymises relationships; the registry test for the new category. Proposal in the inbox quotes the text and applies nothing by itself.

## 14. Decisions for the founder (defaults chosen; change any)
1. **Investors can sign up without an invitation,** with a confirmed email (default yes; the alternative is investor sign-up by fund invitation only, which makes the profile a claim step, not a starting point).
2. **Listing is off by default and per fund;** no performance figures publicly (default yes).
3. **Investors are free;** funds pay through their plan with a cap on relationships (default; numbers to be set in doc 42's catalogue).
4. **Declines carry no required reason** (default yes).
5. **Discoverability is opt-in, default off, and built last** (default yes; it is the feature most likely to need counsel).
6. **Tax ids and identity documents stay per fund until the verification passport** (default yes).
7. **Reminders at 7 and 14 days;** a quiet relationship at 30 days asks both sides, never auto-declines (default yes).
8. **Counsel reviews the listing page and eligibility wording before the first fund goes public** (founder step).

## 15. Not in scope
Selling or transferring fund interests between investors (secondary), moving money (wire details are shown, never initiated), electronic signatures with legal validation, a public marketplace for search engines, investor-to-investor features, ratings of funds, a mobile app.
