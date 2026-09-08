# Scheduling loop + founder call-signal — implementation spec

**Goal.** Close the gap between _investor signals interest_ and _founder takes the call_.
Two concrete outcomes:

1. **Scheduling email** — when a reply is classified `INTERESTED`, the drafted response
   always carries a way to book (the founder's calendar link, or a "propose 3 windows"
   ask when no link is set). Stays **approval-gated** in the outbox.
2. **Founder call-signal** — a dashboard queue that surfaces investors who are ready for a
   call (`stage='meeting'` with a pending scheduling draft), so the founder knows to act.

**Non-goals (deliberately deferred).** Real calendar-availability booking (Calendly/Google
OAuth per founder), auto-sending scheduling mail, SMS/push notifications. The calendar-link
approach gets ~90% of the value with none of the OAuth weight. Revisit only after founders
ask for in-app booking.

**Design principle.** Build on existing rails — the reply-draft pipeline and the CRM stage
machine — not a new subsystem. No new notification service, no new state store beyond one
optional `kind`.

---

## Current state (verified against code)

| Piece | Where | Behavior today |
|---|---|---|
| Reply classifier | [`lib/ai/reply-handler.ts`](../lib/ai/reply-handler.ts) | `INTERESTED` → stage `meeting`; drafts a ≤320-char response; prompt already _mentions_ the calendar link but does not guarantee it lands in the draft |
| Auto-classify cron path | [`lib/outreach/reply-actions.ts:89`](../lib/outreach/reply-actions.ts) | claims pending replies, classifies, persists `draft_response` + `recommended_stage`, advances `crm_entries.stage` |
| Founder context | [`lib/outreach/reply-actions.ts:27`](../lib/outreach/reply-actions.ts) | `FounderCtx.calendarUrl` pulled from `sender_profiles.profile_set` |
| Call Intelligence | `lib/calls/*`, `app/api/calls/*` | closes the loop _after_ the call: analyzes transcript, advances stage, drafts follow-up |
| `outreach_messages.kind` CHECK | [`scripts/migrations/2026-09-02-outreach-kinds.sql`](../scripts/migrations/2026-09-02-outreach-kinds.sql) | closed set: `connection_request, follow_up, different_angle, close_loop, email_intro, dm_intro, reply, reengage` |

**The two gaps:** (a) the scheduling ask isn't _guaranteed_ into the interested draft;
(b) `stage='meeting'` is written but never surfaced to the founder as an actionable queue.

---

## Decision to confirm before coding

**`kind` for the scheduling message.** Two options:

- **A — reuse `kind='reply'`** (no migration). The scheduling mail is just an INTERESTED
  reply that happens to contain a booking ask. Simplest; analytics can't separate
  scheduling mails from other replies.
- **B — add `kind='schedule'`** (one-line CHECK migration). Cleaner analytics ("how many
  scheduling asks did we send / how many converted to a booked call"), and lets the
  call-signal queue key off message kind instead of inferring.

**Recommendation: B.** The whole point is measuring the interested→call conversion, and
that needs `schedule` to be its own kind. The migration is trivial and re-runnable. The
rest of this spec assumes B; deltas for A are noted inline.

---

## Work breakdown

### Task 1 — (Option B only) migration: allow `kind='schedule'`

**File:** `scripts/migrations/2026-09-07-outreach-schedule-kind.sql`

```sql
-- Allow outreach_messages.kind = 'schedule':
--   a booking ask sent to an investor who signaled interest (INTERESTED).
-- Re-runnable (drop-if-exists then add).
ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_kind_check;

ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_kind_check
  CHECK (kind = ANY (ARRAY[
    'connection_request','follow_up','different_angle','close_loop',
    'email_intro','dm_intro','reply','reengage','schedule'
  ]));
```

**Apply:** `node scripts/oneshot/run-migration.mjs scripts/migrations/2026-09-07-outreach-schedule-kind.sql`
**Verify:** insert a throwaway row with `kind='schedule'` succeeds; roll back.

---

### Task 2 — guarantee the booking ask in the INTERESTED draft

**File:** [`lib/ai/reply-handler.ts`](../lib/ai/reply-handler.ts)

Two changes, both keeping the ≤320-char clamp:

1. **Return the intent.** Extend the result object with a discriminator so downstream code
   knows this draft is a scheduling ask:

   ```ts
   export interface ReplyResult {
     // ...existing
     isScheduling: boolean   // true when classification === "INTERESTED"
     bookingMethod: "calendar_link" | "propose_times"
   }
   ```

   Set `isScheduling = cls === "INTERESTED"`, and
   `bookingMethod = ctx.founder.calendarUrl ? "calendar_link" : "propose_times"`.

2. **Post-process the draft to _guarantee_ the ask lands** (don't trust the model to always
   include it). After `clampReply`, for INTERESTED only:
   - `calendar_link`: if the draft doesn't already contain the URL, append
     ` Grab a time: <calendarUrl>` (re-clamp; if it would blow the limit, trim the body
     sentence, not the link).
   - `propose_times`: if the draft lacks a time proposal, append a fixed tail like
     ` Would Tue/Wed afternoon work? Happy to send a couple of slots.`

   Apply the same guarantee in the **heuristic fallback** branch so it holds with no AI
   provider.

**Tests (`lib/ai/reply-handler.test.ts` or existing suite):**
- INTERESTED + `calendarUrl` set → draft contains the URL, length ≤ 320.
- INTERESTED + no `calendarUrl` → draft contains a propose-times ask.
- non-INTERESTED classifications unchanged (`isScheduling === false`).

---

### Task 3 — persist scheduling drafts as `kind='schedule'`

The draft is already written to `outreach_replies.draft_response` by
[`autoClassifyPendingReplies`](../lib/outreach/reply-actions.ts:165). The question is what
`kind` the **outbound** message gets when the founder approves it and it's promoted into
`outreach_messages`.

**Find the promotion point** — where an approved reply draft becomes an `outreach_messages`
row (search for `kind = 'reply'` / the replies-approve route, likely
`app/api/outreach/replies/*` + `lib/outreach/deliver.ts`).

**Change:** when the source reply's `classification === 'INTERESTED'`, insert with
`kind='schedule'` instead of `'reply'` (Option A: leave as `'reply'` — skip this task).
Preserve the existing `UNIQUE (crm_entry_id, kind)` upsert semantics — with a distinct
`schedule` kind, a scheduling mail and a later plain reply no longer collide on the unique
index, which is the correct behavior.

---

### Task 4 — the founder call-signal queue (API)

**File:** `app/api/outreach/ready-for-call/route.ts`

`GET` — authed (same auth pattern as the other `app/api/outreach/*` routes), returns the
investors ready for a call for the current user:

```sql
SELECT c.id, c.display_name, c.display_type, c.display_title, c.stage,
       c.last_contacted_at,
       m.id   AS draft_id,
       m.kind AS draft_kind,
       m.status AS draft_status,
       m.body AS draft_body,
       r.classification, r.received_at
FROM crm_entries c
JOIN outreach_messages m
  ON m.crm_entry_id = c.id AND m.user_id = c.user_id
 AND m.kind = 'schedule'            -- Option A: m.kind = 'reply' AND r.classification='INTERESTED'
LEFT JOIN outreach_replies r
  ON r.crm_entry_id = c.id AND r.user_id = c.user_id
WHERE c.user_id = ${userId}
  AND c.stage IN ('meeting','responded')
ORDER BY r.received_at DESC NULLS LAST
LIMIT 100;
```

Return shape: `{ items: [...], counts: { awaiting_approval, sent_awaiting_reply } }`
where `awaiting_approval` = drafts with `status IN ('draft','queued')`, and
`sent_awaiting_reply` = `status IN ('sent','delivered')` with no newer inbound reply.

This is a pure **view over existing state** — no writes, no new table.

---

### Task 5 — the founder call-signal card (UI)

**File:** `components/outreach/ready-for-call.tsx` + surface on the outreach dashboard
(`app/dashboard/outreach/page.tsx`) as a card at the top, and/or a nav entry.

- SWR against `/api/outreach/ready-for-call`.
- Each row: investor name + firm, the classification/"signaled interest" chip, relative
  time since their reply, and the draft state:
  - `awaiting_approval` → **"Review & send scheduling email"** → deep-links to the existing
    reply-approval UI (reuse it; don't rebuild the approve/send control).
  - `sent_awaiting_reply` → **"Scheduling email sent — awaiting a time"** (muted).
- Follow the Anker visual system already used in
  [`components/signals/market-signals.tsx`](../components/signals/market-signals.tsx):
  `#e5380f` accent, `font-serif` headings, `bg-card/40` rows, mono uppercase tags.
- Empty state: "No investors waiting on a call right now."

**This card _is_ the "signal to the founder."** No push/SMS — the founder sees it on their
dashboard, which is where they already work the pipeline.

---

## The closed loop (after this ships)

```
investor reply
   └─ classify INTERESTED  ──▶ stage=meeting  + draft (kind=schedule, calendar link guaranteed)
                                   │
                                   ▼
                         "Ready for a call" card  ── founder reviews & sends (approval gate held)
                                   │
                                   ▼
                         investor books ──▶ call happens
                                   │
                                   ▼
                    Call Intelligence (paste transcript) ──▶ advance stage + follow-up draft
```

Every outbound step remains human-approved. Nothing auto-sends.

---

## Verification checklist

- [ ] Migration applied to Neon; `kind='schedule'` insert succeeds (Option B).
- [ ] `pnpm tsc` clean.
- [ ] Unit: INTERESTED draft always contains a booking ask (link or propose-times), ≤320 chars, both AI + heuristic paths.
- [ ] Seed one `INTERESTED` reply end-to-end → row appears in `/api/outreach/ready-for-call` as `awaiting_approval`.
- [ ] Approve/send → row flips to `sent_awaiting_reply`; no second scheduling draft is created (unique index holds).
- [ ] Route auth: `/api/outreach/ready-for-call` → 401 unauthenticated, 200 authed.
- [ ] Dashboard card renders empty state and populated state; deep-link to approval UI works.
- [ ] Deploy prod; `curl` the route (expect 401 unauth) and the dashboard page (expect 307 redirect).

## Rollout / sequencing

1. Task 1 (migration) → 2 (draft guarantee) → 3 (kind on promotion): the data side, safe to ship first; existing behavior unchanged for non-INTERESTED.
2. Task 4 (API) → 5 (UI): the founder-facing surface.
3. Commit each vertical slice separately (mirrors the top-3-gaps cadence). Push only on request.

## Estimated size

Small–medium. Migration is one line; reply-handler change is ~30 lines + tests; API route is one query; UI card reuses the market-signals pattern and the existing approval control. No new dependencies, no OAuth, no new cron.
