# 64. Build plan: the investor's side, and "funds that fit you" (doc 63 M7)

Status: **built 2026-10-20 (B1 to B5), closed behind two switches; see section 9.** Plan as written: Doc 63 M7 ("investors finding funds") was written to start after doc 61 P1 and P2, and neither is built. This document says exactly which parts of doc 61 are built now so that M7 has something to stand on, in what order, what is deliberately left out, and what keeps it safe to ship. Decisions are doc 61 section 14's defaults; nothing here changes them.

## 1. What is true today (measured 2026-10-20)
- No investor profile exists. `lp_entities` (0 rows) is firm-linked and unused; investors exist only as `fund_lps` rows a fund added. The one account route (`lp_accounts`) is made from inside a fund's portal session.
- Sign-up for the platform is invitation-only. There is no investor sign-up and no email-confirmation step for one.
- `funds.listed_for_lps` and `setFundListing` exist; **0 of 4 funds are listed.** `/lp/discover` lists listed funds but only for people a fund has attached.
- A fund's investing facts already live in the manager's `fund_profiles` (sectors, geography, stage, minimum commitment, average ticket, thesis, kinds of LP it targets, and, since doc 63 M1, the classes and countries it approaches), reachable from the fund through `organizations.fund_id`.
- The platform flag table has no investor flag. Email goes through the existing sender (Resend) and the six-digit code mechanism of the portal (`lp_portal_codes`) is a pattern to follow, not a thing to reuse as is.

## 2. What is built now, and what is not
**Built now (B1 to B5), all behind switches that are off:**
| | What | Doc 61 |
| --- | --- | --- |
| B1 | The investor's profile and investing entities: core profile, entities of any kind, self-declared category (labelled as such), what they look at (stages, sectors, geographies, ticket range, horizon) | P1 |
| B2 | Sign-up with an emailed code, then a password; no account exists until the address is confirmed. Behind the platform flag `investor_signup` (off): while it is off the page says investor sign-up is not open and the API refuses | P1 |
| B3 | The fund's listing: a snapshot of what the fund chooses to show, its eligibility rules (categories, countries, minimum ticket, professional-only, daily cap), the existing `listed_for_lps` switch, and investor-facing browsing and fund pages | P2 |
| B4 | **M7: funds that fit you.** An inverted scorer ranks the listed funds for one of the investor's entities, with reasons, gaps, confidence and a plain eligibility check | doc 63 section 9 |
| B5 | Request to connect: one open request per entity per fund, a daily cap, what is shared; the fund's inbound queue with accept and decline; stage `interested` to `in_talks` or `declined`; the investor can withdraw | P2 |

**Left out, and why** (each is a later slice, none is needed for an investor to find a fund and ask):
claiming fund-added records and migrating `lp_accounts` (touches live LP data, needs its own test with real records); the talks (messages, materials, NDA, nudges: P3); creating the fund's investor record from `invited_to_onboard` (the bridge to doc 60, P4); team roles and opt-in discoverability (P5); the verification passport (P6); a request appearing as a proposal in the Actions inbox (the inbox's "reject" does not run a capability, so a decline from there would not decline; the queue is the first version); investors on Telegram and Anker AI (T5e); the counsel-reviewed wording of the listing page.

## 3. Switches that keep it safe
1. `investor_signup` platform flag, **off**. Public sign-up is a new door into the platform; it opens only when the founder turns the flag on.
2. `funds.listed_for_lps`, **off for every fund** (unchanged). No fund appears to an investor until its manager lists it. Listing now also needs the fund's eligibility rules to be set and a snapshot taken, so a fund cannot go public with empty rules.
3. An investor sees nothing of a fund beyond the snapshot; a fund sees only the requests made to it and the fields the investor shared.
4. No email contains content: a code email says only the code; any notification says that something is waiting.

## 4. Data model (migration `2026-10-20-investor-side.sql`)
- `investor_profiles(user_id pk, display_name, country, languages, contact_pref, about, terms_version, terms_accepted_at, created_at, erased_at)`. Owned by the investor, outside tenant erasure.
- `investor_entities(id, user_id, legal_name, kind, country, tax_residence, category, interests jsonb, discoverable (always false for now), created_at, updated_at, archived_at)`. Kinds: individual, company, trust, fund, family_office. Categories: professional, semi_professional, other, unsure (self-declared).
- `investor_signup_codes(id, email, name, code_hash, attempts, ip, expires_at, used_at, created_at)`: pending sign-ups. No account exists until the code is verified.
- `fund_listings(fund_id pk, snapshot jsonb, eligibility jsonb, version, refreshed_at, refreshed_by)`: what investors see and the fund's rules. The snapshot is taken from the fund and its manager's profile when the manager lists or refreshes it.
- `fund_relationships(id, fund_id, entity_id, user_id, stage, initiated_by, indicative_min, indicative_max, timing, note, shared jsonb, eligibility_check jsonb, decided_by, decided_at, reason, created_at, updated_at)`; a unique index allows one open relationship (stage interested, in_talks, invited_to_onboard, onboarding, on_hold) per entity per fund.
- Tenant registry: `fund_listings` and `fund_relationships` are fund-scoped; the investor tables are an explicit **investor-owned** category with a test that no table is both.

## 5. The fit scorer (M7)
Inverted from section 4 of doc 63: the subject is the investor's entity, the candidates are listed funds. Pure (`lib/investor/fit.ts`): facts in, a number, reasons, gaps and a confidence out.
- **Eligibility first and separate from fit.** From the fund's rules and the entity: category allowed, country allowed, ticket reaches the minimum, professional-only. Result `eligible`, `ineligible` (with the rule that failed) or `unclear` (a needed fact missing). Funds are ordered eligible, unclear, ineligible, then by fit. An ineligible fund is shown, flagged, never hidden: the fund's own rule decides whether a request can still be sent (doc 61 section 5).
- **Fit** over five factors, each only when both sides state it: sectors (35), stage (20), geography (15), ticket (20), time horizon against the fund's term (10). The score is the points earned over the points that could be judged, scaled to 100, so a thin listing is not punished for what it did not say; the share of weight that could be judged sets the confidence (75% or more high, 50% or more medium, otherwise low) and each missing fact is listed as a gap.
- **Explained like the LP side:** one sentence built only from the facts, the reasons, the gaps, the confidence. No generated claims about a fund's quality, performance or suitability; the page says it ranks how well a fund's stated focus matches the investor's stated interests and is not advice.
- Only listed funds are scored; a fund not listed does not exist to the investor.

## 6. Sign-up (B2) in steps
1. Start: email, name, acceptance of the privacy notice and terms (versioned). Rate limits by address (one a minute, five an hour) and by network address. A six-digit code is emailed (code only). Nothing is stored about the person except the pending row, which expires in ten minutes and is purged within a day.
2. Verify: the code (three tries) and a password (10 or more characters). Only now is the account created, already confirmed, with the investor profile and a default individual entity. An address that already has an account is told so after the code proves the address is theirs, never before.
3. The person signs in the normal way. The investor area (`/investor`) shows the profile, entities, find-a-fund and requests.

## 7. Build order and tests
B-order: this plan; the pure scorer with tests; the migration and registry; profile, entities and sign-up with tests; the listing and its switch; browsing with fit; requests and the fund's queue; documentation and the live check. Tests follow section 13 of doc 61 for what is built (confirmed address before any account; no account from an unverified code; rate limits; one open request per entity per fund; a fund sees only its own requests; a delisted fund disappears; eligibility rules; the registry category test), plus the scorer's cases (a thin listing is flagged not punished; ineligible funds are shown below, never hidden; unknown facts add nothing).

## 8. For the founder
Turning on `investor_signup` and listing the first fund are two separate decisions, both after counsel has read the listing page template, the eligibility wording and the request statement ("an expression of interest, not an offer or an obligation"). Until then everything built here exists and is tested but is closed.

## 9. What was built, and what was not checked (2026-10-20)
- Library: `lib/investor/{fit,profile,signup,listing,requests,access}.ts`; migration `2026-10-20-investor-side.sql` applied to production and recorded; tenant registry marks the investor tables investor-owned and the fund tables fund-scoped.
- API: `/api/investor/{signup,profile,entities,funds,requests}` and, for the fund, `/api/fund/investor-listing` and `/api/fund/investor-requests` (accept or decline needs the workspace owner or an admin).
- Pages: `/investor/sign-up` (public; says it is not open while the flag is off), `/investor` (profile and entities), `/investor/funds` and `/investor/funds/[id]` (ranked list, fit, ask to talk), `/investor/requests`; for funds `/dashboard/investor-requests` (queue and listing settings). A person with an investor profile and no workspace is sent from `/dashboard` to `/investor`.
- Tested: 22 PGlite integration tests (flag closed, code before any account, rate limits, wrong and expired codes, weak password not spending the code, entities and limits, rules, snapshot refresh and delisting, one open request per entity per fund, daily cap, ineligible investors held not dropped, the address only after acceptance, a decline carrying no verdict, a fund seeing only its own requests) and the scorer's unit tests. Full suite (2269) and `tsc` pass.
- Checked on production, read only: the flag is off, sign-up is refused (403), no fund is listed, the new tables are empty.
- **Not checked:** a real sign-up and email, a listed fund, a request end to end, and the pages in a browser. None can be done without opening a switch; do them when the founder decides to open, in a throwaway fund.
- Known gaps: the fund's queue is a page, not an Actions-inbox proposal; no messages or materials after acceptance (P3); accepting does not yet create the fund's investor record (P4); "discoverable" is always off.
