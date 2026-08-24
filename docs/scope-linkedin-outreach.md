# Scope — LinkedIn outreach automation (HeyReach-parity)

Build HeyReach-class LinkedIn outbound automation into Anker: connect LinkedIn "senders",
run multi-step campaigns (connect → message → follow-up) at safe, human-like rates, and
manage replies in a unified inbox — all driven through the existing Anker LinkedIn Chrome
extension.

Status: **scoping** — architecture + phased plan grounded in the existing bones.

### Decisions (locked 2026-08-24)

1. **Execution model — extension-driven.** The platform queues actions; the member's own
   browser + the Anker extension executes them on linkedin.com and reports back. Anker never
   stores `li_at` and never calls LinkedIn from a server. A server-side always-on worker is
   explicitly *out of scope* (revisit as an opt-in in Phase 5).
2. **Send policy — approval-gated first.** Every outbound action lands in a **review queue**
   (`pending_approval`) and a human approves it before it becomes claimable by the extension.
   Full-auto (auto-approve within per-sender caps) is a later per-campaign opt-in toggle, not
   the default. This is the safety default and it shapes Phase 1 (see §4a).
3. **Tables — new `li_*` set for the automation core** (`linkedin_senders`, `li_action_queue`,
   `li_campaign_steps`, `li_conversations/messages`, `li_lead_lists`); **reuse `crm_entries`**
   for people/leads. Rationale: the LinkedIn action lifecycle (approval → claim → execute →
   result, per-sender caps) is different enough from the email `outreach_*` model that
   overloading it with a `channel` column would muddy both.
4. **Orchestration — n8n is the brain** (§2a). Run **vanilla upstream n8n** (the `345668/n8n`
   fork is a pinned deploy source, not something we patch); Anker-specific logic lives in
   n8n *workflows*, not fork edits. Anker stays the system of record + approval gate; n8n
   owns timing/sequencing/integration fan-out and never touches LinkedIn.

---

## 1. What already exists (the bones)

| Bone | Where | Does |
|---|---|---|
| **Chrome extension** | `extensions/linkedin/` (Plasmo MV3 v0.4.0, on the Web Store) | Content scripts on LinkedIn messaging / profile / connections pages; syncs connections + mutuals; pre-drafted DMs; profile → CRM/deal capture. |
| **Queue-polling executor** | extension `crawl-worker` + `POST /api/extension/crawl-queue` | The extension already polls a server queue (`outreach_crawl_queue`), claims rows atomically (`FOR UPDATE SKIP LOCKED`), does work, reports back. **This is the executor pattern HeyReach needs.** |
| **Extension API** | `app/api/extension/*` (whoami, ingest, connections, mutuals, context, draft-by-name, crawl-queue) | Authenticated via `lib/extension/auth` (per-user extension tokens). |
| **Outreach data model** | `outreach_campaigns`, `_campaign_members`, `_messages`, `_replies`, `_events`, `_templates`, `sender_profiles`, `inbox_poll_state` | The email campaign engine — the schema/analytics scaffold to mirror for LinkedIn. |
| **Relationship graph** | connections + mutuals + warm-intro paths | Audience source for campaigns (target 2nd-degree via warm paths). |
| **n8n (orchestration)** | `github.com/345668/n8n` (clean upstream fork) | Workflow engine for scheduling/sequencing + a native integrations catalogue that mirrors HeyReach's. The "brain" — see §2a. |

**The gap vs. HeyReach:** outbound *sending* (connect requests, messages, follow-ups),
multi-step sequences, per-account rate limiting, and a unified inbox. The read/sync half
is done; the write/automate half is new.

---

## 2. Architecture — three layers (brain / record+gate / hands)

**The platform never touches LinkedIn directly and never stores a LinkedIn cookie.** It
queues *actions*; the user's own browser executes them via the extension and reports back.
The autonomous timing/sequencing/integration layer is **n8n** (see §2a).

```
   ┌─────────────────────── BRAIN: n8n (orchestration) ────────────────────────┐
   │ schedule (working hours) · advance sequences · branch (accepted/no-reply)  │
   │ per-sender caps · jitter · integration fan-out (HubSpot/Slack/webhook)     │
   └──────────────┬───────────────────────────────────────▲────────────────────┘
       enqueue action │ (HTTP → Anker API)     result / reply event │ (webhook ← Anker)
   ┌──────────────▼───────────────────────────────────────┴────────────────────┐
   │ RECORD + GATE: Anker  — li_* tables · approval Review Queue · auth · UI     │
   │   action born pending_approval ──human approve──▶ queued                    │
   └──────────────┬───────────────────────────────────────▲────────────────────┘
        claim (only status='queued') │            report result │
   ┌──────────────▼───────────────────────────────────────┴────────────────────┐
   │ HANDS: Anker LinkedIn extension — executes on linkedin.com, in-browser      │
   └────────────────────────────────────────────────────────────────────────────┘
```

- **Brain (n8n):** *when* to do what — schedules, delays, sequence branching, caps, jitter,
  and the whole integrations catalogue. Stateless-ish: reads due work from Anker, writes
  actions back. Never touches LinkedIn.
- **Record + gate (Anker):** the system of record. `li_*` tables, the approval Review Queue
  (§4a), auth, and all UI. **Anker owns campaign/sequence state — n8n executes timing, it
  does not own the sequence.** This keeps the builder UI authoritative and avoids config drift.
- **Hands (extension):** the only thing that touches linkedin.com, in the member's own
  browser, at human pace.

Why extension-driven for the *hands* (vs. server-side cookie automation):
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

## 2a. The n8n orchestration layer

n8n (`github.com/345668/n8n`, a clean upstream fork) is the **brain**. It's an especially
good fit here: its native integration catalogue *is* HeyReach's Integrations tab
(Webhook, Zapier, HubSpot, Smartlead, Instantly, Slack, …), and its schedule/delay/branch
nodes are exactly a campaign sequencer. Much of Phase 2 (timing) and Phase 5 (integrations)
come for free instead of being hand-built.

**What n8n owns**
- **Scheduler** — a workflow runs on a cron (e.g. every N minutes) *inside* each sender's
  working hours; it asks Anker for due steps and enqueues the resulting actions.
- **Sequencer** — connect → wait → message → wait → follow-up, with branches on
  `if_accepted` / `if_no_reply`, delays, and randomized jitter, expressed as workflow logic.
- **Cap/warmup enforcement** — checks per-sender remaining budget (from Anker) before
  enqueuing; backs off when spent.
- **Integration fan-out** — on a reply/accept webhook from Anker, push to HubSpot / Slack /
  CRM / arbitrary webhook. This is the whole §6 Integrations surface, native.
- **AI personalization (optional)** — n8n's LLM nodes can draft/spin message copy per lead
  before it enters the approval queue.

**What n8n does NOT own**
- It **never touches LinkedIn** — only the extension does.
- It is **not** the system of record — Anker's `li_*` tables and the builder UI are. n8n
  reads state and writes actions through the Anker API; it stores no campaign truth of its own.
- It **cannot bypass the approval gate** — actions it enqueues are born `pending_approval`
  exactly like any other (§4a); n8n's full-auto path just means a campaign is flagged to
  auto-approve within caps.

**Integration contract (Anker ↔ n8n)** — a small, versioned API surface:
- `GET  /api/orchestration/due-steps` — campaigns/members with a step due now (auth: n8n service token).
- `POST /api/orchestration/enqueue`   — create `li_action_queue` rows (born `pending_approval`).
- `GET  /api/orchestration/sender-budget` — per-sender remaining caps for today.
- Anker → n8n **webhooks** on `action.result`, `reply.received`, `invite.accepted` to drive
  branching + integration fan-out.

**Operational stance (important)**
- **Run vanilla n8n; do not patch the fork.** The fork is a pinned deploy source, kept in
  sync with upstream — Anker-specific logic lives in *workflows* (version-controlled via
  n8n's source-control export) and, if ever needed, a *community node* package, never in
  edits to n8n's 23k-commit codebase. Maintaining a divergent fork is a cost we don't take on.
- **Hosting** — n8n is a long-running service and **cannot run on Vercel serverless.** It
  needs a persistent host (Railway / Render / Fly / a container) + a Postgres (can reuse Neon)
  and, at scale, Redis for queue mode. This is net-new infra — the main cost of adding n8n.
- **Security** — the n8n instance is not publicly exposed except its webhook endpoints;
  the Anker orchestration API authenticates n8n via a dedicated service token (env-only,
  never DB-editable); n8n holds no `li_at` (it can't — only the extension does).

**Honest trade-off.** n8n buys a mature sequencer + the entire integrations catalogue and
observable, retryable, auditable runs — a large slice of Phases 2 and 5. The price is one
new always-on service to operate and secure. Given the integration catalogue alone mirrors
HeyReach's, the trade looks worth it — but the hosting decision is real and is called out in §8.

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
  `payload` (jsonb: message text, profile url),
  `status` (`pending_approval|queued|claimed|done|failed|skipped|rejected`),
  `scheduled_for`, `approved_by`, `approved_at`, `attempts`, `result` (jsonb), timestamps.
  New actions are born `pending_approval`; only an approval moves them to `queued` (the state
  the extension claims from). See §4a.
- **`li_campaign_steps`** — sequence: `campaign_id`, `order`, `type` (`connect|message|delay`),
  `template`, `delay_hours`, condition (`if_accepted|if_no_reply`).
- **`li_conversations` / `li_messages`** — Unibox: synced threads + messages, `direction`,
  `sender_id`, `read`, links to the campaign/member.
- **Leads** — reuse `crm_entries` + `outreach_campaign_members`; add `li_lead_lists` for
  named audiences (from connections, LinkedIn search capture, or CSV).

Where sensible, reuse the existing `outreach_*` tables (channel = `linkedin`) rather than
duplicate — decide per-table during Phase 1.

---

## 4a. Approval workflow (the send-policy default)

Because the launch default is **approval-gated**, the action lifecycle has a human gate the
extension can never bypass — only `queued` rows are ever handed out:

```
Campaign/step generates action ─▶ pending_approval ─┬─ approve ─▶ queued ─▶ claimed ─▶ done|failed
                                                    └─ reject  ─▶ rejected  (never sent)
```

- **The claim query only selects `status='queued'`.** A `pending_approval` row is invisible
  to the extension — approval is a hard gate enforced in SQL, not just UI.
- **Approval is server-side + authorization-checked** (the campaign owner / an org admin),
  stamped `approved_by` + `approved_at` for audit. Approvals happen only in the chat/app
  interface, never from anything the extension or a page scrapes.
- **Review Queue page** — pending actions grouped by campaign/sender, each showing the target
  person, the exact message text, and the action type; approve/reject singly or in bulk;
  edit the message before approving.
- **Full-auto (later opt-in)** — a per-campaign flag auto-stamps approval within per-sender
  caps, so rows go straight to `queued`. Same lifecycle, approval just automated. Off by
  default; turning it on is an explicit, logged choice.

This keeps the human firmly in the loop for v1 while the caps/warmup/friction machinery
(§3) is still being proven, and it's the piece to build in Phase 1 alongside the queue.

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
| **Review Queue** | Pending actions awaiting approval (§4a): target person, message text, action type; approve/reject/edit singly or in bulk. |
| **Campaigns** | List + builder: audience → sequence (connect → delay → message → follow-up) → senders → limits → launch/pause. |
| **Leads / Lists** | Named audiences from connections, LinkedIn search capture, or CSV; per-lead status in a campaign. |
| **Unibox** | Unified LinkedIn inbox; reply from the platform (queues a `message` action); filters (unread/replied/campaign). |
| **Analytics** | Per-campaign/sender funnel: sent → accepted → replied → booked. |
| **Integrations** | Webhook / Zapier / CRM push on reply (some scaffolding exists). |

---

## 7. Phased plan

| Phase | Deliverable | Notes |
|---|---|---|
| **1 — Autonomous core** | `linkedin_senders` + `li_action_queue` (with the `pending_approval` gate) + queue API (enqueue → approve → claim → report) + **Review Queue page** + extension action-worker for **connect + message** + a minimal Senders page. End-to-end: queue a connect/message → **human approves** → extension sends it → result recorded. | The keystone. Everything else builds on it. Approval gate (§4a) is in from day one. |
| **1.5 — n8n bring-up** | Stand up the n8n service (host + Postgres) + the Anker orchestration API (`due-steps` / `enqueue` / `sender-budget` + result/reply webhooks) + service-token auth. A trivial "hello" workflow enqueues a `pending_approval` action end-to-end. | Establishes the brain↔record contract before the sequencer needs it. Small, infra-focused. |
| **2 — Sequencer (on n8n)** | `li_campaign_steps` + Campaign builder UI in Anker; the **sequencer logic runs as n8n workflows** (advance on accept/no-reply, working hours, caps, warmup, jitter) against the §2a API. | n8n does the timing; Anker stays system of record. Much less bespoke scheduler code. |
| **3 — Unibox** | Inbox sync (`syncInbox`) + `li_conversations/messages` + Unibox page + reply-from-platform. | The retention surface. Reply events also feed n8n integration fan-out. |
| **4 — Leads/Lists** | `li_lead_lists` + import (connections / LinkedIn-search capture / CSV) + audience targeting + warm-path targeting from the graph. | Feeds campaigns. |
| **5 — Analytics + integrations + safety hardening** | Funnels + friction auto-pause polish + warmup curves; **integrations (HubSpot/Slack/webhook/Zapier) delivered as n8n workflows** off Anker's reply/accept webhooks; optional server-side executor (opt-in). | n8n subsumes most of the integrations catalogue — little custom integration code. |

Each phase is its own PR, built and verified like the rest of the platform work. (Phase 1
stays pure-Anker + extension and does **not** depend on n8n — the autonomous core can be
demonstrated with manual enqueue before the brain is wired in at 1.5.)

---

## 8. Decisions & remaining unknowns

The big directional questions are resolved — see **Decisions** at the top (extension-driven,
approval-gated first, new `li_*` tables, n8n as the brain). The one decision still open is
infra:

- **n8n hosting target** *(needed before Phase 1.5, not before Phase 1)* — where the n8n
  service runs (Railway / Render / Fly / self-managed container), and whether it reuses the
  Neon Postgres or gets its own. Determines cost + the deploy runbook. Phase 1 is unblocked
  either way (it's pure Anker + extension).

Smaller things to settle as Phase 1 lands, none blocking:

- **Sender identity** — how a `linkedin_sender` row is keyed to a real account. Leaning on
  the extension's `whoami` (LinkedIn member urn/vanity) as the stable id, captured on connect.
- **Multi-sender / workspaces** — HeyReach's agency model runs many senders per workspace.
  v1 supports N senders per user; workspace-level sharing tracks the platform's existing org
  model and lands with Phase 2.
- **Connect-note limits** — LinkedIn caps invite notes (and free accounts throttle them);
  the sender caps in §3 should encode per-account note availability, refined against real
  behaviour once the executor is live.
- **Default caps** — starting numbers in §3 are conservative placeholders; tune from
  observed friction, per sender, during Phase 1/2.
