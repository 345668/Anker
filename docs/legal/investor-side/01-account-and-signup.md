# 01. Account and sign-up

*Questions 1 to 7 in the brief. Wording: `07`, sections "Account and sign-up". Draft; not legal advice.*

## What the product does *(tested)*
- **Closed by default.** While the platform switch `investor_signup` is off, the sign-up page says "Investor sign-up is not open yet" and both API steps refuse. Nothing is stored and no email is sent.
- **Proof of address before any account.** Step 1: name, email, and a required tick: "I accept the terms and have read the privacy notice." Step 2: a six-digit code emailed to the address, then a password of at least ten characters. **No account exists until the code is right.** The email holds the code and nothing else.
- **Limits.** One code a minute and five an hour per address; twenty an hour per network address; a code works for ten minutes and three tries; it works once. A pending sign-up is deleted after a day.
- **What is stored when the account is made:** the address (confirmed), the name entered, the terms version and the time they were accepted (`investor_profiles.terms_version`, `terms_accepted_at`), a first entity (the person as an individual) and, in the platform's account table, the address and name.
- **Existing address.** If the address already has an account, the person is told only after they prove the address with the code; asking for a code never reveals whether an account exists.
- **Someone who already has an account** (for example one made in a fund's investor portal) can create the investor profile from `/investor/start`, with the same tick.
- **Sign-in** uses the platform's normal sign-in. Investors are sent to `/investor` if they have no fund or company workspace.

## What the product does not do
- It does not verify age, capacity or identity at sign-up. Identity documents are a separate, optional step (`04`).
- It does not use the account for marketing. Emails sent: the code; reminders and notices about conversations the person started (content-free; `07` "Emails"); team and fund invitations addressed to them; a monthly "do you want to continue?" for a conversation that went quiet. Each conversation can be muted.
- It does not share the person's data with any fund until they ask a fund to talk or accept an invitation, and then only what they choose (`03`).

## Data
Account address and name; profile (display name, country, languages, how to be contacted, about); entities (name, kind, country, tax residence, self-declared category, what they look for); team; activity log. See the data map in `06`.

## Proposed position (for counsel to correct)
- Anker is controller for the account and profile; basis: performance of the contract; consent for the passport and discoverability; legitimate interest for security (rate limits, abuse records).
- Investor terms and an investor notice separate from the founder and fund ones (draft notice: `09`).

## Open points
- Investors now accept **investor-specific terms and notice** (pages `/investor/terms` and `/investor/privacy`, generated from `lib/investor/terms-text.ts`; `10` and `09`), shown with a draft banner until counsel's text replaces them. The version a person accepted and when are stored; a new version asks everyone to accept again *(tested)*.
- Anker holds the self-declared investor category. It is labelled as self-declared everywhere a fund sees it. Whether recording it creates duties is question 7.
- The `/privacy` page's retention section is generic ("12 months after closure"); the investor side's actual periods are in `08`. They should be reconciled once counsel confirms.
