# 60. Spec: the LP leg (invite, onboard, subscribe, watch)

Status: **spec. Nothing is built.** Implements doc 37 gap G18 ("LP persona is 3 pages with no onboarding") and section 6.3 (the LP leg: onboarding, subscription, capital-account view, self-serve documents). Builds on 41 (entitlements), 43 (action layer: LP requests become proposals), 54 (privacy), 56 (alerts) and 58 (metering: LPs cost nothing to the fund beyond what they use). Raised on 2026-10-17 because the thesis is founder, GP and LP on one platform, and the LP leg cannot currently be entered by an actual LP.

## 1. What is true today (measured 2026-10-17)
- **Nobody can sign in as an LP.** The LP portal (`/lp`) lets in any signed-in user whose email matches a contact attached to a `fund_lps` row. **All 8 `fund_lps` rows have no contact attached** (`lp_contact_id` is empty on every row), so the match finds nobody. The same gap blocks the second door: "send the portal link" mails the LP's contact address, and there is none.
- **Accounts are invite-only with one global code** (`SIGNUP_INVITE_CODE`). An LP who is not given that code cannot make an account, and giving every LP the platform-wide code is the wrong answer.
- **The second door exists and works without an account:** `/portal/[token]`, a per-LP link (token stored only as a hash, expiry, revocation, view count, an access log, an assistant, published quarterly letters, documents, the capital position history). Only **1 token has ever been minted** and the access log has **0 rows**.
- **What LPs can do today:** read their position, documents and letters; acknowledge capital calls and confirm distributions (audited) from `/lp/distributions`, which needs an account. **What they cannot:** confirm their details, accept terms, supply KYC, receive a subscription package, return signed documents, see a capital account statement.
- **Funds' records:** 4 funds, 8 LPs (7 committed, 1 fully called, all marked `countersigned` because that is the column default: no subscription workflow ever set it), 4 capital calls with 32 line items, 3 distributions with 24 line items, 9 KYC cases, 1 KYC document. `lp_entities`, `lp_commitments`, `lp_positions`, `lp_reports` are empty.
- **LPs are zero memberships:** all 14 memberships are founder (11) or VC (3). The persona has never been used.

## 2. Principles
1. **An LP should never need an account to do the first thing.** The fund sends a personal link; the LP is in. An account is an option for people with several funds, never a gate.
2. **The fund decides, the LP confirms.** The commitment, the units and the documents come from the GP. The LP confirms, signs and returns; the LP cannot change an amount.
3. **Every LP action is an event the GP sees** (an inbox item), and anything that would change a record is a proposal on the GP's queue (doc 43), never a direct write, except the audited acknowledgements that already exist.
4. **Collect the least personal data that does the job,** keep identity documents separate from the rest, and show the LP what is held.
5. **Honest about what it is not:** a document return is not a legally validated e-signature (section 7); the portal says so and the fund can use a signing provider for the signature itself.
6. **LPs are free** (doc 42) and cheap: their view runs on stored records; the assistant is the only metered part and is capped per LP.

## 3. R-1: attach the contact (the blocker)
- A `fund_lps` row needs an LP contact with an email before it can be invited. The LP row editor gets a required "contact email and name" field that creates or links the contact; the existing 8 rows get a one-time "add the contacts" screen listing the rows that lack one.
- The invite button is disabled with the reason ("add an email first") until then.
- Acceptance: no active LP row without a contact; the two doors both find the LP.

## 4. The invite and the two doors
- **Door 1 (default): the personal link.** "Invite to portal" sends the existing portal link by email (Resend, transactional), default validity **30 days**, renewable in one click. The link opens the portal. Before showing amounts or documents the portal asks for **a six-digit code sent to the same email address** (valid ten minutes, three tries, then a new code): a forwarded email alone does not open the account. The session lasts 12 hours on that device.
- **Door 2 (optional): an account** for an LP with several funds or who wants to sign in on their own. The portal offers "Create my account" after the first visit; the LP persona sign-up is allowed only for an email that is on a `fund_lps` contact, with no invite code (the invitation is the existing link). The `/lp` pages keep working and show the same data.
- Revocation: the GP can revoke a link, an LP row's access, or a device; each is audited.

## 5. Onboarding: a checklist the LP sees and the GP tracks
`fund_lps.onboarding_state`, one step at a time, each with a date:
1. **Invited** (link sent).
2. **Opened** (code entered).
3. **Details confirmed.** Legal name, type (individual, company, trust, fund, family office), address, tax residence, tax id (stored encrypted), authorised signatory. Prefilled from what the GP knows; the LP corrects. A correction is a proposal for the GP, not a silent overwrite.
4. **Terms and privacy accepted** (the privacy notice of doc 54 and the fund's terms; version and time recorded).
5. **Verification submitted** (section 6).
6. **Subscription returned** (section 7).
7. **Countersigned** by the GP; the commitment becomes active.
The GP sees a column per step on the LP list, a "waiting on" filter and one-click reminders (a message the GP approves, doc 46 rules for anything sent to third parties). Stuck steps older than 10 days appear in the weekly brief agent.

## 6. Verification intake (KYC) without a verdict
- A short LP-facing form feeds the existing `kyc_cases`: identity document (image or PDF), proof of address, for entities the registry extract and a list of owners, and a self-declaration of investor category. Files go to private storage, encrypted at rest, visible only to the fund's compliance role, never in the AI context unless the workspace's data policy allows it.
- Anker **collects and organises**; the GP **decides**. No automatic accept or reject, no scoring. Screening hits (the table exists, empty) still need a person.
- Retention: the file is kept as long as the LP relationship plus the period the fund sets (default five years after exit), and removed by the erasure tooling of doc 54 when due.
- Not in scope: a third-party identity-verification service (a later integration; the intake is built so a provider can fill the same case).

## 7. Subscription: from package to countersigned
- The GP attaches a **subscription package** to a fund (the agreement, side letter if any, forms): documents in the data room with category `subscription`, versioned. For each LP the GP sets the commitment, the class and the date, and "sends" the package: the LP sees it in the portal.
- The LP downloads, signs outside the portal or with the fund's signing provider, and **uploads the signed copy** (PDF; size and type checked; content hashed; virus-scanned if the platform has a scanner, otherwise flagged as unscanned). The portal also records an on-screen **"I have read and agree" acknowledgement** with name, time and the hash of each document version.
- The GP reviews, then **countersigns** (marks the signed copy as accepted; optionally attaches their own countersigned file). `subscription_status` moves `sent`, `returned`, `countersigned`, `rejected` with a reason; the default `countersigned` is replaced by `not_sent` for new rows. The existing 8 rows are set deliberately, not by default.
- **Honest limit:** this records that a signed document was returned and accepted. It does not create a legally validated electronic signature. For that the fund uses a signing provider; the portal then stores the provider's certificate with the document. This is said in the portal and in the GP's screen.
- Wire details for a first capital call are shown only after the status is `countersigned`.

## 8. What the LP sees after (the watch leg)
- **Capital account:** commitment, called, uncalled, distributed, current estimated NAV (the fund's latest valuation share, labelled as an estimate), each with the records behind it; calls and distributions as a statement list with dates and status; a download of the statement as PDF (the platform's own, dated and signed by the fund's name, not tax advice).
- **Self-serve documents:** quarterly letters (exists), capital call and distribution notices, the annual statement, tax documents as the GP uploads them (category `tax`); a view log the GP can read.
- **The LP assistant** (exists): answers only from this LP's own records and says which; a request that implies action ("redeem", "transfer") is not answered as done but becomes a **proposal on the GP's queue** with the LP's words attached (doc 43). Capped per LP per month; its cost is metered to the fund (doc 58), shown to the GP.
- **Notifications to the LP:** by email only, short, with the link: a new call, a new document, a reminder of an open onboarding step. Never amounts in the email body.

## 9. Security and privacy
Tokens hashed (done), expiry (default 30 days), revocation (done), email code step-up (new), rate limits per token and per IP on the code step, the access log written for every page and download (the table exists; today nothing is in it), device sessions listed and revocable, no LP data in a URL, no indexing (done). Identity documents and tax ids encrypted and never copied into AI prompts, logs or exports meant for the fund's general use. LP data follows the same erasure and export rules as every workspace table (doc 41 registry); a person's own export covers their LP data.

## 10. Measuring it
Per fund: LPs invited, opened, details confirmed, verification submitted, subscription returned, countersigned; median time between steps; LPs stuck at a step for more than 10 days. These feed the activation view (`activation_by_workspace`) and the weekly brief. The first real test is one design-partner fund taking its first LP from invite to countersigned.

## 11. Slices
- **L1 (about 2 days): the blocker and the door.** Contact required on LP rows, the one-time "add contacts" screen, invite with the 30-day link, the email code step-up, the access log filled, onboarding states and the checklist (steps 1 to 4), reminders.
- **L2 (about 3 days): subscription.** Package on the fund, per-LP send, signed copy return, acknowledgement with document hashes, GP review and countersign, status replaced by a real workflow.
- **L3 (about 3 days): verification intake** into `kyc_cases` with encrypted storage and the compliance-only view.
- **L4 (about 2 days): capital account and statements** with PDF, notices, the document view log for the GP.
- **L5 (about 2 days): the LP account door and LP assistant proposals,** per-LP assistant cap and metering line.
About 12 working days; L1 alone makes the leg enterable.

## 12. Tests
Contact required before invite; code step-up (right code, wrong code, expiry, three tries, a forwarded link without the code gets nothing); a token cannot read another LP; revocation and expiry; every download logged; state machine transitions and the forbidden ones (an LP cannot move themselves to countersigned); a correction becomes a proposal; upload type and size limits and hash recorded; the acknowledgement stores the document hashes; statement totals equal the ledger rows; the assistant refuses to act and creates a proposal; erasure and export cover the new tables.

## 13. Decisions for the founder (defaults chosen; change any)
1. **The personal link plus email code is the main door;** an account is optional (default yes).
2. **Link validity 30 days;** code valid 10 minutes, three tries.
3. **No automatic KYC verdicts;** collection only (default yes; a provider integration later).
4. **The portal states plainly that an uploaded signed copy is not a validated e-signature;** the fund may use a signing provider (default yes).
5. **Existing 8 LP rows:** you add their contacts and set each subscription status by hand once (default; I will not guess).
6. **Tax id stored encrypted, retained five years after exit** (default; counsel to confirm per jurisdiction).

## 14. Not in scope
K-1 or tax form generation, secondary transfers and redemptions beyond a proposal, LP-to-LP features, a mobile app, accredited-investor verification services, native e-signature, payment collection (wire instructions are shown, money is not moved).
