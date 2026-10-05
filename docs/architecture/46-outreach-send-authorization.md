# 46. The R2 sending approval layer: send authorizations

Status: design 2026-10-05; **P0 built and pushed 2026-10-05 (§13)**, the rest not built. Completes [43](43-action-layer-and-approval-inbox.md) (risk class R2: "external to a third party") and answers the open item in [45](45-agent-runtime-completion.md) §9. Written from a read of every code path that can email a third party (§1); where the code surprised me it says so.

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
| 6 | `POST /api/updates/[id]/send` (investor updates, `purpose: "outreach"`) | The founder's click | Its own loop over recipients. Not reviewed in detail in this pass. |
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
