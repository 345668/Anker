# 56. Spec: alerts, incidents and runbooks (doc 38, S-4)

Status: **spec. Nothing is built.** Implements doc 38 section 3.5 and build step S-4, sized for the team that exists (the founder, with Claude in session). Builds on what is already there: `cron_runs` and `trackCron` (S-2), `dependency_checks` and `runDependencyChecks` (`lib/ops/dependencies.ts`), `ai_calls`, SAIL's System health page and audit log.

## 1. The problem, measured on production (2026-10-16)
Doc 38's test is: *an incident is noticed by SAIL and handled from SAIL, instead of being found by a person running a test in a browser.* The monitoring half exists; nothing tells anyone.
- **The nightly dependency check has failed every night for 13 days** (13 of 13 rows have `ok = false`, from 2026-10-04) and nobody was told. Today's findings, each real:
  - **Stripe billing: down.** A Stripe key is set but `STRIPE_WEBHOOK_SECRET` is not, so no subscription can ever sync.
  - **Reply detection: down.** No mailbox is connected: *0 replies recorded from 286 sent.* Every reply to a founder's outreach is invisible to the product.
  - **Outreach footer address: degraded.** `OUTREACH_FOOTER_ADDRESS` is unset, so outreach carries an unsubscribe link but no sender address (a legal requirement in several countries, and the footer of doc 54 builds on it).
  - **Scheduled jobs: degraded.** `investor-activity` has been "running" for 150 minutes, probably killed by the platform.
  - **Erasure registry: degraded** (a view not classified; fixed in the last deploy, which shows the check works).
- **Cron health is recorded and unread:** 17,359 runs in 7 days, 261 not ok (1.5%), visible only if someone opens the System health page.
- **No rules, no delivery, no incident record, no runbook** exist (`alert_events`, `alert_rules` and incident tables are absent). A fault is found when a customer or the founder happens to look.
So the platform has been red for almost two weeks without a person knowing. That is the whole case for this slice: not a new dashboard, but a way for the facts that are already collected to reach a person, once, with what to do about it.

## 2. Principles
1. **Few rules, high precision.** Every rule has a named action. A rule that fires and needs no action is removed or demoted to a daily digest. Target precision above 80% (doc 38 section 7).
2. **One incident per problem, not one message per check.** A problem opens an incident once, reminds at a set interval while unacknowledged, and resolves itself when the evidence clears.
3. **Quiet by default at night.** Urgent faults reach the founder at any hour; everything else waits for a morning digest.
4. **Every alert says what to do.** It carries its runbook link: what it means, how to check, how to fix, and what to do first.
5. **An alert holds no tenant private records or personal data.** It names a job, a dependency, a rate, a count, a workspace id at most.
6. **Rules are code with data-driven settings.** Rule logic is typed and tested in the repository; thresholds, severity, enabled and muted-until are rows editable in SAIL, audited. (Doc 38 said "rules as data"; with one operator, logic in code is safer and thresholds in data is enough.)
7. **The watcher is watched.** A silent evaluator is the worst failure (section 8).

## 3. Rules (the starter set, every one backed by data that exists today)
| Key | Fires when | Severity | Subject |
|---|---|---|---|
| `cron_stale` | the last successful run of a scheduled job is older than twice its interval (`CRON_MAX_AGE_MIN`) | 2 (1 for sending and campaign jobs) | job name |
| `cron_stuck` | a run has been "running" for more than its function limit plus 5 minutes | 2 | job name |
| `cron_failing` | 3 of a job's last 5 runs are not ok | 2 | job name |
| `dependency_down` | the latest dependency check has a check with status `down` | 2 | check name |
| `dependency_degraded` | the same with `degraded` for 3 days in a row | 3 (digest only) | check name |
| `ai_failure_rate` | more than 5% of at least 10 AI calls failed in 15 minutes, or any call failed with a quota or key error | 2 | provider |
| `privacy_request_due` | a privacy request is due within 7 days or overdue (doc 54) | 2 | request id |
| `alerter_stale` | the evaluator has not run for 30 minutes (section 8) | 1 | evaluator |
Severity 1 reaches the founder immediately by email and webhook at any hour. Severity 2 reaches them immediately in the day and in the morning digest at night. Severity 3 appears only in the daily digest and on the board.
**Deferred** (data not yet reliable or needs a new source): deploy failure (needs the CI status), bounce and complaint rate and queue depth (the outreach counters need a check first), Stripe webhook failures (once the secret is set and events exist), repeated failed staff logins (SAIL-side), spend ceilings (needs the platform credit ledger, doc 37 G11). Each is added by writing one rule and its runbook.

## 4. Data model (Anker, additive)
- `alert_rule_settings`: `rule_key` (primary key), `enabled`, `severity_override`, `threshold` (jsonb, e.g. `{"rate":0.05,"minCalls":10,"windowMin":15}`), `muted_until`, `muted_reason`, `updated_by`, `updated_at`.
- `alert_incidents`: `id`, `rule_key`, `subject`, `severity`, `status` (`open`, `acknowledged`, `resolved`), `opened_at`, `last_seen_at`, `resolved_at`, `resolved_by` (`auto` or a person), `acknowledged_by`, `evidence` (jsonb, facts only), `cause`, `fix`, `linked` (jsonb: run id, deploy, request id), `notified_at`, `reminded_at`, `times_seen`. Unique open incident per (`rule_key`, `subject`).
- `alert_events`: `incident_id`, `at`, `kind` (`opened`, `seen`, `notified`, `reminded`, `acknowledged`, `note`, `resolved`, `reopened`, `muted`), `channel`, `ok`, `detail`. The timeline, and the proof that a message was sent.
- `alert_heartbeat`: one row, `last_run_at`, `last_ok_at`, `rules_evaluated`, `error`.
- Runbooks live in the repository as markdown (`docs/runbooks/<rule_key>.md`) and are shown in SAIL by key, so they are reviewed like code.

## 5. The evaluator
A cron every 5 minutes (`alerts-evaluate`), authenticated like the others and tracked by `trackCron`. For each enabled, unmuted rule it returns the set of subjects currently in trouble with their evidence. It then reconciles with open incidents:
- **New subject:** after **two consecutive** evaluations (a flap guard; severity 1 opens on the first), open an incident, write `opened`, and notify.
- **Subject still in trouble:** update `last_seen_at` and `times_seen`; remind once every 4 hours if unacknowledged (every 24 hours if acknowledged).
- **Subject cleared:** after **three consecutive** clear evaluations, resolve automatically (`resolved_by = auto`) and send one short "resolved" note.
- **A resolved incident that recurs within 24 hours** reopens the same incident (`reopened`) rather than starting a new one, so a flapping fault is one story.
A rule that throws is recorded in the heartbeat and does not stop the others; two failures in a row raise `alerter_stale`-class severity 1 for that rule.

## 6. Delivery
- **Email** through the existing sender to the alert recipients (default `vc@an-ker.de`, the address that exists today), one message per incident event, subject `[Anker SEV2] cron_stale: investor-activity`, body: what is wrong, the evidence, since when, and the runbook text's first section with a link to the SAIL incident.
- **Webhook** to one URL (a Slack-compatible incoming webhook) read from the platform key store, never from code; sent with the same text. A failed delivery is retried on the next evaluation and recorded.
- **Quiet hours** 22:00 to 07:00 Europe/Berlin: severity 2 and 3 are held and sent in one morning digest; severity 1 is never held. The digest also lists every open incident, so it doubles as the morning check.
- **Idempotent delivery**: an event is marked notified in the same step it is sent from; a retry never duplicates a message.

## 7. SAIL surfaces
- **Alerts** (new, first in System): the open incidents by severity with age and times seen; acknowledge, add a note, resolve with cause and fix; history with filters; the heartbeat ("last evaluated 2 minutes ago") in the header.
- **Incident page:** the timeline from `alert_events`, the evidence, the runbook, linked run or deploy, and cause and fix fields. A short blameless review prompt for severity 1.
- **Rules:** each rule's description, current setting, last fired, precision over the last 30 days (resolved with an action versus resolved untouched), and the controls to change threshold, change severity, or mute with a reason and an end date (a mute cannot be open-ended). Every change is audited with a reason.
- The System health page links each red tile to its incident.

## 8. Watching the watcher
The evaluator runs in the same platform as everything else, so a platform-wide outage silences it too. Three layers:
1. `alerter_stale` as a severity 1 rule, evaluated by the **dependency check** (a separate cron) and shown red on the SAIL board.
2. SAIL (a separate deployment) shows the heartbeat age prominently and turns the whole page red when it is older than 30 minutes.
3. **An external uptime monitor** (a free service pinging the public status route and SAIL's health route every 5 minutes, emailing the founder) is the only layer independent of our own infrastructure. It is a decision for the founder (section 11); the spec does not depend on it, but without it a total outage is noticed by customers first.

## 9. Tests
Each rule fires, delivers, links its runbook and resolves on a fixture (doc 38's acceptance), including the cases found today: a dependency `down` opens an incident naming the check; a run "running" for 150 minutes opens `cron_stuck`; a job whose last ok run is old opens `cron_stale`. Flap guard (one bad evaluation opens nothing, except severity 1); auto-resolve after three clear evaluations; reopen within 24 hours; reminder timing; quiet hours hold severity 2 and 3 and never hold 1; digest content; duplicate delivery impossible; a muted rule opens nothing and a mute without an end date is refused; a throwing rule does not stop the others and is itself reported; the evidence of every rule contains no personal data; SAIL actions need a reason, are audited and update the incident. A time-budget test: evaluating all rules against a production-sized fixture takes under 5 seconds.

## 10. Slices
- **A1, the core:** tables, evaluator, rules `cron_stale`, `cron_stuck`, `cron_failing`, `dependency_down`, `alerter_stale`, email delivery, SAIL Alerts list with acknowledge and resolve, the heartbeat. After A1 the founder is told about the five problems in section 1 within the hour.
- **A2, the rest of the set:** `ai_failure_rate`, `privacy_request_due`, `dependency_degraded`, the webhook, quiet hours and the digest, the rules page with thresholds, muting and precision, the runbooks for every rule.
- **A3, learning:** incident reviews for severity 1, the 30-day precision and time-to-alert metrics (doc 38 section 7), and the next rules from what the first month shows.
Each slice is tested and deployed alone.

## 11. Decisions for the founder (defaults chosen; change any)
1. **Recipients:** email to `vc@an-ker.de` now. **Add a second channel:** give one chat webhook URL (Slack or compatible) and it is wired in A2.
2. **Quiet hours** 22:00 to 07:00 Europe/Berlin; severity 1 always immediate.
3. **Severity of each starter rule** as in section 3 (sending and campaign jobs are severity 1).
4. **Reminder interval** 4 hours unacknowledged, 24 hours acknowledged.
5. **External uptime monitor:** set one up on the status route and SAIL (about five minutes of your time, no cost), recommended.
6. **Act on today's five findings** (section 1) regardless of this spec: they are configuration, not code. Set `STRIPE_WEBHOOK_SECRET`, set `OUTREACH_FOOTER_ADDRESS` to the legal entity and address, connect the reply mailbox, and let me look at `investor-activity`.

## 12. Not in scope
Paging by phone or an on-call rotation (one person); a tenant-facing status page (doc 38 D5); a vendor APM or log service (doc 38 D1, D8: a log drain is the minimum, chosen separately); automatic remediation (SAIL alerts and a person acts); alerts about a single customer's own data.

## 13. Build status
**A1, the core (2026-10-16), built, tested and live** (migration `2026-10-16g-alerts`).
- **Tables** `alert_rule_settings`, `alert_incidents` (one live incident per problem by a partial unique index), `alert_events` (the timeline and the proof of each message), `alert_heartbeat`. Runbooks are code (`lib/ops/alerts/runbooks.ts`); a test fails if a rule has none, and the text is stored on the incident when it opens so SAIL shows it.
- **Rules** (`lib/ops/alerts/rules.ts`, pure): `cron_stale` (not the evaluator itself), `cron_stuck` (running over 15 minutes), `cron_failing` (3 of the last 5 including the latest), `dependency_down` (a live dependency check every evaluation, not the nightly row, so a fix clears in minutes), and `alerter_stale`. Jobs that send (`outreach-send`, `outreach-scheduler`, `campaign-send`) are severity 1.
- **Engine** (`engine.ts`): opens after two consecutive sightings (severity 1 at once); a problem seen once and gone leaves nothing; reminds every 4 hours (24 acknowledged); resolves itself after three clear evaluations; reopens the same incident within 24 hours; a failed delivery is recorded and retried; a muted or disabled rule opens nothing; a severity override applies.
- **Jobs:** `alerts-evaluate` every 5 minutes and `alerts-watchdog` every 15 (severity 1 if the evaluator has had no successful run for 30 minutes). Email goes to `ALERT_EMAIL_TO`, default `vc@an-ker.de`; set `SAIL_URL` to put a link to the incident in the message.
- **SAIL, System, Alerts:** the heartbeat (red when stale), open incidents with their runbook and timeline, acknowledge, note, and resolve (cause and fix required). Audited without evidence.
- **First production run (13:00 UTC):** three incidents opened and three emails were delivered: `cron_stuck` on `investor-activity`, `dependency_down` on Stripe billing and on Reply detection. A fourth sighting (the evaluator reporting itself on its very first run) was removed by the flap guard, which showed the guard working; that rule now skips the evaluator.
- **Not in A1** (A2): quiet hours and the morning digest, the webhook, `ai_failure_rate`, `privacy_request_due`, `dependency_degraded`, the rules page (thresholds, mutes, precision). Until then every severity 2 alert is sent immediately, at any hour.
- 41 tests in Anker (suite 1,757) and 9 in SAIL (176).

**Telegram channel (2026-10-16), built and tested; switched on when the founder sets two variables.** In place of the chat webhook of section 6, a Telegram bot posts every alert event to one chat. Free, instant, no business verification (WhatsApp was considered and needs a verified Meta business account, approved message templates and a per-message fee; it can be added as another channel the same way).
- `lib/ops/alerts/telegram.ts`; configuration `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in Vercel (both required; otherwise the channel is off and email works as before). The token never appears in an error, a log line or a timeline event (tested).
- The engine now delivers on a list of channels: one timeline entry per channel; an event counts as delivered if at least one channel got it, a failing channel never stops the other, and only a total failure is retried. The Telegram text is the subject, the summary, the first fix step and the incident link.
- `POST admin/alerts-test` and a SAIL "Send a test notification" button show each channel's result before a real alert needs it. `scripts/telegram-find-chat.mjs` prints the chat id after you message the bot.
- Setup, about three minutes: in Telegram message @BotFather, send `/newbot`, copy the token; open your bot and press Start; run `TELEGRAM_BOT_TOKEN=<token> node scripts/telegram-find-chat.mjs` for the chat id; set both in Vercel and redeploy; press the test button in SAIL, Alerts.

**A2 (2026-10-16), built, tested and live** (migration `2026-10-16h-alerts-a2`).
- **Quiet hours and the digest.** Severity 1 always goes out at once. Severity 2 is held from 22:00 to 07:00 Europe/Berlin (summer and winter time handled; the window is a setting) and sent in one **morning digest**: every open incident, with age, acknowledged or not, and which were held overnight. Severity 3 is never sent on its own, only in the digest. The digest goes once per Berlin day, after quiet hours, on every channel, and only if something is open; held incidents are marked notified by it. Reminders and resolved notices for severity 2 are skipped overnight.
- **Rules added:** `ai_failure_rate` (a provider's failed share of calls in the window above the threshold; **default 20%, not the 5% of section 3**, because a failed first lane followed by a successful second lane counts as a failed call and 5% would not be precise; editable), `privacy_request_due` (within 7 days or overdue; carries only the kind and the days left), `dependency_degraded` (three nightly checks in a row; severity 3). Eight rules in all, each with a runbook; a test fails if one has none.
- **SAIL, Alerts, Rules:** each rule on or off, severity, threshold (the AI rate, minimum calls and window), a mute of 1 to 30 days with a reason that survives other edits and lifts early, the quiet hours, and **precision over 30 days** (resolved incidents that a person acknowledged, noted or resolved by hand, against those that cleared untouched). Every change is audited with before, after and reason.
- **Instead of the chat webhook** of section 6, delivery is email and Telegram (doc 56 Telegram section), with every configured chat as its own channel.
- **First production evaluation after deploy:** seven rules evaluated, the morning digest sent once listing the three open incidents, and three severity 3 candidates (footer address, scheduled jobs, erasure registry) waiting for their second sighting; they will go to the digest only.
- 81 tests in Anker (suite 1,801) and 9 more in SAIL (185).
