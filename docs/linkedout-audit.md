# LinkedOut — improvements audit

A prioritized review of where the LinkedOut engine (Phases 1–4, live) and the Chrome
extension can go next. Grounded in the shipped code: `lib/linkedin/*`, `app/api/linkedin/*`,
`app/api/orchestration/*`, and `extensions/linkedin/*`.

Priority key: **P0** = correctness/reliability or safety gap worth doing before scale ·
**P1** = high-value feature/UX · **P2** = nice-to-have / later.

---

## A. Platform / feature

### Reliability & correctness
- **P0 — Global per-sender cap across campaigns.** `sending-window.canSendNow` counts a sender's
  committed usage across *all* their actions, which is correct — but confirm two active campaigns
  sharing a sender can't collectively blow past a human-plausible daily total. Add an explicit
  account-level daily ceiling independent of per-campaign math.
- **P0 — Failed-action retries.** Today a `failed`/`rejected` action stops the member
  (`sequencer.ts`). A transient DOM failure shouldn't kill the sequence. Add bounded retries
  (e.g. 2 attempts with backoff) before `stopped`, distinguishing transient vs. terminal failures.
- **P0 — Stuck-member detection.** A member whose action sits `claimed` forever (extension
  crashed mid-action) never advances. Add a claim TTL: re-queue or fail actions `claimed` longer
  than N minutes (mirrors n8n/crawl patterns).
- **P1 — Cross-campaign dedupe.** Prevent enrolling / messaging the same person from two active
  campaigns at once (an easy way to look spammy). A `unique(user_id, target_url)` guard across
  active members, or a soft warning at enroll time.
- **P1 — Sequencer observability.** `tickCampaign` returns rich counts (`enqueued/advanced/held/…`)
  but nothing persists them. Log tick results to a table for a per-campaign health view and to
  debug "why isn't this advancing?".

### Features
- **P1 — Analytics / funnel (the Phase 5 core).** Per-campaign and per-sender funnel:
  sent → accepted → replied → booked, with time-series. The data is already in `li_action_queue`
  + `li_campaign_members` + `li_conversations`; this is mostly a read/aggregation layer + charts.
- **P1 — Multi-sender rotation.** A campaign currently sends as one sender. Agencies want a pool
  with round-robin + per-sender caps, so a 500-person campaign spreads across accounts safely.
- **P1 — Reply/acceptance-driven branching.** `if_no_reply` now works (reply-stop); `if_accepted`
  still can't be evaluated without connection-acceptance detection (see Extension §B). Landing that
  signal unlocks true "connect → *if accepted* → message" sequences under full-auto.
- **P1 — Template library + richer tokens.** Beyond `{{firstName}}/{{name}}`, support
  `{{company}}/{{title}}` (already captured on `li_lead_list_members` + CRM), saved snippets, and
  A/B message variants with per-variant reply-rate reporting.
- **P2 — Working-hours polish.** `withinWorkingHours` handles daytime ranges only; add overnight
  ranges, weekend skip, and per-campaign send windows on top of per-sender hours.
- **P2 — Compliance surface.** A do-not-contact / opt-out list checked at enqueue, and an
  unsubscribe path when a reply says "stop". Important as volume grows.
- **P2 — Workspace/agency model.** Share senders + lead lists across an org (the platform already
  has orgs/memberships) so a team runs from a shared pool.

### Approval UX
- **P1 — Bulk + rules.** Review Queue already does bulk approve/reject; add "approve all for
  campaign X", keyboard shortcuts, and per-campaign auto-approve rules (graduated trust) so power
  users aren't clicking every card.

---

## B. Chrome extension

### Reliability (MV3 service-worker realities) — **P0**
- **Service workers get killed.** `action-worker.ts` and `inbox-sync.ts` drive long `setTimeout`
  loops (30–75s pauses between actions). MV3 terminates idle service workers (~30s), so a paced
  loop can be killed mid-run. Move scheduling to **`chrome.alarms`** (one action per alarm tick)
  and persist worker state (current batch, counters) in `chrome.storage` so it survives restarts.
  This is the single biggest robustness win.
- **Resume correctly.** The auto-resume on `onStartup` is good; extend it to re-arm the alarm and
  reconcile any action left `claimed` server-side (tie-in with the platform claim-TTL above).

### DOM resilience — **P0/P1**
- **Selectors are best-effort.** `action-executor` (connect/message) and `inbox-sync` (thread
  scrape) hard-code LinkedIn selectors with a few fallbacks. LinkedIn changes these often.
  - **P0** — report execution failures (with a reason code) back to the platform so we can see
    breakage centrally instead of via silent `failed` rows.
  - **P1** — **remote selector config**: fetch a selector map from Anker at runtime so a LinkedIn
    DOM change is a server config edit, not a Web Store re-review + re-publish.
  - **P1** — a fixture-based test harness (saved LinkedIn HTML) to catch selector regressions.

### Signals the platform needs — **P1**
- **Connection-acceptance detection.** Poll the "Sent invitations" / pending-invites view and
  report which invites were accepted → flip `li_campaign_members` and unlock `if_accepted`.
- **Deep inbox sync.** `inbox-sync` captures only the conversation *list* snippet. Add full thread
  history (open thread → paginate messages) so Unibox shows real conversations, and inbound
  detection is exact rather than inferred from a "You:" prefix.
- **Sender auto-registration.** Use `whoami`/the logged-in profile to auto-create the
  `linkedin_sender` and detect *which* account is active, instead of manual sender entry — and warn
  when the browser is signed into a different account than the campaign's sender.

### Human-likeness & safety — **P1**
- Client-side enforcement of caps/working-hours as a second guard (belt-and-suspenders with the
  server), randomized scroll/mouse movement before acting, and a per-account cooldown after any
  friction event (currently it just stops).
- Popup: show today's caps/usage and a countdown to the next action, so the user sees it pacing.

### Security & store — **P1/P2**
- **P1** — revoke the token on extension logout/uninstall; support token rotation from the popup.
- **P2** — Web Store readiness: privacy policy page, justify each permission, screenshots, and
  trim `host_permissions` to the minimum.

---

## Suggested sequencing

1. **P0 reliability pass** — `chrome.alarms` rewrite + persisted worker state; claim-TTL +
   failed-action retries + stuck-member detection on the server. (Makes autonomous running safe.)
2. **Acceptance + deep-inbox signals** — unlocks `if_accepted` and a real Unibox.
3. **Analytics/funnel + multi-sender rotation** — the growth features (Phase 5).
4. **Remote selector config + failure reporting** — keeps the extension alive through LinkedIn
   DOM churn without redeploys.
5. **Compliance, workspace sharing, approval rules** — scale + team polish.

Nothing here blocks the current approval-gated loop, which is live and safe. These are the steps
from "working" to "robust at volume."
