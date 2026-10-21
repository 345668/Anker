# 06. Data map, processors, retention, rights, DPIA outline, breach runbook

*Questions 25 to 28. Retention numbers: `08` (generated). Wording of the rights statements: `07`, "The investor's rights". Draft; not legal advice.*

## 1. Data map
| Data | Where (table) | Who can see it | Basis (proposed) | Shared with | Kept |
| --- | --- | --- | --- | --- | --- |
| Sign-up address, name, hashed code | `investor_signup_codes` | Nobody (hash only) | Steps before a contract | Nobody | 1 day |
| Account address, sign-in | Supabase Auth; `profiles` | The person; operators technically | Contract | Sign-in provider | While the account exists |
| Profile (name, country, languages, contact, about), terms version and time | `investor_profiles` | The person | Contract | Nobody | Until erased |
| Entities (name, kind, country, tax residence, category, interests) | `investor_entities` | The owner and the team | Contract | A fund: only the copy the investor chose to share | Until erased (anonymised for funds) |
| Team members and roles; invitations (an email address) | `investor_entity_members`, `investor_entity_invites` | Owner; members see names and roles | Contract; legitimate interest | Nobody | `08` |
| Activity log (who did what) | `investor_entity_events` | The team | Legitimate interest (security, attribution) | Nobody | 3 years |
| Requests and the copy shared | `fund_relationships` | The investor's team; the fund | Pre-contract steps | The fund | The fund's records stay (anonymised on erasure) |
| Conversations (plain text) | `relationship_messages` | Both sides | Pre-contract steps | The fund | The fund's messages stay; the investor's are replaced on erasure |
| Attachments (encrypted) | `relationship_attachments` | Both sides | Pre-contract steps | The fund | `08` |
| Meetings (time, link, note) | `relationship_meetings` | Both sides | Pre-contract steps | The fund | Investor's removed on erasure |
| NDA acceptance (text copy, hash, time, IP, browser hash) | columns on `fund_relationships` | The fund; the investor | Legitimate interest (evidence) | The fund | Kept; address and browser hash removed on erasure |
| Passport (encrypted identity documents) | `passport_documents` | The owner and people who can act | Consent | A fund: a copy, per consent | `08`; removed on erasure |
| Passport shares (which document, which fund, wording version) | `passport_shares` | The team | Consent record | Nobody | Until erased |
| Discoverability opt-in (time, wording version); fund invitations (card) | `investor_entities`, `fund_connect_invites` | The owner; the invited fund sees its own invitations | Consent | A fund: the card | `08` |
| Claim codes | `investor_claim_codes` | Nobody (hash) | Steps at the person's request | Nobody | 1 day |

## 2. Processors and transfers
From the live sub-processor register (queried 2026-10-21): **Neon** (database; region US, inferred); **Vercel** (hosting and uploaded files; US, inferred); **Supabase** (sign-in; region not yet confirmed); **Resend** (email delivery; region not yet confirmed; carries the six-digit codes and the content-free notices); **Stripe** (billing; not used by the investor side); **Telegram** (the fund-manager assistant channel; not used for investors); AI providers (**Alibaba Cloud, Mistral, OpenAI**): **no investor data is sent to them** by the investor side (the ranking is deterministic; the passport and conversations are not read by any AI feature).
**Gaps:** two regions are unconfirmed; the primary database is US-region by the register's inference. Before launch the founder should confirm each provider's region and DPA and, with counsel, decide on SCCs or a regional move (question 19).

## 3. Retention
See `08`. Proposed, enforced by a daily job with a dry-run mode, verified by tests: each rule removes what it should, leaves what it must keep, and a second run finds nothing more.

## 4. The investor's rights, as built *(tested)*
- **Access and portability:** "Download my data" on the investor profile gives one JSON file: account, profile, entities with role, requests and the copy each fund received, conversations of the person's entities (both sides' messages, attachment names and sizes), meetings, passport records and shares (not file contents; the files are downloaded one by one), team and invitations (for entities they own), fund invitations, linked fund portals, and the activity log. A teammate's export covers only what they may see; no other person's data is included.
- **Erasure:** typed confirmation; then: unseen passport copies at funds are deleted; the passport and team, invitations, activity and discoverability cards are removed; open requests are withdrawn; **what funds keep is anonymised** (the entity becomes "Erased investor"; the shared copy keeps only the kind of entity; notes and amounts are cleared; the investor's own messages become a removal notice and their attachments are deleted; their meeting proposals are deleted; the NDA record is kept without address or browser data); the profile is deleted; the sign-in is deleted unless the person also belongs to a workspace. The result tells the person what funds keep, and why. An entity with a team: the team loses access.
- **Rectification:** the person edits profile and entities in place. A fund's copy is a snapshot and does not change.
- **Withdrawal of consent:** discoverability off (immediate); passport shares taken back (rule in `04`).
- **Objection / restriction / complaint:** by email to the address in the notice (`09`); no automated flow.
- **Not built:** a support-assisted erasure for a person who cannot sign in; a fund-side "remove this investor's data" button (the fund's own tools apply).

## 5. DPIA outline (starting point for counsel)
1. *Description:* as in `00` and `01` to `05`. 2. *Necessity and proportionality:* each category of data and why (the data map); the passport is optional and per fund. 3. *Risks to individuals:* disclosure of identity documents (the highest); unwanted contact (mitigated: no free-text invitations, content-free notices, mute and block); re-identification through cards (mitigated: pool floor, no identifiers); unlawful marketing of funds (mitigated by rules, strict mode, disclaimers; residual); loss of access (export). 4. *Measures:* application-level encryption of files, role-based access (owner, act, view), per-fund consent and revocation, audit of sharing, rate limits, content-free notices, retention job, erasure, export, switches default off. 5. *Residual risk and sign-off:* **open**: key rotation, virus scanning, region.

## 6. Breach runbook (draft; the founder and counsel to adopt)
*Detection:* the platform's alerting (doc 56) emails the operator on failures; no investor-specific detection exists beyond that. *Steps if investor data may have been exposed:* (1) **Contain** within the hour: turn off the relevant switch (`investor_signup`, `investor_discoverability`, a fund's `listed_for_lps`) and, if needed, the passport or attachments routes; rotate the application key and database credentials. (2) **Assess**: which tables, how many people, whether files (encrypted) or only metadata, and whether keys were exposed; the audit log and the entity activity log show shares and erasures. (3) **Decide notification**: supervisory authority within 72 hours if there is a risk to individuals; affected people without undue delay if the risk is high; affected funds (as controllers of their copies) at once. (4) **Record** the facts, effects and measures. (5) **Fix and test**, then reopen. *Open:* a named responsible person, the authority to notify, and templates for the two notices; counsel to supply.

## Questions
25 (rights split and anonymisation), 26 (DPIA required, who signs), 27 (runbook), 28 (register complete, DPAs in place).
