# 67. Build plan: claiming a record a fund added, and a profile for existing investors (doc 61 P5, part 1)

Status: **built 2026-10-20; migration applied to production; see section 5.** Plan as written: Follows docs 64 to 66. Doc 61 section 4 says a fund may already have added the investor (doc 60), and that when the investor has an account with a confirmed address matching such a record, the dashboard offers "This fund added you as an investor. Link it to my profile", after a code sent to that address. Doc 61 also says an investor who made a doc 60 account is one profile, not two. This slice builds both. Team roles, per-entity dashboards and discoverability (the rest of P5) are left.

## 1. The claim
- **What can be claimed:** a `fund_lps` record, not transferred, whose contact address (the same address doc 60 writes to) equals the signed-in person's confirmed address, and which is not already linked to another account. The list shows the fund and the name the fund holds, and nothing else about the record (no amounts).
- **Proof:** the account's address must be confirmed. A six-digit code is sent to that address (valid 10 minutes, three tries, one a minute, five an hour; stored as a hash). A record already tied to this very account by doc 60's code-verified portal needs no second code: the address was proved there.
- **Effect:** the account gets the doc 60 account link (so `/lp` shows that investment, the existing door) and a relationship, started by the fund, is created or an existing open request for the same entity and fund is linked to the record. The person picks which of their entities the record belongs to. The relationship's stage follows the onboarding (doc 66). A record can be claimed by one account only; a record whose address belongs to another account is never offered.
- **Nothing is copied from the record** into the profile except what the investor already shared. The fund's data stays the fund's.

## 2. A profile for someone who already has an account
A signed-in person with no investor profile (for example one who made a doc 60 account) can create it: accept the terms, and a profile and a first entity are made from their name. One profile per account (the primary key makes a second impossible). A link in the investor portal's navigation leads to it. No sign-up flag applies: the person already has an account.

## 3. Data
`investor_claim_codes(id, user_id, lp_id, code_hash, attempts, expires_at, used_at, created_at)`: investor-owned, short-lived, purged after a day. Migration `2026-10-20d-investor-claim.sql`, additive.

## 4. Tests
Only the confirmed address matches; another person's record is never listed; a record linked elsewhere is never offered; wrong, expired and locked codes; one claim per record; the code is not needed where doc 60 already proved it; relationship created or linked, stage follows onboarding; the entity must be the person's own; amounts never appear in the list; one profile only; the registry classifies the new table as investor-owned.

## 5. What was built, and what was not checked (2026-10-20)
- `lib/investor/claim.ts` (`claimable`, `startClaim`, `confirmClaim`, `createProfileForAccount`); routes `/api/investor/claims` and `/api/investor/profile/start`; a "Funds that added you" card on the profile page; `/investor/start` (create a profile for an existing account; the investor area sends a person without a profile there, and the LP portal navigation links to it). Migration `2026-10-20d-investor-claim.sql` applied to production; the registry classifies `investor_claim_codes` as investor-owned.
- Tested: 8 integration tests (only the confirmed address matches, typed or via the contact; no amounts listed; a record another account holds or has linked is never offered; wrong, expired and locked codes; the code is not needed where doc 60's portal already proved the address; the relationship is made or an open request is linked, never two; the stage follows onboarding; the entity must be the person's own; one profile per account). Full suite 2295 passing, `tsc` clean.
- **Not checked:** a real code email, the claim card in a browser, or a real fund-added record being claimed. The eight existing LP rows have no contact address, so none is claimable until a fund adds one.
- Left in P5: team roles, per-entity dashboards, opt-in discoverability.
