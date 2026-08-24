# Scope — LinkedIn outreach automation (HeyReach-parity)

Build HeyReach-class LinkedIn outbound automation into Anker: connect LinkedIn "senders",
run multi-step campaigns (connect → message → follow-up) at safe, human-like rates, and
manage replies in a unified inbox — all driven through the existing Anker LinkedIn Chrome
extension.

Status: **scoping** — architecture + phased plan grounded in the existing bones.

---

## 1. What already exists (the bones)

| Bone | Where | Does |
|---|---|---|
| **Chrome extension** | `extensions/linkedin/` (Plasmo MV3 v0.4.0, on the Web Store) | Content scripts on LinkedIn messaging / profile / connections pages; syncs connections + mutuals; pre-drafted DMs; profile → CRM/deal capture. |
| **Queue-polling executor** | extension `crawl-worker` + `POST /api/extension/crawl-queue` | The extension already polls a server queue (`outreach_crawl_queue`), claims rows atomically (`FOR UPDATE SKIP LOCKED`), does work, reports back. **This is the executor pattern HeyReach needs.** |
| **Extension API** | `app/api/extension/*` (whoami, ingest, connections, mutuals, context, draft-by-name, crawl-queue) | Authenticated via `lib/extension/auth` (per-user extension tokens). |
| **Outreach data model** | `outreach_campaigns`, `_campaign_members`, `_messages`, `_replies`, `_events`, `_templates`, `sender_profiles`, `inbox_poll_state` | The email campaign engine — the schema/analytics scaffold to mirror for LinkedIn. |
| **Relationship graph** | connections + mutuals + warm-intro paths | Audience source for campaigns (target 2nd-degree via warm paths). |

**The gap vs. HeyReach:** outbound *sending* (connect requests, messages, follow-ups),
multi-step sequences, per-account rate limiting, and a unified inbox. The read/sync half
is done; the write/automate half is new.

---

## 2. Architecture — extension-driven execution (recommended)

**The platform never touches LinkedIn directly and never stores a LinkedIn cookie.** It
queues *actions*; the user's own browser executes them via the extension and reports back.

```
Campaign (platform) ──queues actions──▶ li_action_queue ──polled by──▶ Extension worker
      ▲                                                                     │ executes on
      │◀──────────── reports result (accepted/sent/failed) ────────────────┘ linkedin.com
   advances the sequence, schedules the next step
```

Why extension-driven (vs. server-side cookie automation):
- **Account safety** — actions originate from the member's real browser + real session,
  at human pace, not a datacenter IP. Far lower restriction risk than headless cookie bots.
- **No secret custody** — Anker never holds `li_at`; nothing to leak. (HeyReach-style
  cloud infra holds cookies; we deliberately don't.)
- **Reuses the bones** — the crawl-worker + queue + content scripts already do exactly
  this shape for reads.

Trade-off: actions run only while the member's browser + extension are open. Mitigated by
scheduling within working hours + a desktop "keep running" affordance. (A server-side
worker is a possible Phase 5 option for always-on, behind an explicit opt-in — out of
scope for the core.)

---

## 3. Safety & ToS (must be built in, not bolted on)

LinkedIn automation is against LinkedIn's ToS and can get accounts restricted — this is a
real, commercial-grade concern (HeyReach/Expandi/Dripify all live with it). Non-negotiable
guardrails, enforced by the engine:
- **Per-sender daily caps** — conservative defaults (e.g. ~20 connects/day, ~40 messages/day),
  ramped by a **warmup** curve for new senders.
- **Working hours + timezone** per sender; nothing fires overnight.
- **Randomized jitter** between actions (minutes, not fixed intervals).
- **Friction detection** — the extension detects captchas / "you're doing that too much" /
  restriction interstitials and **auto-pauses** the sender, surfacing it to the user.
- **Human-in-the-loop by default** — first campaign runs can require per-message approval;
  full auto is an explicit opt-in.
- **No scraping of non-connections' private data**; respect the same limits a person would.

These are product features (trust), not just compliance.

---

## 4. Data model (deltas)

- **`linkedin_senders`** — a connected LinkedIn account (resolved via extension `whoami`):
  member id, display name, profile url, status (`active|paused|restricted|warming`),
  daily caps, working-hours + tz, warmup day, last-action-at.
- **`li_action_queue`** — extend the crawl-queue idea: `sender_id`, `campaign_id`,
  `member_id`, `action_type` (`connect_request|message|follow_up|view_profile|withdraw`),
  `payload` (jsonb: message text, profile url), `status` (`queued|claimed|done|failed|skipped`),
  `scheduled_for`, `attempts`, `result` (jsonb), timestamps.
- **`li_campaign_steps`** — sequence: `campaign_id`, `order`, `type` (`connect|message|delay`),
  `template`, `delay_hours`, condition (`if_accepted|if_no_reply`).
- **`li_conversations` / `li_messages`** — Unibox: synced threads + messages, `direction`,
  `sender_id`, `read`, links to the campaign/member.
- **Leads** — reuse `crm_entries` + `outreach_campaign_members`; add `li_lead_lists` for
  named audiences (from connections, LinkedIn search capture, or CSV).

Where sensible, reuse the existing `outreach_*` tables (channel = `linkedin`) rather than
duplicate — decide per-table during Phase 1.

---

## 5. Extension additions

- New message types: `sendConnect` (profile/search page → click Connect + optional note),
  `sendMessage` (messaging page → open thread, type, send), `syncInbox` (read threads).
- Extend `crawl-worker` → **action worker**: poll `li_action_queue`, dispatch by
  `action_type` to the right content script, report `result`.
- Friction detection + auto-pause reporting.

Content-script surfaces already exist (messaging/profile/connections) — this adds *write*
functions alongside the current *read* ones.

---

## 6. Pages (new / extended)

| Page | Purpose |
|---|---|
| **Accounts / Senders** | Connect LinkedIn accounts (guide to install/enable the extension), per-sender caps, working hours, warmup, status. |
| **Campaigns** | List + builder: audience → sequence (connect → delay → message → follow-up) → senders → limits → launch/pause. |
| **Leads / Lists** | Named audiences from connections, LinkedIn search capture, or CSV; per-lead status in a campaign. |
| **Unibox** | Unified LinkedIn inbox; reply from the platform (queues a `message` action); filters (unread/replied/campaign). |
| **Analytics** | Per-campaign/sender funnel: sent → accepted → replied → booked. |
| **Integrations** | Webhook / Zapier / CRM push on reply (some scaffolding exists). |

---

## 7. Phased plan

| Phase | Deliverable | Notes |
|---|---|---|
| **1 — Autonomous core** | `linkedin_senders` + `li_action_queue` + queue API (enqueue/claim/report) + extension action-worker for **connect + message** + a minimal Senders page. End-to-end: queue a connect/message → extension sends it → result recorded. | The keystone. Everything else builds on it. |
| **2 — Sequencer** | `li_campaign_steps` + the scheduler (advance steps on accept/no-reply, per-sender caps + working hours + warmup + jitter) + Campaign builder UI. | Turns single actions into real campaigns. |
| **3 — Unibox** | Inbox sync (`syncInbox`) + `li_conversations/messages` + Unibox page + reply-from-platform. | The retention surface. |
| **4 — Leads/Lists** | `li_lead_lists` + import (connections / LinkedIn-search capture / CSV) + audience targeting + warm-path targeting from the graph. | Feeds campaigns. |
| **5 — Analytics + integrations + safety hardening** | Funnels, reply webhooks/CRM push, warmup curves, friction auto-pause polish, optional server-side worker (opt-in). | Scale + polish. |

Each phase is its own PR, built and verified like the rest of the platform work.

---

## 8. Open questions (steer before Phase 1)

1. **Execution model** — confirm **extension-driven** (recommended; safest; reuses the
   bones), vs. also wanting a server-side always-on worker (Phase 5, higher risk).
2. **Auto-send vs. approval** — should the first version require per-message human approval
   (safer, HeyReach has both), or full-auto with rate caps from day one?
3. **Reuse vs. new tables** — reuse `outreach_*` with `channel='linkedin'`, or a parallel
   `li_*` set? (Leaning: new `li_*` for the queue/senders/steps; reuse `crm_entries` for people.)
