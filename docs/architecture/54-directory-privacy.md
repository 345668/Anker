# 54. Spec: directory privacy (source and licence record, data-subject requests, erasure, provider policy)

Status: **spec. Nothing is built.** Implements the "directory privacy work" of doc 37 (sections 8.2 and 8.4, gaps G12 and G14, ordering item 2 of section 19.2). Raised on 2026-10-16 as the next engineering item because it is the compliance blocker named before any wider launch and before the first paying customer. Not legal advice: points that need counsel are listed in section 12 and nothing here should be read as a legal conclusion.

## 1. The problem, from production (2026-10-16)
- The shared directory holds about **50,000 people** (`investors`) and their firms (`investment_firms`), none of whom gave Anker their data. Their origin is one free-text column, `investors.source`: `folk` (45,729), `drop:2026-09-24` (2,177), `drop:2026-10-03` (548), `advisor_seed` (446), webinar and CSV lists, and `drop:2026-10-13` (74, the vendor family-office sample, licensed for internal use only).
- **No record says what each source may be used for.** Licence, permitted use, acquisition date and the lawful-basis note exist nowhere. Today we could not answer "may we use this batch to email people?" or remove a batch on a vendor's request without guessing.
- **No data-subject tooling.** `dsar_requests` and `erasure_requests` do not exist. A person who writes "delete me" or "what do you hold on me" has no path; an operator would have to hand-write SQL across 17 tables.
- **A person's data is spread wider than the directory row.** These tables carry a person or contact id: `crm_people`, `crm_entries`, `crm_deals`, `campaign_crm_entries`, `investor_matches`, `matches`, `lp_contact_matches`, `match_outcome_events`, `outreaches`, `interaction_logs`, `investor_company_links`, `market_signals`, `deals`, `deal_feedback_events`, `deal_room_access_grants`, `syndicate_partners`, `crm_migration_plan`. Most belong to workspaces (customers), some to the platform.
- **Suppression exists but is empty and has no public door.** `lib/compliance/suppression.ts` already joins one person across email and LinkedIn (`email_suppressions`, `li_suppressions`, both 0 rows of real objections), and `app/api/public/unsubscribe` exists for email. There is no opt-out for a person who simply finds themselves in the directory, and nothing stops a deleted person returning on the next import.
- **Workspace data can go to third-country AI providers with no workspace-level control.** The provider policy is global (SAIL). A fund cannot say "never send my deal documents outside the EU".
- The tenant-level erasure (doc 41: `tenant_tombstones`, executor, registry coverage test) is a good pattern to reuse. It covers a workspace leaving, not one directory person.

## 2. Principles
1. **Record before use.** No directory row without a source record; no import applies without one.
2. **Delete nothing by guess.** Removal is driven by a source batch or a verified request, never by a fuzzy match, and every removal is previewed first.
3. **Erasure leaves a hash, not a person.** A tombstone keeps only a keyed hash of the email and profile slug so the person cannot be re-imported or re-contacted. It holds no name.
4. **Suppress everywhere.** An objection stops contact on every channel, in every workspace.
5. **Workspaces are their own controllers.** A founder's own contact copy is theirs; we notify and offer the tool, we do not silently rewrite their records, except where the platform is the controller (the shared directory).
6. **Fail closed on provider policy.** If a workspace forbids a provider and no allowed one is available, the feature says so and sends nothing.
7. **Honest wording.** Public text is generated from the register, so it names what actually runs.

## 3. Words used here
- **Directory**: `investors` and `investment_firms`, shared, platform-controlled.
- **Source batch**: all rows with one `source` value (the existing grouping key).
- **Data subject**: a person the data is about. **DSAR**: a data-subject request (access, rectification, erasure, restriction, objection).
- **Tombstone**: the minimal record that a person was erased or objected.
- **Identity hash**: HMAC-SHA-256 of the normalised email, and of the LinkedIn profile slug, with a platform secret (`DIRECTORY_HASH_KEY`). Never stored in plain form.

## 4. Source and licence register (slice D1)
**Table `directory_sources`** (one row per source key): `source` (primary key, equals `investors.source`), `label`, `kind` (`vendor_purchase`, `partner_list`, `customer_upload`, `public_web`, `webinar_signup`, `seed`, `crm_sync`), `acquired_at`, `supplier`, `licence_summary`, `permitted_use` (array: `internal_matching`, `outreach_email`, `outreach_linkedin`, `display_to_customers`, `resale`), `forbidden_use` (free text), `lawful_basis_note`, `notice_status` (`not_required`, `pending`, `sent`), `record_count` (derived), `status` (`recorded`, `unreviewed`, `restricted`, `withdrawn`), `evidence_ref` (a stored file or link, not content), `reviewed_by`, `reviewed_at`.
**Backfill.** Each existing distinct `source` gets a row with status **`unreviewed`** and no invented licence. The vendor sample `drop:2026-10-13` is recorded as `restricted`, permitted use `internal_matching` only, with the supplier's footer text. `folk` (the largest, 45,729) is reviewed first: where it came from and on what terms is the founder's to state, not ours to infer.
**Use gate.** A pure function `mayUse(source, purpose)` is called where purposes occur: outreach drafting and sending (email, LinkedIn), showing a directory person to a customer, export. An `unreviewed` source allows `internal_matching` only and blocks outreach with the message "This contact's source has not been reviewed." A `restricted` source allows only its listed uses. A `withdrawn` source is hidden everywhere. The gate ships **warn-only first** (logs what it would block), then enforces, to avoid cutting off the two design partners without notice.
**Import gate.** The importer (SAIL Imports page and the scripts) refuses to apply a batch with no register row, and asks for the fields above at upload. The existing undo bundle pattern remains.
**Batch removal.** SAIL action "Withdraw this batch": previews counts (people, firms, how many are referenced by workspace CRM copies and matches), needs a reason (10+ characters) and a second admin for batches above 1,000 rows, then sets `withdrawn` (rows hidden at once, deleted after a 30-day hold unless restored), writes the tombstones, and removes the batch's matches. Workspace copies are listed to the workspace, not edited (principle 5).

## 5. Identity hashes and tombstones (D2)
- `investors` gets `email_hash`, `linkedin_hash` (indexed), filled by a backfill and on write. They also serve duplicate detection later (doc 37 G6) without exposing plain values.
- **Table `directory_tombstones`**: `id`, `email_hash`, `linkedin_hash`, `reason` (`erasure`, `objection`, `batch_withdrawn`, `bounce_hard`), `request_id`, `created_at`, `expires_at` (null = keep). No name, email, firm or free text.
- **Re-import guard**: every import and enrichment path checks the hashes and skips a tombstoned person (the same rule as "fill empty only, never overwrite"). Test: re-run an import containing an erased person and assert no row appears.
- `email_suppressions` and `li_suppressions` get a global row for every `objection` tombstone (using the existing `suppressGlobally` and `GLOBAL_LI_OWNER`), so sending stops even if a stray copy survives.

## 6. Data-subject requests (D3)
**Intake.** A public page `/privacy/request` (no login) with type, email, optional LinkedIn URL, and a free-text note; the same address is on the privacy page for mail. Rate limited, bot-checked (honeypot plus a signed time token, no third-party captcha), and every request ends in a **verification step**: a link to the stated email (for erasure and access) so nobody can erase or read another person's data. A person without a working email can verify by the LinkedIn profile route to be decided with counsel (section 12).
**Table `dsar_requests`**: `id`, `kind` (`access`, `rectification`, `erasure`, `restriction`, `objection`), `status` (`received`, `verifying`, `verified`, `in_progress`, `done`, `refused`, `expired`), `requester_email_hash`, `requester_email_enc` (encrypted, only so we can reply, wiped 30 days after closing), `verified_at`, `due_at` (received + 30 days), `extended_to` (an extension of up to 60 more days with a stated reason), `handled_by`, `outcome` (counts only), `refusal_reason`, `created_at`, `closed_at`.
**Handling** (SAIL "Privacy requests" page, owner console only, firewalled like other owner tools): a request opens with the **found records** per table (counts and ids, plus the plain values on the detail page for staff only), and the operator confirms the match; ambiguous matches are never auto-selected. Then one action per kind:
- **Access**: a JSON and human-readable export of the person's directory record, source batch names and dates, which workspaces hold a copy (names withheld from the person if that would reveal a customer's relationship; counted instead), and outreach sent to them by Anker's own tooling. Sent to the verified address only.
- **Rectification**: edit the directory row; log the change.
- **Erasure**: see section 7.
- **Restriction**: mark the person `restricted` (kept but excluded from matching and outreach).
- **Objection**: global suppression plus tombstone (reason `objection`), and removal from matching.
Every action writes an audit row and closes with a reply template. A daily check raises requests nearing `due_at` to the SAIL home page and email.

## 7. Erasure (D4)
Erasure follows the tenant executor pattern (tombstone first, idempotent, resumable, counts only, no content in logs) and is driven by a **registry of person-referencing tables** with a coverage test (as `registry.coverage.test.ts` does for workspaces), so a new table that holds a person id cannot ship without a decision.
Per table the registry states one of: **delete** (directory row, enrichment text, notes about the person), **anonymise** (keep the row, null the name, email, phone, LinkedIn and free text, keep stage, outcome and dates so aggregates and win-rate learning survive), **keep** (workspace-owned copies, with the reason), or **notify** (tell the workspace owner their copy of this person exists and that the platform's source has been erased, with a one-click removal on their side).
Rules:
- The directory person row and enrichment are **deleted**; the firm remains (it is a company) unless every contact is gone and it has no other source.
- Platform-owned derived data (`investor_matches`, `match_outcome_events`, embeddings, memory entries) is deleted or anonymised; learning aggregates stay.
- Workspace copies (`crm_people`, `crm_entries`, `outreaches`) are **not rewritten by us**. The workspace is notified once, the record shows "Source erased on request" and is excluded from new platform-driven outreach through the suppression above.
- Backups: erased data ages out with the normal backup rotation (the retention length is stated in the notice); the tombstone prevents restoration into live data (restores must replay tombstones, a runbook step).
- Dry-run first: the operator sees counts per table before confirming.

## 8. Retention schedule (D4)
A table of rules stated in code and shown on the privacy page: unverified requests expire after 14 days; closed request records keep counts only after 3 years; `requester_email_enc` wiped 30 days after closing; hashes in tombstones kept as long as the directory exists; withdrawn batches deleted after the 30-day hold; contact data not touched for 36 months with no workspace reference is flagged for review (flag, not auto-delete, until counsel agrees the period). Platform event logs follow doc 37 section 8.1.

## 9. Public notice and opt-out (D5)
- **Directory notice** (the Article 14 information) as a page and a plain section in the privacy policy: what we hold, categories of sources, purposes, the lawful-basis summary, recipients (customers who search it, our processors), retention, rights, how to object, and the complaint route. Draft by us, **reviewed by counsel before it is published**.
- **Legitimate-interest assessment** as a document in `docs/legal/`, drafted by us from the facts here, for counsel to complete and sign off.
- **Opt-out link** in every outreach email sent through Anker that goes to a directory person (the `List-Unsubscribe` header and one-click post are required by doc 37 section 8.3 and are part of this slice if not already present), and an opt-out line on LinkedIn messages where the platform allows.
- **Privacy policy and Terms** corrected to list the real sub-processors, generated from the register in section 10 (the policy today names providers with no key and omits Mistral and Stripe).

## 10. Provider policy per workspace (D6, G14)
- **Table `ai_subprocessors`** (the register): provider, purpose, region, DPA status (`none`, `requested`, `signed`), retention, training opt-out status, link to the terms, last verified date. Shown in SAIL and rendered on the public privacy page.
- **Workspace setting `ai_data_policy`**, resolved like other limits (override, plan, default): per data class (`public_web`, `deck`, `data_room`, `lp_documents`, `call_transcripts`) the allowed providers and regions; presets **Standard** (today's behaviour), **EU only**, **No external provider**. The last depends on the open-weights lane (doc 53); until that exists the preset is shown as unavailable rather than faked.
- **Enforcement point.** The model router (`lib/ai/model-router.ts`) receives the workspace and data class, filters the lane list, and **fails closed**: no allowed lane means a clear refusal ("Your workspace policy does not allow any available model for this data."), logged, never a silent fallback. The filter is a pure function with a test per preset. Each AI call already records the lane and model, so a policy audit is a query.
- **Attachments**: the upload sweep exists; add a per-workspace retention setting for chat and deal-room attachments.
- This slice reads the register but does not depend on D1 to D5 and can ship separately.

## 11. SAIL surfaces
- **Directory sources** (Data ops): the register, filters by status, the review form, "Withdraw this batch".
- **Privacy requests**: queue, due dates, found records, actions of section 6, reply templates.
- **Sub-processors**: the register of section 10.
- **Workspace page**: the `ai_data_policy` control and a link to its notifications about erased contacts.
- All are owner-console pages (doc 38 and the memory on the Owner Console): platform staff only, every action audited with a reason, no tenant private records shown (the firewall holds; DSAR matching reads the directory and counts of workspace copies, not workspace content).

## 12. Questions for counsel (not decided here)
1. Lawful basis for holding and approaching directory persons (legitimate interest assessment) and whether B2B outreach by email is advertising under the German unfair-competition act in this context (doc 37 section 8.3).
2. The identity check for requests when the person cannot receive an email at the address we hold.
3. Whether Anker is controller of the shared directory and a processor for a workspace's own contact copies, and the wording of the customer DPA.
4. The licence terms of `folk`, the webinar and CSV lists, and the vendor sample (internal use only, which the register records; whether showing those rows to customers is "internal use" is a counsel question until answered it is treated as **not permitted**).
5. Retention periods in section 8 and the 36-month review rule.
6. Whether a directory person must be notified individually (Article 14) or the public notice suffices because of disproportionate effort.

## 13. Tests
Register: backfill creates one `unreviewed` row per source with no invented licence; the import gate refuses an unregistered batch; `mayUse` per status and purpose; warn-only mode logs and does not block.
Tombstones: hashes are keyed and stable; re-importing an erased person is skipped; objection creates global email and LinkedIn suppression; no plain value appears in the tombstone.
Requests: the verification step is mandatory; an unverified request cannot read or erase; the 30-day due date and extension; ambiguous matches are not auto-selected; access export contains only that person and withholds customer names.
Erasure: registry coverage (every table with a person id has a decision); dry run equals the real run's counts; second run deletes nothing; interrupted run resumes; aggregates survive anonymisation; workspace copies are untouched and the workspace is notified once.
Batch withdrawal: preview, reason and second approver, hold period, restore, tombstones written.
Provider policy: each preset filters lanes as stated; fail-closed message; a workspace without a policy behaves as today; audit entry records lane and model.
Tenant isolation: DSAR reads never return workspace private content; the full suite stays green.

## 14. Slices
- **D1, register** (migration, backfill, import gate, `mayUse` warn-only, SAIL page). Smallest change that answers "what may we do with this data" and covers the vendor sample.
- **D2, hashes and tombstones** (columns, backfill, re-import guard, global suppression wiring, withdraw-batch action).
- **D3, requests** (public page, verification, SAIL queue, access, rectification, restriction, objection).
- **D4, erasure and retention** (person registry with coverage test, executor, workspace notification, retention jobs).
- **D5, notice and opt-out** (privacy page, notice, opt-out link, `List-Unsubscribe`, policy generated from the register). Publish only after counsel has read it.
- **D6, provider policy** (register, workspace setting, router filter). Independent of D1 to D5.
Each slice is tested and deployed alone; the `mayUse` gate and any new refusal start in warn-only mode behind a platform flag (`directory_use_gate`).

## 15. Risks and answers
| Risk | Answer |
|---|---|
| The gate cuts off the two design partners' use of directory contacts | Warn-only first; review `folk` before enforcement; message names the fix |
| Erasure deletes the wrong person on a fuzzy match | Match on exact hashes and verified address; operator confirms; dry run; never auto |
| Hash key lost or rotated | Key kept in the platform key store with a documented rotation that re-hashes in a batch |
| A workspace still holds an erased person and emails them | Global suppression blocks sends from every workspace; the workspace is notified |
| Restoring a backup resurrects erased people | Runbook step replays tombstones after any restore |
| The register becomes stale | `reviewed_at` age shown in SAIL; import gate keeps new batches complete |
| Spec mistaken for legal advice | Section 12 lists what counsel must decide before publishing or enforcing |

## 16. Decisions for the founder (defaults chosen; change any)
1. **Start with D1, then D2, D3, D4**; D5 after counsel reads it; D6 whenever the first fund asks for it.
2. **Treat the vendor sample (`drop:2026-10-13`) as internal matching only** and hide it from customer-facing results until counsel answers question 4. (Default: yes. This affects 74 people.)
3. **Where `folk` came from and its terms**: you state them; until then it is `unreviewed` (matching allowed, outreach through Anker flagged).
4. **The 30-day response period and 30-day hold** for withdrawn batches.
5. **A named person who answers privacy requests** (an address like privacy@an-ker.de and who reads it).

## 17. Not in scope
Customer-side DSAR tooling for a workspace's own contacts (a later product feature); consent management for newsletter signups beyond the existing unsubscribe; cookie banner changes; a full record of processing document (the register and this spec are its inputs); SOC 2 work (doc 37 section 8.5); the open-weights lane itself (doc 53).

## 18. Build status
**D1, the register (2026-10-16), Anker side built, tested and applied to production** (migration `2026-10-16-directory-sources`).
- `directory_sources` holds one row per `source`. Backfill: 15 existing sources as `unreviewed` (permitted use internal matching only, no licence invented) and the vendor sample `drop:2026-10-13` as `restricted` (internal matching only). The flag `directory_use_gate` ships **off**.
- `lib/directory/use-gate.ts` (pure decision) and `sources.ts`. **Restricted, withdrawn and recorded-but-not-permitting sources are enforced at once; unreviewed or unregistered ones only warn** (one audit entry, `directory.use_gate_would_block`, with source and purpose and never the address) until the flag is turned on. A person known through several sources is allowed when any one allows the use. A failure of the check never blocks a send.
- Hooks: the email send gate (`assertOutreachAllowed`) and the LinkedIn action queue (connect, message, follow-up).
- Import gate: `POST /api/admin/imports` refuses an unregistered or withdrawn source (409, dry runs excepted) and `scripts/import-directory-drop.mjs --apply` refuses likewise. `registerSource` never loosens a restricted or withdrawn source.
- 20 new tests (pure decisions; the real migration on PGlite). Suite: 1,642 pass.
- **Not built in D1:** the SAIL pages (review form, register, withdraw) are in SAIL; withdrawing a batch **blocks all use at once but does not yet delete rows or write tombstones** (that is D2). Known limit: a directory person who is also a workspace's own contact is gated by the directory source in enforcing mode; workspace-owned copies need an owner check before the flag is turned on for unreviewed sources.
