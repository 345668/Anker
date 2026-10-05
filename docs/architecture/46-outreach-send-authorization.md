# 46. The R2 sending approval layer: send authorizations

Status: design 2026-10-05; **P0 (§13), P1 (§15), P2 (§16) and P3 (§17) built**; enforcement is off until the log is quiet for two weeks; P4 not built. Completes [43](43-action-layer-and-approval-inbox.md) (risk class R2: "external to a third party") and answers the open item in [45](45-agent-runtime-completion.md) §9. Written from a read of every code path that can email a third party (§1); where the code surprised me it says so.

## 0. The goal, stated so it can be tested

**No email to a third party leaves the platform unless a named person approved that exact message to that exact recipient from that exact mailbox, it is still allowed at the moment it goes, and the record of all three exists.** An agent, the assistant, a cron job or a stale approval can never be the thing that decided. A message edited after approval does not go. A revoked or expired approval does not go. A suppressed, consent-less, replied-to or bounced recipient does not go, even if approved yesterday. What went, when, on whose authority and with what outcome can be answered from one table.

This is a layer over the gates that already exist (§1.2), not a replacement: the gates answer *may this address be emailed*; the authorization answers *did a person decide to email it, this text, now*.

## 1. What the code does today (verified 2026-10-05)

### 1.1 Every path that sends mail to a third party

| # | Path | Who decides today | Notes |
| --- | --- | --- | --- |
| 1 | `POST /api/outreach/send-email` (one message) | The signed-in sender's click | Checks the draft is the caller's, recipient suppression, subject and body present. |
| 2 | `POST /api/outreach/campaigns/[id]/send` (bulk) | The sender's click | **With an empty body it sends every drafted member**; there is no server-side preview or count to confirm. 150 ms between sends, inside one request. |
| 3 | `POST /api/outreach/lp-campaign/send-one` | The sender's click | Sends any `to`, `subject`, `body` typed by the caller; **no outreach row is written**, so there is no record beyond the provider's. |
| 4 | `deliverApprovedReply` (`lib/outreach/deliver.ts`) | A person approves a drafted reply in the follow-up inbox | The best-built path: a row first, `sending` claim, Resend idempotency key, retry state, delivery monitor. |
| 5 | `app/dashboard/outreach/actions.ts` (server action) | The sender's click | Calls `sendEmail` directly. |
| 6 | `POST /api/updates/[id]/send` (investor updates, `purpose: "outreach"`) | The founder's click, **bound to a frozen snapshot** | Reviewed 2026-10-05 (§14). The best-built path after replies: content and recipients are frozen into `delivery_snapshot` at the first send, a retry re-sends the snapshot and ignores new content, a 2-minute lease with a membership and permission re-check per recipient, a Resend idempotency key per recipient, a revision check. It already is a send authorization in everything but name. |
| 7 | `GET /api/cron/campaign-send` (founder "pitch-us" campaigns) | **A setting**: `autoSend` (default **on** unless `CAMPAIGN_AUTO_SEND=false`) or a per-submission `send_approved` set by the platform owner | Sender is `platform:pitch-us`; waves of drafted mail go out unattended every cron tick. |
| 8 | `GET /api/cron/outreach-scheduler` `send_batch` | Nobody | Flips drafts to `queued` with a `scheduled_for`. **I found no worker anywhere that sends a `queued` or scheduled message** (the file's comment refers to "the existing send worker"; a search of the app for one finds only the reply path and UI labels). A scheduled send today is accepted, shown as "scheduled" in the stats, and never goes. |
| 9 | Assistant `send_outreach` tool | n/a | Already draft-only: "Model confirmation cannot authorize delivery". LinkedIn goes through the extension's own approval-gated action queue (from the project record; not re-read in this pass). |

### 1.2 The gates that already exist and are sound

`sendEmail` and `sendGmail` are the choke point for outreach: `assertOutreachAllowed` (global suppression, the sender workspace's pause and daily allowance, the country rule with recorded consent), the unsubscribe footer and one-click headers, all applied to every `purpose: "outreach"` send including Gmail. `sendEmail` also accepts a Resend idempotency key.

### 1.3 Gaps this design closes

1. **Authorization is implicit.** A click is the approval and nothing records which messages, which text, which recipients. Path 3 leaves no row at all.
2. **Bulk send is unbounded by the server** (path 2): the recipient set is whatever is drafted when the request arrives.
3. **Approval is not bound to content.** A draft edited between "I reviewed it" and "it went" goes as edited.
4. **cc and bcc are not gated.** `assertOutreachAllowed` is called with `to` only; campaign-level cc and bcc addresses reach `sendEmail` unchecked, so a suppressed or country-gated address in a campaign's cc list receives mail.
5. **Scheduling does not work** (path 8) and nothing paces or caps a long send beyond the per-day figure the gate reads.
6. **Unattended sending is a default** (path 7: `autoSend` is on unless disabled).
7. **Two crons fail open.** `outreach-scheduler` and `outreach-poll` treat an unset `CRON_SECRET` as authorized (`if (!secret) return true`); the newer crons fail closed.
8. **No stop conditions at send time.** A follow-up scheduled in a sequence has no rule that says "do not send, they replied."
9. **No revoke.** A bulk send in flight cannot be stopped by anyone except by deleting drafts.

## 2. Principles

1. **A person approves a batch, not a mode.** Approval names recipients and text. There is no "always send" for a workspace; R2 never auto-commits (43 §5, enforced in code and by an eval).
2. **Approve now, send later.** Approval creates authorized *items*; a separate executor sends them within caps and pacing, re-checking everything at the moment of sending. Approval is cheap to revoke until the second it goes.
3. **The text is part of the approval.** Each item carries a hash of recipient, subject, body and mailbox; a different hash at send time means it does not go.
4. **Gates run twice**: at preview (so the person sees what will be refused and why) and at send (because the world changes).
5. **Irreversible means honest.** Revoke works until an item is sent; the interface says plainly that sent mail cannot be recalled, and "undo" never claims to have done more than revoke the unsent.
6. **Agents propose, they never approve.** Same as 43/44: approval routes are session-only, and an untrusted run cannot even create a send proposal (§6).
7. **One choke point, enforced.** Sending requires an authorization token at the provider function, rolled out behind a flag, so a path nobody remembered fails loudly instead of silently bypassing (§8).
8. **Disclose side effects before they happen** (37 principle 10): count, names, countries, caps, what is blocked, from which mailbox, when.

## 3. Model

```
send_authorizations
  id, org_id, sender_user_id (whose mailbox/identity), provider ('resend'|'gmail'), account_id,
  source ('manual_single'|'manual_batch'|'proposal'|'reply'|'platform_wave'), proposal_id (nullable),
  mode ('send'|'test'), approved_by, approved_at, expires_at (7 days), digest (hash of the previewed item set),
  status ('active'|'revoked'|'expired'|'completed'), revoked_by, revoked_at, revoke_reason, summary
send_items
  id, authorization_id, org_id, message_id (outreach_messages.id, nullable only for source 'reply'... see §9),
  crm_entry_id, recipients jsonb ({to, cc[], bcc[]}), recipient_country, content_hash,
  send_after, status ('approved'|'sending'|'sent'|'blocked'|'skipped'|'failed'|'revoked'|'expired'|'unknown'),
  reason, idempotency_key, provider_id, provider_message_id, attempts, claimed_at, sent_at
unique (message_id) where status in ('approved','sending')     -- a message is in at most one live authorization
```
`outreach_messages` stays the content table (and keeps its `status` for the existing screens); an authorized message is `queued` with `scheduled_for = send_after`, becomes `sent` as today. The new tables are the authority record, append-only in effect (rows change status, never delete; erasure follows the registry rules like any workspace table; the audit trail holds the approval itself).

## 4. The flow

**Preview** (`POST /api/outreach/send-authorizations/preview`, session only): input is message ids (never "everything drafted"), provider and account, optional `sendAfter`, `mode`. The server loads the messages, verifies the caller owns them and the mailbox, then evaluates **every recipient including cc and bcc** through the gate set as a dry run, and returns: the item list with per-recipient verdicts (`ok`, `suppressed`, `country_gated: needs consent`, `bad_address`, `already_replied`, `no_subject`), counts, countries, today's remaining cap (the lower of `OUTREACH_DAILY_CAP` and the workspace's `outreach_sends_day` limit) and how many days the batch will take at that pace, the first message in full and a sample of others, and a `digest` of the sendable items.

**Confirm** (`POST .../confirm`, session only, carries the `digest`): the server recomputes the preview; if the digest differs it refuses ("this changed since you looked"). Otherwise one transaction writes the authorization and its `approved` items (blocked ones recorded as `blocked` with the reason, so the person can see they were excluded), sets the messages `queued`, and records an audit event. If `mode: 'test'`, nothing is authorized: one copy of the first message is sent to the approver's own address, marked `[TEST]`, and nothing is marked sent.

**Approver rule (v1):** the approver must be the **sender** of the messages (drafts and mailbox credentials are sender-private today, and `send-email` already enforces it). A workspace owner or admin **can revoke** anything in their workspace but cannot approve another member's sending. Platform sends (`platform_wave`) are approved only by a platform owner.

**Execute** (cron `/api/cron/outreach-send` every 5 minutes, plus an inline kick after a "send now" confirm): `lib/outreach/send-executor.ts`, extracted from the logic duplicated in paths 1 and 2 (threading via In-Reply-To, cc/bcc, Gmail account resolution, `syncCrmStageFromOutreach`, `last_contacted_at`). Per tick, per sender, in order of approval:
1. Stop if the platform flag `outreach_sending_paused`, maintenance mode, the workspace's pause (entitlements), or the authorization being not `active`/expired.
2. Compute remaining cap and pacing; take at most that many (and at most `perTick`, default 20, so a long batch spreads over ticks and days rather than bursting).
3. **Claim** one item (`UPDATE … SET status='sending' WHERE id=$1 AND status='approved' RETURNING`), so two executors cannot both send it.
4. **Re-verify**: the message's current hash equals `content_hash` (else `skipped: edited after approval` and the message returns to draft); stop conditions (§5); the gates again (`assertOutreachAllowed` for to, cc and bcc).
5. Send through the provider with a stable `idempotency_key` (Resend) and the pre-generated Message-ID.
6. Record `sent` with provider ids, update `outreach_messages`, sync the CRM, write the audit event. A gate refusal is `blocked` (permanent, with reason); a provider error is retried with backoff up to 3 attempts, then `failed`.

**Crash recovery.** An item `sending` for more than 10 minutes is resolved, never blindly resent: for Resend the same idempotency key makes a resend within 24 hours safe and exact; for Gmail the Sent mailbox is searched for the Message-ID. If neither can answer, the item becomes `unknown`, is shown to the person ("may or may not have been sent: check Sent"), and is never retried automatically. The honest residual: a crash between the provider accepting a Gmail send and the database write can leave one `unknown`.

**Revoke / undo.** `POST .../revoke` (the approver, or a workspace owner/admin, or staff through SAIL in an incident) sets the authorization `revoked`, its unsent items `revoked`, and the messages back to `draft`. Items already `sent` are untouched and reported ("7 revoked, 3 had already gone"). Through the proposal layer, `undo` is exactly this.

## 5. Stop conditions (checked at send time)

An item is `skipped` (with the reason) and later steps of that contact's sequence are revoked when: the contact **replied** (any reply recorded on the entry), the address **bounced, complained or unsubscribed** since approval, the CRM **stage moved to `passed`** or the contact was deleted, the contact is now **paused** by a `follow_up_paused` memory (45 §5), or a different message to the same recipient from the same workspace went in the last 24 hours (duplicate guard). A sequence approved as four dated steps therefore stops itself at the first reply.

## 6. Who and what may propose a send

- A person in the UI uses the preview and confirm above directly: the confirmation *is* the approval, which satisfies "approve per batch" (a human is both maker and checker, and the preview forces them to look).
- **The assistant** gets a governed tool `send_outreach_batch` that creates a proposal of capability `outreach_send_batch` (risk **R2**) holding the item list and digest. It cannot confirm. The Actions inbox renders the same preview as the UI and the approve button is the confirm (apply recomputes the digest and refuses if the batch changed since it was proposed). `mayAutoCommit` is already false for R2; an eval pins it.
- **Untrusted runs cannot create an R2 proposal at all** (stricter than doc 43's cap): a run that read a web page, an upload or an inbound reply is refused with an explanation, because "stranger's text queued mail to people" is the exact failure R2 exists to prevent. The person re-asks in a clean run.
- **Agents:** no definition has an R2 ceiling today, and an eval fails the build if one acquires it without being added to a reviewed list. A later agent that drafts and *proposes* a batch is allowed by this design; one that approves is not.
- **Approval routes** are session-only (the assistant principal, MCP tokens and agents are refused), exactly like `/api/actions`.

## 7. What changes for each existing path (migration plan)

| Phase | Change | Why first |
| --- | --- | --- |
| **P0: fixes that do not depend on this design** | Make `outreach-scheduler` and `outreach-poll` fail closed on an unset `CRON_SECRET`. Make `campaigns/[id]/send` refuse an empty `memberIds` unless `all: true` is sent with the count the caller saw, and refuse if the count differs. Run cc and bcc through the gate in `sendEmail`/`sendGmail`. Write an outreach row (or audit event) for `send-one`. Flip the `autoSend` default to **off** and show the platform owner the setting. Stop `send_batch` pretending to schedule: until the executor exists it should say so. | Real exposure today, small changes, each testable alone. |
| **P1: tables, preview/confirm, executor** | `send_authorizations`, `send_items`, the executor extracted from paths 1 and 2, `/api/outreach/send-authorizations/*`, the cron, the "Review and send" screen. Paths 1, 2, 5 and 6 create an authorization through the same code (their button gains the preview) and call the executor inline. Path 8 (`send_batch`) becomes "authorize with `sendAfter`" and finally has a worker. | The core. Same behaviour for a person who clicks send, plus a record, content binding, caps, pacing and revoke. |
| **P2: proposals** | Capability `outreach_send_batch`, assistant tool, inbox rendering, SAIL counts. | Needs P1. |
| **P3: enforce** | `sendEmail`/`sendGmail` with `purpose: "outreach"` require an authorization id when the platform flag `outreach_require_authorization` is on for the workspace (rollout percentage, then 100). Before that, a send without one is logged as `send.unauthorized_path` (shadow mode) so the list of stragglers is data, not a guess. Path 4 (reply) becomes an authorization of one item with `source: 'reply'`. Path 7 writes a `platform_wave` authorization per wave, approved by the platform owner's standing setting, recorded as such. | Closes the door only after everything known has been moved and the shadow log is empty. |
| **P4: sequences and channels** | A multi-step sequence approved once as dated items; align the LinkedIn action queue with the same authorization record. | Needs P1 and a LinkedIn review. |

## 8. Enforcement and evals

- **Static (build gate):** R2 never auto-commits for any setting; no agent definition has an R2 ceiling outside the reviewed list; the preview refuses an empty or "all" selection; `outreach_send_batch` is not creatable from an untrusted run; the approval routes refuse the assistant principal.
- **Live read-only (nightly):** no `sent` message after the enforce date without a `sent` item in an authorization approved by its sender; no item sent after its authorization was revoked or expired; no item sent whose recorded hash differs from the message's hash at that time; no sender exceeded the daily cap; no `sending` item older than an hour; no authorization approved by anyone but the item's sender (outside `platform_wave`); the count of `send.unauthorized_path` events is zero once P3 is enforced.
- **Behavioural tests (PGlite):** preview refuses what the gates refuse and says why, including a gated cc; a confirm after the batch changed is refused; an edit after approval skips that message; a reply between approval and send skips the rest of the sequence; revoke stops unsent items and reports the sent; two executors send an item once; a crash after the claim resolves via the idempotency key and never double-sends; the cap spreads a large batch across ticks; a paused workspace, the platform flag and maintenance mode stop the executor mid-batch.

## 9. Details that need care

- **Replies (path 4)** have no pre-existing draft message in the usual sense (`deliverApprovedReply` creates the row as it sends). Under P3 the approval is the human approving the drafted reply; the authorization is created in the same step with `message_id` set after the row is created. This is the one place `message_id` is set late.
- **cc and bcc are recipients.** They are in `recipients`, each is gated, each is shown in the preview, and each must be allowed for the item to go. A campaign-level bcc that is the founder's own address is shown as such and does not need a country verdict.
- **Provider choice is part of the approval.** A batch approved to go through Gmail never silently falls back to Resend (a different identity and deliverability reputation); if the mailbox is disconnected the items wait and the person is told.
- **Unsubscribe and footer** remain applied inside the provider functions; the content hash covers the text the person wrote, not the footer.
- **Time zones and windows.** Email has no weekday-only rule today (that policy exists for LinkedIn in `rate-limit.ts`). v1 exposes `sendAfter` and the daily cap only; a business-hours window is a per-workspace option, default off, so it cannot surprise anyone.
- **Pitch-us (platform) mail** is the platform owner's responsibility; `platform_wave` records each wave and who has the standing setting on, and the founder-consent flow from the earlier work still gates country-restricted recipients.
- **Erasure and export:** the two tables are workspace data in the registry. A tombstoned workspace's authorizations are deleted with it; the platform's own `audit_events` row for each approval is retained as for any audited action.

## 10. Risks and answers

| Risk | Answer |
| --- | --- |
| Approval fatigue: people click through the preview | The preview leads with what is *unusual* (blocked recipients, country-gated, cap days, edited drafts), shows the first message in full, and a batch over 25 requires typing the count. Measure click-through time in telemetry; revisit if it is under a second. |
| A long batch is half-sent when something goes wrong | Revoke stops the rest in one action; caps and `perTick` mean most of a large batch is still unsent when a problem is noticed; the platform flag stops everything. |
| Mail goes twice | Claim by status transition; Resend idempotency key; the unique live-item index; `unknown` rather than guess for Gmail. |
| The executor is a new single point of failure | It is a cron with the same tracking and stale-job alert as the others, and approval never depends on it: items wait. A SAIL tile shows queued items, oldest age, and `unknown` count. |
| Slower to send | "Send now" runs the executor inline for that authorization, so a person's click still sends within seconds, at the cost of the preview step. |
| Breaking the existing screens | Messages keep their `status` and routes during P1; the old routes become thin wrappers; P3 enforcement is flag-gated per workspace with a shadow period. |

## 11. Decisions for the founder

1. **Approver = sender only (recommended)**, with owner/admin able to revoke. The alternative (an owner approving a member's batch) needs a decision on shared mailboxes and consent; I would not offer it in v1.
2. **Authorization lifetime: 7 days (recommended).** Longer lets old approvals fire on stale facts.
3. **`autoSend` for pitch-us campaigns: flip the default to off (recommended)** and have you turn it on knowingly, with the wave recorded. It currently sends unattended by default.
4. **Typed count above 25 recipients** (recommended) versus a plain confirm.
5. **Test mode (send me a copy)** in v1 (recommended; cheap, and the disclosure principle asks for a safe mode).
6. **P0 first, now,** as its own small change before any of the new tables (recommended): the fail-open crons, the unbounded bulk send and the ungated cc/bcc are live exposures independent of everything else.
7. **Enforcement date** for P3: after the shadow log has been empty for two weeks, not before.

## 12. Non-goals

LinkedIn sending (aligned in P4, not redesigned), SMS or other channels, standing authorizations for tenants (R2 is never autonomous), approving from outside the app (email links to approve are a phishing shape and are excluded), changing the gates themselves, and any change to what the sender's content may say (that is the copywriting and compliance work, not this layer).

## 13. P0 built, 2026-10-05, and the founder's decisions recorded

Decisions taken (from §11): the approver is the sender only, with owner and admin able to revoke; authorizations last 7 days; a batch over 25 recipients requires typing the count; test mode is in v1; the `autoSend` default is off; enforcement (P3) waits until the `send.unauthorized_path` shadow log has been empty for two weeks. These bind P1 to P3; only P0 is built.

P0, one small change, each part with its own regression test:
1. **Four crons failed open, not two.** `outreach-scheduler`, `outreach-poll`, `market-signals` and `outreach-deliverability` all treated an unset `CRON_SECRET` as authorized. All four now use `isCronAuthorised` and refuse. A test scans every route under `app/api/cron` and fails if one reintroduces the pattern. (Production has `CRON_SECRET` set, so nothing changes there today; the hole was one missing variable away.)
2. **Bulk send names its recipients.** `lib/outreach/bulk-selection.ts`: an empty or missing selection is refused; `all: true` needs the `expectedCount` the caller saw, and the server refuses with 409 if the drafted count differs; at most 200 per send; `preview: true` returns the count without sending. No screen in the app calls this route today (searched), so nothing breaks; the route is reachable by API and the bulk send now writes an `outreach.bulk_send` audit event.
3. **cc and bcc are gated.** `filterSecondaryRecipients` (`lib/email/send-gate.ts`), applied in `sendEmail` and `sendGmail` for outreach: an address on the do-not-send list is dropped from cc and bcc; a country-gated cc without the sender's recorded consent is dropped; a bcc is held to the opt-out only (it is usually the sender's own or a platform copy). A dropped address does not stop mail to the person being written to, and is reported in `droppedRecipients` on the result. A refusal of the *primary* recipient is unchanged. Transactional mail is untouched. Callers do not yet surface `droppedRecipients` to the user; that arrives with the preview in P1.
4. **Scheduled sends refuse honestly.** `send_batch` and `send_openers_nudge` are refused when created (409 with the reason) and, if a row exists, fail with that reason; the wizard's two buttons are disabled with an explanation. `send_openers_nudge` also wrote one fixed text about a past event into every tenant's queue. Production had no scheduled rows, so nothing was lost.
5. **`autoSend` defaults off,** including when the settings row cannot be read (before, a database error fell back to on). Production's settings row already had `autoSend: false`, so no behaviour changes today; the exposure was the fallback.
6. **`lp-campaign/send-one` leaves a record and needs permission.** It now requires the workspace sending permission (as `send-email` does), refuses placeholder and unattended addresses, and writes an `outreach.email_sent_single` audit event (who, to whom, subject, size, provider id). The LP Campaign "Send" button shows the route's error message if a member without sending permission clicks it.

Not covered by P0 and still open: the Gmail path's cc/bcc filter is wired but only the filter itself and the Resend path are tested (the Gmail send needs an OAuth token fake); callers do not yet show `droppedRecipients`; the investor-updates send (path 6 in §1.1) has not been reviewed and is the next path to read before P1.

## 14. The investor-updates path, reviewed, and what changed (2026-10-05)

**What it gets right and P1 should copy, not replace:** the snapshot is the approval (the content and recipient list are frozen when the first send is claimed, and a retry sends the snapshot whatever the request says); the lease and per-recipient permission re-check stop two senders or a sender who lost permission; each recipient has its own state and a Resend idempotency key, so a retry cannot double-send; a delivery older than 20 hours is refused for manual reconciliation rather than guessed. In doc 46's terms, `delivery_snapshot` is the authorization and `investor_update_recipients` are the items, so P1 should map this path onto `send_authorizations` (source `manual_batch`) rather than rewrite its loop.

**What was wrong, and is fixed:**
1. **A recipient who opted out, or needed recorded consent, was treated as a failure to retry.** The gate throws inside `sendEmail`; the route recorded `failed`, so the update sat in `partial` with "N deliveries need retry" forever and a retry hit the same refusal. Those are now `skipped` with the reason shown against the recipient, the update can complete, and a retry does not try them again. The classification is shared (`lib/email/send-errors.ts`) so other callers can use it.
2. **A held sender (paused workspace, plan without outreach, daily allowance used up) failed every remaining recipient one by one.** It now stops the loop, leaves the rest `pending`, says why, and a retry after it is resolved sends only the ones that waited.
3. **The daily sending allowance did not count investor updates or single sends.** It counted `outreach_messages` only, so an update to hundreds of people neither used up the allowance nor was stopped by it, and `send-one` (no row) was invisible. `sentToday` now sums outreach messages, delivered update recipients and single-send audit events, per workspace, each source failing to zero independently.

**Open question for the founder, not a bug:** an investor update goes to people the founder already has a relationship with, but it is sent as `purpose: "outreach"`, so a German or other EU/EEA recipient is skipped unless the sender has recorded consent or an existing-customer relationship for that address. That is the conservative reading of doc 37 §8.3 and is what the gate does for all outreach. If counsel decides updates to existing investors are a different category, the answer is a purpose of its own with its own rule, not a bypass; I have not changed it.

**Surfacing dropped cc and bcc (gap 3 follow-up).** `droppedRecipients` now reaches the person: `send-email` returns `dropped` and a plain-language `note` (the admin outbox panel shows it), the campaign bulk send returns `dropped` per message and an overall `note`, and the platform campaign cron counts and logs left-out copies (`droppedCopies` in its summary and a warning line). The investor-update path has no cc or bcc. The Gmail path carries the same field; as before, only the filter and the Resend path are covered by tests.

## 15. P1 built, 2026-10-06

**Built:** migration `2026-10-06-send-authorizations.sql` (applied to production; `send_authorizations`, `send_items`, the live-message unique index, the flag `outreach_sending_paused`; both tables are in the erasure registry), and `lib/outreach/send-auth/`:
`model.ts` and `verdicts.ts` (pure: content hash, digest, days needed, stop conditions; the verdict text is client-safe), `preview.ts` (every recipient including cc and bcc through the gates, with verdicts, the mailbox, the cap and days, a digest), `store.ts` (confirm, revoke, list), `executor.ts` (claim, re-verify, send, record, recover, expire), `context.ts` (the authorization marker and the shadow log), `session.ts` (person-only routes).
Routes: `POST /api/outreach/send-authorizations/preview`, `POST /api/outreach/send-authorizations` (confirm, optionally sending at once within the cap), `POST .../<id>/revoke`, `GET` list, `POST .../test` (a test copy to the approver only), and the cron `/api/cron/outreach-send` every 5 minutes (in `vercel.json` and the stale-job monitor). UI: `components/outreach/send-review.tsx` (the Review and send dialog and the Sending list), used by the Send Center outbox in place of the old browser `confirm()`.

**The two old routes now use it and keep their response shapes:** `send-email` (one message) and `campaigns/[id]/send` (a named batch; a batch over 25 needs `typedCount`; what the daily cap holds back reports `queued` and continues on the cron). Paths 3 (`send-one`), 5 (dashboard action) and 6 (investor updates) are not moved yet; they are labelled and logged instead (below).

**Behaviour that changed on purpose, beyond the design's list:** a message already sent is refused (the old single send would send it again); the bulk send sends **one message per address per batch** (the old route sent a contact's whole four-step sequence at once, because its query returned every unsent message of every drafted member; the first step goes now and the rest wait for their own approval, which is the sequence feature of P4); an edited, replied-to, opted-out, passed or paused contact is not messaged even if approved earlier; a held sender (paused, plan, daily allowance) stops its own batch and leaves the rest approved; a transient provider failure backs off (5, 10, 20 minutes) and gives up after three attempts, every attempt carrying the same Resend idempotency key.

**A bug the tests caught in my own first version:** a transient failure was releasing the item with its attempt count reduced, so the three-attempt limit could never be reached. Held senders and unavailable mailboxes cost no attempt; a real failed attempt now keeps its count.

**Shadow log (the P3 precondition):** every `sendEmail` and `sendGmail` outreach send outside the executor writes `send.unauthorized_path` (at most one row per path per minute) labelled by `via` (`lp-send-one`, `dashboard-action`, `investor-update`, `platform-wave`, `reply`). A live eval reports the last 14 days by path. Enforcement stays off: it comes after that log has been quiet for two weeks, and it needs paths 3, 5, 6, 7 and the reply path moved first.

**Tests:** 36 in `send-auth.test.ts` and 8 in `legacy-routes.test.ts` against PGlite with the real migration and a stub provider (preview verdicts, confirm refusals, once-only sending under two executors, edit/reply/opt-out/pass/pause/duplicate stops, cap and pace, scheduled time, platform pause, held sender, backoff and give-up, crash recovery for Resend and Gmail, mailbox never falling back, threading, expiry, revoke, the shadow log) plus the old routes' refusal codes. Three live evals added (approver and revoke integrity, caps and stuck sends, the shadow-log report); the full suite passes.

**Verified on production** with a throwaway workspace and a stub provider (no mail was sent; everything removed afterwards): the preview classified five messages (one opted out); a wrong digest and a different approver were refused; approval queued four messages and sent nothing; between approval and sending one message was edited and one recipient opted out, and the executor sent exactly the two that were still as approved (skipping the edited, blocking the opted-out) with the idempotency key set; the authorization completed; a second authorization revoked before sending sent nothing and released its message; the live evals passed.
**Not verified:** the Review and send dialog and the Send Center page (they need a signed-in session; the dialog is untested in a browser), a real Resend or Gmail send through the executor, and the cron on Vercel's schedule.

**Still open in this design:** P2 (the `outreach_send_batch` capability, the assistant tool, the inbox rendering, a SAIL tile for queued, stuck and unknown items), P3 (move `send-one`, the dashboard action, the investor updates, the reply path and the platform wave onto authorizations, then enforce), P4 (dated sequences, LinkedIn). An `unknown` Gmail item is shown to the person but there is no Sent-mail search yet to resolve it automatically.

### 15.1 Tried in a real browser, 2026-10-06 (Chrome against production, throwaway workspace, platform sending paused)

Worked as designed: the Review and send dialog (recipient, mailbox, cap, first message in full), a blocked row (an opted-out recipient lists its reason and Approve is disabled), Approve (one message), the Sending list and Stop, a 31-message batch through the same API calls (28 ready, one opted out, one needing consent, one second step held back; the typed-count requirement, the stale-digest refusal, revoke of all 28), and **Send me a test copy** (one email to the approver's own address, nothing to the recipient). At a 386 px width the dialog fits and reads well.
Found and fixed: the dialog said the rest would go "as your daily cap allows" while sending was paused (it now says sending is paused and the approval stands for 7 days); a draft in another of the sender's workspaces was reported as "not found" (it now names the workspace and says to switch to it; another person's draft is still reported as not found and never described); the outbox panel showed "No emails in this bucket" while still loading (it now says it is loading); at phone width the app's bottom navigation covered the dialog's last lines (the dialog now sits above it with room to scroll).
Found, not fixed: **228 of the owner's drafts belong to a legacy account id (`usr_...`) with no workspace**, so no signed-in user can preview or send them; they show as "not found". They need either a decision to delete them or a migration of their owner to the current account id. The Send Center page also takes about 25 seconds to render its 200 long draft cards, which froze the browser tab twice during testing; paginating or collapsing the card bodies would fix it.

### 15.2 The two follow-ups from 15.1, 2026-10-06

**Send Center speed.** The outbox is now paged (25 a page, a stable order that breaks ties on step and id, Previous and Next with "1–25 of N") and each message body is collapsed to a few lines with "Show full message". `listOutbox` takes an `offset`, the route passes it, and a test checks that pages cover every draft exactly once and that a past-the-end, negative or fractional offset is safe.

**The orphaned drafts: migrated what can move, and found that most cannot.** The legacy account `usr_mohm2n4k_9ron4asf` owned 361 messages (228 email drafts, 132 LinkedIn drafts, 1 approved LinkedIn) on 296 contacts, none in any workspace; it also owns 11,907 contacts and 2 campaigns (293 members), which were not touched.
- **Moved to the current account and its workspace ("Anker", the founder workspace): 14 contacts and their 24 messages** (11 email drafts, 12 LinkedIn drafts, 1 approved LinkedIn). Their legacy board links were cleared because those boards belong to no workspace. Every changed row is recorded in `legacy_owner_migration_backup_20261006` (old owner, workspace and board), the change is in the audit trail as `data.legacy_owner_migrated`, and a rollback restores it.
- **Not moved: 282 contacts and their 337 messages (217 of them email drafts),** because the same contacts already exist in the current workspace (same source and import key), and the current copies already hold a draft in every one of the same slots (a workspace allows one draft per contact and kind). The bodies are different: the legacy ones are the **May 2026** first-round "Brief introduction, Fund II" sequence, the current ones are the **June and July** rewrites (for example the July 16 session invitation) for the same people. Moving them would mean displacing the newer drafts with the older ones, or deleting data, so they were left as they are. They remain unsendable; their number in the Send Center's drafts list is why it still shows more drafts than the current workspace holds.

**Correction to 15.1 on the slowness.** Measured afterwards in Chrome: the browser tab the automation uses is hidden (`document.visibilityState` is `hidden`), and a hidden tab does not paint or run its page effects promptly. In that tab first paint came 28.9 seconds after the document had finished loading (scripts were all in by 0.75 s) and the outbox request started at 28.8 s, so most of the "25 seconds, froze the tab" seen in testing was the hidden tab, not the 200 cards. The paging and collapsing are still right (25 cards instead of 200 long ones is far less to render, and the data is unchanged), but the speed-up for a person looking at the page in a foreground tab was not measured and may be smaller than 15.1 implied. Measured here: moving to the next page takes 0.77 s including the request, and every message starts collapsed.

**Migration check.** In the "Anker" workspace the preview now finds the moved drafts (it said "not found" before). The two checked are university drafts with no email address, so the preview refuses them for that reason ("No email address"), which is correct.

## 16. P2 built, 2026-10-06

**Superseded drafts (done before P2, at the founder's instruction).** The 337 May 2026 drafts left on the legacy account (217 email, 120 LinkedIn; superseded by the June and July drafts on the same contacts) were marked `cancelled`: off the drafts lists, still on file, original status in `legacy_drafts_cancel_backup_20261006`, audited as `data.superseded_drafts_cancelled`. The Send Center now counts 251 email drafts (240 current plus the 11 migrated).

**Capability `outreach_send_batch` (R2).** `lib/actions/capabilities.ts`, with the rules in `lib/actions/model.ts` and `store.ts`:
- **The proposal is the preview.** Its diff lists who receives what (first 12, then a count), what is left out and why, the mailbox, and the digest of exactly that set (stored with the input).
- **Approval is the sender's and happens before anything is claimed.** A `precheck` runs before the proposal is claimed, so these refusals leave it pending instead of killing it: the approver is not the sender; more than 25 messages and no typed count; the batch changed since it was proposed (a draft edited, an opt-out, a reply). Then `apply` authorizes the batch under `source: 'proposal'` and the executor sends up to 25 now, the rest as the cap allows.
- **Undo stops what has not gone** (and says honestly that nothing can be done if all of it has).
- **It never auto-commits** (R2), **a run that read outside content cannot create it** (refused at creation, `mayPropose`), **"Approve all" never covers it** (the inbox hides the group button for it and the bulk route refuses it), and **no agent definition may have an R2 ceiling**.
- **Evals:** the static build-gate cases now pin the reviewed R1 and R2 sets and the whole send-safety list above; nothing above R2 exists.

**Assistant tools.** `outreach_drafts` (read-only: the user's draft message ids in the active workspace, with contact and subject) and `outreach_send_batch` (governed: creates the proposal, never sends, and its answer to the model says it is awaiting approval and that only the sender can approve). Both are in the founder and VC presets.

**Actions inbox.** An R2 card says plainly that approving sends real email that cannot be recalled and that only the sender can approve; it shows a "type N" box for large batches and an "Approve and send N" button.

**SAIL `/sending`.** Platform pause and resume (admin and above, a reason required, audited through the flag editor; it is the flag the executor already checks), sent today, due and waiting with the oldest age, active approvals, last 7 days by status, and "needs a person" (failed, unresolved or stuck items by workspace name and age). Metadata only: a test plants recipients and reasons and asserts none reach the page data. SAIL's test config now allows 60 s for the in-memory database hook; the full suite had failed intermittently when several files started one at once.

**Tests:** 15 on the capability against PGlite with the real migrations and a stub provider (preview, refusals, untrusted creation, no auto-commit, idempotent proposals, the sender-only approval, the typed count, a changed batch, platform pause, reject, both undo cases) plus the assistant path; the Anker suite passes (1,403 tests) and SAIL's 82.
**Verified on production** with a throwaway workspace while platform sending was paused (so nothing could be sent; restored afterwards, everything removed): an untrusted run was refused; the trusted proposal listed two recipients and one left out and queued nothing; another approver was refused and the proposal stayed pending; an edited message made the batch refuse; the sender's approval authorized two and sent none because of the pause; undo stopped both and returned the messages to draft; the evals passed.
**Not verified:** the Actions inbox card and the SAIL `/sending` page in a browser, the assistant raising the proposal in a live conversation (a real model call), and a real send through a proposal.

**Still open:** P3 (move `send-one`, the dashboard send action, investor updates, replies and the platform wave onto authorizations, then enforce once the shadow log has been quiet two weeks) and P4 (dated sequences, LinkedIn).

## 17. P3 built, 2026-10-06: every outreach path runs under an authorization

**The idea.** The paths that send at once from a click have no stored draft for a person to approve, so for them the click (or, for the platform wave, the owner's standing setting) is the approval. What P3 adds is the record and the proof: the approval is written first (who, the exact recipients and copies, a hash of the text, the mailbox, when), the sending code then runs under it (`withSendAuthorization`), and the provider functions can tell an authorized send from a path nobody moved. If the record cannot be written, nothing is sent.

**Built** (`lib/outreach/send-auth/inline.ts`, `enforce.ts`; migration `2026-10-06b-send-auth-sources.sql` applied to production, which adds the sources `direct` and `investor_update` and the flag `outreach_require_authorization`, off):
- **Single send (`lp-campaign/send-one`) and the dashboard send action**: source `direct`, approver the signed-in sender.
- **Replies (`deliverApprovedReply`)**: source `reply`; the item's reference is the real reply message, so it is one record per reply.
- **Investor updates**: source `investor_update`, one authorization per update kept across retries (`update:<id>`), one item per recipient still owed, items move approved, sending, then sent, skipped or failed; a retry opens a fresh authorization only for the recipients not yet settled. The route's lease and snapshot logic are unchanged.
- **Platform campaign wave**: source `platform_wave` under the workspace id `platform:pitch-us`, approved by `platform:setting:autoSend` or `platform:owner-release` (whichever released the wave), one authorization per submission per wave, six-hour life.
- **The executor now sends only message-backed sources** (`manual_single`, `manual_batch`, `proposal`); an inline authorization's items are never picked up by the cron, and an inline send interrupted mid-way becomes `unknown` for a person to check, never a retry.
- **Enforcement**: with `outreach_require_authorization` on, `sendEmail` and `sendGmail` refuse an outreach send that is not under an authorization (`UnauthorizedSendError`, code `send_unauthorized`); a percentage rolls it out per sender by a stable hash; a failed flag read never blocks sending. SAIL `/sending` has the control: superadmin only, with a reason, **refused while any send skipped an authorization in the last 14 days** (it names the paths), off at any time.
- **Evals:** live: every outreach message sent since the first inline authorization has a sent item; if enforcement is on, no unauthorized send is logged after it was switched on; the earlier shadow-log report remains. Static: no code outside the two provider modules posts mail to a provider (the public contact form, which mails the company's own inbox, and the Resend event reader are the only named exceptions), and every file that sends outreach labels its path.

**A hole found and closed.** The dashboard send action had a SendGrid fallback that posted straight to SendGrid with a key and sender address the caller could supply, so it skipped the opt-out, the country rule, the footer and any authorization. It could only run when Resend was not configured (production has Resend), and it is removed: with no Resend the action now says nothing was sent.

**Tests:** 17 new on inline authorizations, enforcement (off, on, rollout, a failed read, `sendEmail` refusing before the provider and sending under one, the gates still applying) and the send-one route; the investor-update tests now also check the one-authorization-across-retries behaviour; the SAIL rule is tested (a quiet fortnight, superadmin only, off any time). Anker 1,424 tests, SAIL 83.
**Verified on production** with the provider stubbed (nothing was sent; everything removed): a `direct` authorization was recorded before the send and settled sent with a content hash and completed; a `platform_wave` authorization under `platform:pitch-us` accepted its approver and completed; an investor-update authorization was reused on a retry; the enforcement flag is off in production; the live evals pass.
**Not verified:** the real cron wave and a real reply under authorization (they need live campaign data and a reply), the SAIL enforcement control in a browser, and enforcement switched on for real (deliberately not done).

**The clock.** Enforcement can be switched on after 14 days with no `send.unauthorized_path` event. The log had no events when P3 shipped, so the earliest date is two weeks after the last event, which is today if nothing unmoved sends. The SAIL control computes this itself and refuses early. **Still open: P4** (dated sequences, LinkedIn).

