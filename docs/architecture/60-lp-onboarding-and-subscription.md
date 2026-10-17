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

## 15. Build status, L1 (2026-10-17)
Built and tested (2,025 tests green); migration `2026-10-17b-lp-onboarding.sql` applied to Neon (the 8 existing LPs are `not_invited`).
- **Contact.** `fund_lps` gets `contact_email` and `contact_name`; the address used is the one typed there, else the linked contact's, else one kept in the row's metadata. The fund's LP list shows an "LP portal and onboarding" panel: per LP the step, the address (or a field to add it), "Invite to portal" / "Send a new link". Invite is disabled until an address exists.
- **Invite.** A personal link valid **30 days**, emailed to that one address; earlier links of the same LP are revoked on every resend; if the email fails the new link is revoked. Who may do it: the owner or admin of the workspace that owns the fund (`requireLpManager`); the original flagship fund, which belongs to no workspace, stays with platform administrators. (Before this, link creation was platform-admin only, so no customer fund manager could invite anyone.)
- **Code step-up.** Opening `/portal/<link>` now shows only the fund name and a masked address until a **six-digit code** emailed to the LP's address is entered: valid 10 minutes, three tries per code, one code a minute and five an hour, stored as a hash. A right code sets an HttpOnly, SameSite=Lax cookie for 12 hours (a hashed session row, scoped to that link). Letters, the assistant and document downloads all require the session. A link with no address on file cannot be opened at all: the "copy link" button for administrators therefore gives a link that only works once an address is added.
- **Access log.** Page views, code verification, onboarding actions, letters, assistant questions and document opens are written to `lp_portal_access_log`; documents now open through `/api/portal/<link>/documents/<id>`, which logs and redirects.
- **Onboarding.** `onboarding_state` moves only forward: invited, opened, details confirmed, terms accepted (verification, subscription and countersigned are reserved for L2 and L3). The portal shows a checklist; the LP confirms legal name, kind of investor, address, country, tax residence, tax number (encrypted, only the last four shown back) and signatory, then accepts the privacy notice and terms (version `2026-10`, time, address and a hash of the browser string recorded). What the LP enters is stored **beside** the fund's record and never over it. The fund's panel shows it, flags a name that differs and offers "Mark as read".
- **Deviations from the spec, stated plainly:** (1) a correction is shown to the fund in its LP panel with "Mark as read" rather than created as an item in the proposals inbox; (2) the stuck-for-10-days signal is a "waiting N days" label on the panel, not yet an item in the weekly brief agent; (3) the contact address is stored on the LP row, not as a new `contacts` record; (4) reminders are "Send a new link" (the same invitation again), not a separate reminder message.
- **Not verified live:** no real invitation has been sent; a first run with a real address (yours) is the next check. The email code also depends on `RESEND_API_KEY` being set in production.
- Next: L2 (subscription), L3 (verification), L4 (capital account and statements), L5.

## 16. Build status, L2 (2026-10-17)
Built and tested (2,038 tests green); migration `2026-10-17c-lp-subscription.sql` applied to Neon.
- **Package.** On the fund page, "Subscription package": add PDFs to a draft, publish it. Publishing makes it the current version and retires the previous one; investors already sent version 1 keep version 1. A published package cannot be edited, only replaced. Up to 12 documents; each a real PDF (checked on content, not name) of at most **4 MB**.
- **Send.** Per LP, once they have accepted the terms and the LP has a commitment: "Send subscription documents" with an optional class and date. The commitment is copied at that moment. The existing fundraise stage follows the workflow (`prospective`, `invited` when sent, `signed` when returned, `countersigned` when accepted), so the fundraise tiles keep working with no new meaning for the old values. New LPs now start as `prospective`; the 8 existing rows were not changed.
- **Investor.** The portal shows the documents of the version they were sent, the commitment, class and date, and the three steps: read, sign outside the portal, send the signed PDF back with a typed full name and a tick. The acknowledgement stores the name, time, address and the **SHA-256 of every document of the package they were sent**. They can see their own signed copy and, once countersigned, the fund's countersigned copy. A rejection shows the fund's reason and reopens the upload; the new copy supersedes the old.
- **Fund.** For a returned subscription: download the signed copy (with its size and fingerprint), "Countersign and accept" (optionally attaching the fund's own countersigned PDF), or "Send back" with a required reason. Accepting sets the stage to countersigned, stamps the LP's signing date and moves the onboarding step to countersigned.
- **Files** are stored in the database with their fingerprint, are downloaded only through routes that check who is asking (an LP gets only their package version and their own copies; a fund manager only their own fund's files), and are sent as attachments that browsers may not sniff. The tenant export lists them but leaves the file bytes out.
- **Limits, stated plainly:** (1) uploads are capped at 4 MB because a server request is limited to about 4.5 MB: a photo-scanned agreement may not fit, and larger files would need a direct-to-storage upload (later); (2) **no virus scanner is connected**, so every file is marked "not scanned" and the fund sees that; (3) a typed name plus a returned PDF is **not a legally validated electronic signature**, and the portal says so; (4) the wire details shown only after countersigning are **not built**: the platform has no wire-instruction field for a fund yet; (5) the weekly brief does not mention stuck subscriptions yet.
- Next: L3 (verification intake), L4 (capital account and statements), L5 (account door, assistant proposals).

## 17. Build status, L3 (2026-10-17)
Built and tested (2,048 tests green); migration `2026-10-17d-lp-verification.sql` applied to Neon.
- **Investor.** After confirming their details the portal shows "Identity verification": the checklist the existing KYC engine already defines (an individual: ID, proof of address, source of funds; an entity: certificate of incorporation, ownership declaration, registered address proof, source of funds), a file picker per item (PDF, JPEG or PNG judged by content, up to 4 MB), "what kind of investor are you" (professional, semi-professional, other, not sure), and for an entity "who owns and controls it". "I have sent everything" is enabled only when every document and the answers are in; it moves the onboarding step to verification submitted. Replacing a document or changing an answer reopens the submission.
- **Storage.** Each file is encrypted by the application (AES-256-GCM, version byte, IV, tag) before it reaches the database; the platform key is required and **there is no plaintext fallback** (without it the upload is refused with a plain message). The SHA-256 of the original is kept. The ownership text is encrypted too. Tenant export lists the records but leaves out the bytes and ciphertext.
- **Case.** The first upload opens a `kyc_cases` row for the LP (owned by the user who invited the investor, so it appears in that person's compliance list) with the document rows as the existing checklist. Documents arrive as `received`.
- **Fund.** In the LP panel, per investor: each document with size and fingerprint, "Open" (every download is written to the audit log), "Mark checked" or "Send back" with a required reason (the investor sees the reason and re-uploads), the investor's stated category, "Show who owns the entity" on request (also audit-logged), and a link to the compliance case for screening and the decision. The panel is for the workspace's owners and admins (there is no separate compliance role in the platform yet); the flagship fund stays with platform administrators.
- **No automatic verdicts, and one change to existing behaviour to make that true:** the KYC engine used to mark a case `cleared` as soon as every required document was verified, even if no screening had ever run. It now needs the case to have been screened as well. Existing cases are re-derived the next time something changes on them.
- **Never used by AI:** the files and the ownership text are read only by the download and the review routes. No assistant tool, prompt or index touches them.
- **Limits, stated plainly:** (1) 4 MB per file, as for subscriptions; (2) no virus scanner; (3) no retention timer runs yet: the five-year default of section 13 is a policy statement, not a job, and removal is by the erasure tooling when a person asks; (4) no identity-verification provider or document reading (by design); (5) subscription documents can still be sent to an investor who has not finished verification: the fund decides.
- Next: L4 (capital account and statements), L5 (account door, assistant proposals).

## 18. Build status, L4 (2026-10-17)
Built and tested (2,060 tests green); migration `2026-10-17e-lp-documents.sql` applied to Neon.
- **Your account (investor).** A card in the portal built from the same capital account statement the fund already had (`buildStatement`): commitment, called and paid, not yet called, distributed, an **estimated** value of their share (the fund's latest recorded valuations times their ownership share, labelled as an estimate and shown as "n/a" when the fund has valued nothing), DPI and the estimated TVPI, then the payments and distributions with dates and references. The fund's internal notes, fees and other investors never reach it (tested). "Download statement (PDF)" produces the platform's own A4 PDF: fund name, investor, as-of and preparation date, figures, transactions over as many pages as needed, and a footer saying estimates are not valuations of record and the statement is not tax or investment advice. It is named for the fund and investor and records the fund as author.
- **Notices.** The capital calls and distributions issued to that investor (not drafts, not cancelled ones), newest first, with status; amounts appear here in the portal only.
- **Documents from the fund.** Fund managers publish PDFs (tax document, annual statement, notice, other; up to 4 MB) to every investor of the fund or to one, from a new panel on the fund page; they can take them down. An investor sees only their own and the shared ones; every open is logged.
- **Emails.** Three short kinds, each with a fresh 30-day link, none naming a document or an amount (tested): the invitation, a **reminder** that names the next open step ("confirm your details", "accept the terms", and so on), and **"something new in your portal"**. Each is a separate, deliberate click per investor in the LP list ("Remind", "Tell them there is something new"); nothing is sent automatically when a call is created or a document is published. A new link replaces the earlier one.
- **What the fund sees of use.** "Activity" per investor: when they last visited and the last 15 things they did in plain words ("opened the portal", "downloaded the statement", "accepted the terms"), without document titles or amounts. Also a "Statement PDF" button on each investor for the fund's own use.
- **Limits, stated plainly:** (1) the estimated value depends on the fund keeping valuations current; where it has none the card says so rather than guessing; (2) no automatic email when a call is issued: the fund uses "Tell them there is something new"; (3) the PDF shows what the fund's records show and is not a legal or audited statement; (4) 4 MB per document; (5) the portal's older "Capital account" block (from position snapshots) is still shown beside the new card; reconciling the two is left to the fund until positions are retired.
- Next: L5 (the optional account door, and investor requests becoming proposals for the fund).
