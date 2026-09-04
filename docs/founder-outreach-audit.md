# Founder Outreach Engine — Audit & Improvement Plan

**Scope:** the founder-side email outreach engine — delivery, inbound retrieval,
reply handling, and follow-ups. Focus of this audit: *why the loop stops once an
investor replies* and what it takes to close it into a full send → detect →
classify → respond → follow-up cycle.

**Date:** 2026-09-02 · **Author:** engine audit

---

## 1. The pipeline as it exists today

```
                                   ┌─────────────────────────── AUTOMATED (cron) ────────────────────────────┐
 draft ──► send_batch ──► queued ──► send worker ──► sent/delivered ──► opens/clicks (Resend events)
 (outreach-scheduler */10)                (campaign-send */30)                     │
                                                                                   ▼
                                                                    send_openers_nudge (1 nudge)
 ═══════════════════════════════════════════════════════════════════════════════════════════════════
                                   ┌──────────────────── MANUAL / NOT WIRED ─────────────────────────┐
 investor replies ──► IMAP mailbox ──► pollInbox() ──► outreach_replies (classification = NULL)
                                          ▲                        │
                          only /api/admin/email/poll               ▼
                          (no cron)                     ✗ nothing auto-classifies
                                                        ✗ nothing auto-drafts
                                                        ✗ nothing auto-sends the reply
                                                        ✗ follow-ups not suppressed on reply
```

**Key files**
- Delivery: `lib/email/resend.ts`, `app/api/outreach/campaigns/[id]/send/route.ts`,
  `app/api/cron/campaign-send/route.ts`
- Scheduler: `app/api/cron/outreach-scheduler/route.ts` (`send_batch`, `send_openers_nudge`, `send_bounces_retry` = stub)
- Retrieval: `lib/email/imap-poller.ts` (+ `lib/email/gmail.ts`), surfaced only via `app/api/admin/email/poll/route.ts`
- Reply handling: `app/api/outreach/replies/route.ts`, `lib/ai/reply-handler.ts` (`classifyAndDraftReply`)
- Follow-up inbox: `app/api/outreach/followups/route.ts`
- Orchestration (intended): `lib/outreach/outreachPipeline.ts`, `lib/agents/outreach-agent.ts`

---

## 2. Where the loop actually stops (root cause)

The signal *arrives* but three consecutive links are unautomated, so the chain
dies at the mailbox:

### BREAK 1 — Retrieval is manual (no cron)
`pollInbox()` is only invoked by `/api/admin/email/poll` (an admin route). It is
**not in `vercel.json` crons.** Inbound investor replies are never pulled unless
a human hits that endpoint. Every downstream step therefore starves.

### BREAK 2 — Classification never auto-runs
When the poller *does* run, it inserts `outreach_replies` rows with
`classification = NULL` (see `imap-poller.ts:215`). Nothing on a schedule calls
`classifyAndDraftReply`. The only callers are the manual `POST /api/outreach/replies`
(requires a signed-in user to paste the reply text), the admin inbox, and the
agent — none of which run automatically against NULL-classification rows.

### BREAK 3 — The drafted response is never sent, and stage/follow-ups don't react
Even after a human classifies a reply, `outreach_replies.draft_response` just
sits there. `POST /api/outreach/followups { replyId, approved:true }` only flips
an `approved` boolean — **it does not enqueue an `outreach_messages` row from the
draft**, so approving a reply sends nothing. And the poller path never sets the
original `outreach_messages.status = 'replied'`, so:
- `send_openers_nudge` can still nudge an investor **who already replied**
  (it filters `status != 'replied'`, but the poller never sets that status), and
- sibling follow-ups (`needs_followup`, `followup_due_at`) on the same
  `crm_entry` are not cleared on reply.

**Net effect:** the founder gets a reply, and the system does nothing with it —
exactly the reported "stops at receiving signalling from investors."

---

## 3. Prioritized improvements

### P0 — Close the automated loop (the actual bug)

1. **Cron the inbox poll.** Add `/api/cron/outreach-poll` to `vercel.json`
   (e.g. `*/10 * * * *`) that calls `pollInbox()` per configured mailbox, behind
   `CRON_SECRET`. Without this nothing downstream matters. *(imap-poller.ts already
   checkpoints `last_uid` and dedupes — it is cron-ready.)*

2. **Auto-classify newly-ingested replies.** In the same cron (or a dedicated one),
   select `outreach_replies WHERE classification IS NULL`, run
   `classifyAndDraftReply` for each, and persist `classification`,
   `draft_response`, `recommended_stage`, `reengage_on`. This is the step that
   turns a raw signal into a decision.

3. **Suppress follow-ups the instant a reply lands.** When the poller matches a
   reply to an `outreach_message`/`crm_entry`, immediately:
   - set the matched `outreach_messages.status = 'replied'`,
   - clear `needs_followup = false, followup_due_at = NULL` for *all* of that
     `crm_entry`'s pending messages,
   - cancel `status IN ('draft','queued')` future steps for that entry.
   This stops the engine from nudging someone who already answered (a trust-killer
   for a platform whose whole value is *not wasting an allocator's time*).

4. **Actually send the approved response.** Change the followups approve path so
   `{ replyId, approved:true }` inserts an `outreach_messages` row
   (`kind='reply'`, `body = draft_response` or an edited override, `status='queued'`,
   `email_to`/`email_from` threaded, `In-Reply-To`/`References` set for threading)
   so the existing send worker delivers it. Keep it **approval-gated by default**
   (mirror the LinkedOut engine's born-`pending_approval` invariant), with an
   opt-in auto-send for high-confidence positive classifications.

### P1 — Make the signal handling trustworthy

5. **Reply → stage → next-action state machine.** Map each `classification`
   (interested / meeting / not-now / pass / referral / OOO) to (a) a CRM stage,
   (b) whether to draft, (c) a re-engage date for "not now" (`reengage_on` already
   exists but nothing re-queues on it — add a cron that re-opens those). Today the
   classification is computed but only weakly acted on.

6. **Meeting-intent → scheduling.** When classification indicates a meeting,
   surface the founder's `calendarUrl` in the drafted response automatically and
   flag the reply as "book me" in the follow-up inbox so it can't be lost.

7. **Bounce & deliverability handling.** `send_bounces_retry` is a stub
   (`outreach-scheduler:141`). Wire Resend bounce/complaint events (there is a
   `sync-resend` / `email/sync-events` path) to: mark `bounced_at`, stop the
   sequence for hard bounces, suppress the address, and surface a domain-health
   metric. Protects sender reputation — the founder's from-domain is shared.

8. **Threading correctness on send.** Ensure every outbound message stores its
   `email_message_id` and sets `In-Reply-To`/`References` on replies, so the
   poller's *primary* match strategy (RFC-2822 threading, `imap-poller.ts:156`)
   actually hits instead of falling back to fuzzy from-address matching.

### P2 — Scale, safety, and insight

9. **Retrieval provider redundancy.** IMAP + Gmail are both present
   (`imap-poller.ts`, `gmail.ts`) but only IMAP is (about to be) wired. Add a
   provider-agnostic `pollAllMailboxes()` so Gmail-based senders are covered, and
   record which provider matched for observability.

10. **Idempotency + concurrency.** The dedupe check greps `notes LIKE '%[msgid:…]%'`
    (`imap-poller.ts:206`) — fragile and unindexed. Add a dedicated
    `provider_message_id` column with a unique index on `(user_id, provider_message_id)`
    and dedupe on that. Guard the classify cron against double-processing with a
    row-level `classified_at`/lock.

11. **Human-in-the-loop UI parity.** The follow-up inbox
    (`/api/outreach/followups`) should show the draft, allow an inline edit, and
    have one button that *sends* (per #4) — not just an `approved` flag. Add a
    "why this classification" note (the model already returns `notes`).

12. **Metrics that close the loop.** Extend outreach analytics with reply-rate,
    positive-reply-rate, time-to-first-reply, and follow-up-suppression counts so
    the founder can see the funnel end-to-end, not just sends/opens.

---

## 4. Suggested build order

1. **P0-1 + P0-2** (poll cron + auto-classify) — restores the flow end-to-end.
2. **P0-3** (follow-up suppression on reply) — immediate trust/safety win, small.
3. **P0-4** (send the approved draft) — makes the response actually happen.
4. **P1-5 + P1-7** (state machine + bounces) — correctness & deliverability.
5. **P2** — hardening and insight.

Each P0 item is independently shippable and independently valuable; #1 and #2
together are the minimum that makes the engine stop "stopping at the signal."

---

## 5. Open questions to confirm before building

- **Mailbox model:** one shared `vc@an-ker.de` inbox (current IMAP default) or a
  per-founder sending identity? Drives whether the poll cron loops over many
  mailboxes and how replies attribute to `user_id`.
- **Auto-send appetite:** fully approval-gated (safest, matches LinkedOut), or
  auto-send for high-confidence positive replies with a human override window?
- **Provider of record:** Resend for send + IMAP for receive (asymmetric today) —
  is inbound-via-Resend (inbound parse webhook) preferable to IMAP polling to
  remove the cron/latency entirely?
