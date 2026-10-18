# 57. Spec: Anker AI and the Anker Assistant on Telegram (a tenant-bound channel with actions, voice and files)

Status: **spec. Nothing is built.** Raised on 2026-10-16, after the alert bot (doc 56) proved that Telegram delivery works. This is a different thing from that bot: the alert bot tells the **operator** about the **platform**; this channel lets a **customer** talk to **their own workspace** from a phone. Builds on docs 27 and 28 (the assistant), 33 and 36 (budget, attachments, audio), 41 (entitlements), 43 and 44 (the action layer and the agent runtime), 46 (send authorization), 54 (privacy and the workspace data policy) and the MCP token model, which already lets an outside client act as one user in one workspace.

## 1. What this is, and the idea in one paragraph
A person links their Telegram account to their Anker user and one workspace. From then on they can send the bot text, a voice note, a PDF, a spreadsheet or a photo, and ask for things in plain language: "log my call with Katja, she wants the deck by Friday", "move the four stale contacts to Contacted and add follow-ups", "summarise this term sheet and add the investor to my pipeline", "who replied today". The bot is **not a new assistant**. It is another front door to the one that exists: same principal, same tools, same budget, same action layer. Reads are answered in the chat. Writes become **proposals** that the person approves with a button, and what is written lands in the workspace's own tables, marked as coming from Telegram. Anything that reaches a third party (an email, a LinkedIn message) is never sent from the chat: it is drafted and queued for approval in the app, where the send-authorization rules of doc 46 apply.

## 2. What exists today that this reuses (so it is a channel, not a project)
| Need | Already there |
|---|---|
| Act as one user in one workspace from outside the browser | `resolveAiPrincipal(userId, { orgId, readonly, tools })` and the MCP token flow (`app/api/mcp`): a token bound to a workspace, a read-only switch, a tool allow-list |
| The agent loop, tools, budget, deadline | `withAiContext`, `runAssistant`, run budget and 240 s deadline (docs 28, 33) |
| Writes with review, undo and audit | `action_proposals`, risk classes R0 to R3, per-workspace autonomy, the untrusted-input cap, the approval inbox (doc 43) |
| Files into text | the attachment reader (PDF, DOCX, XLSX, images, text), Blob ceiling 25 MB, the upload sweep (doc 36) |
| Voice into text | `transcribeAudio` (Qwen3-ASR-Flash; OGG accepted; 5 minutes or 7 MB per clip) |
| Conversation memory and history | `anker_chats` and `anker_chat_events`, already workspace-keyed and in the erasure registry |
| Spend ceilings, feature switches | entitlements (doc 41): limits and feature keys per workspace |
| Where data may be sent | the workspace AI data policy and the sub-processor register (doc 54) |
| Operator-side Telegram delivery | `lib/ops/alerts/telegram.ts` (a sender; its token is a different bot's) |

## 3. Decisions the design rests on
1. **One product bot for all customers, linked per user, not a bot per tenant.** A per-tenant bot means every customer creates a bot and hands us a token. One bot, with each Telegram account linked to a user and a workspace, is simpler for customers and for us. The tenant boundary is the **link**, not the bot.
2. **A separate bot from the operator alert bot.** The ops bot's token and chat belong to the platform's operators. The product bot gets its own token and name, so revoking one never touches the other.
3. **Private chats only.** The bot refuses to act in groups and channels (it answers once that it works only in a private chat). A shared chat would let a second person read or command a workspace.
4. **The sender is trusted; the content is not.** What the verified person types or says is their instruction. What is inside a PDF, a forwarded message or a photo is **data a stranger wrote** and is handled under the untrusted cap of doc 43: it can inform a proposal but never auto-commit one.
5. **Nothing irreversible happens in a chat.** R2 (anything sent to a third party) and R3 are never completed from Telegram. The chat creates the draft and the proposal and sends the person to the app, once.
6. **Telegram is a processor, and the workspace decides.** Messages to a bot pass through Telegram's servers and are not end-to-end encrypted. The channel is off for a workspace whose AI data policy is "EU only" or "no external provider", it carries a plain notice at link time, and sensitive classes (section 8) go out as a summary and a link, not as content.

## 4. Linking: how a Telegram account becomes a person in a workspace
- **Start in the app** (Settings, Connected channels, "Connect Telegram"): the person picks the workspace (if they have several) and gets a **single-use code**, valid 10 minutes, shown as a button `https://t.me/<bot>?start=<code>` and a QR code. The code is random, stored hashed, and bound to the user and workspace.
- **Open the link in Telegram and press Start.** The webhook receives `/start <code>`, checks the code, expiry and that it is unused, and records the link: Telegram user id, chat id, user, workspace. The bot answers with the workspace name and what it can do, and the app page shows the new device. A **second confirmation inside the app** (the page shows "Telegram account Rick wants to connect, approve?") closes the gap of a code shared by mistake.
- **Mode:** read and write for owners, admins and members, **read only for LPs and anyone the owner restricts**. The mode is the principal's `readonly` flag, so the tool layer enforces it, not the bot.
- **Unlink:** from the app (Revoke) or by `/unlink` in the chat; either removes the link at once and any queued work for it is dropped. A person can have several linked devices; an owner can see and revoke every link in the workspace.
- **Inactivity:** a link idle for 90 days is suspended and must be re-confirmed in the app.
- **Who is "me":** every update carries Telegram's own user id, set by Telegram, never by the sender. The bot acts only for a Telegram user id that has an active link. An unknown id receives one fixed message with the link instructions and nothing else, and the attempt is counted (not stored with content).

## 5. Architecture
```
Telegram  ──webhook──►  POST /api/telegram/webhook  (secret-token header checked first)
                               │ verify, de-duplicate by update_id, store, answer 200 at once
                               ▼
                       telegram_updates (queued)  ──►  worker: link → principal → withAiContext → runAssistant
                               ▲                                     │ tools, proposals, artifacts
              cron every minute (stuck or missed)                    ▼
                                                    reply to Telegram + rows in the workspace tables
```
- **Webhook security.** The webhook is registered with Telegram's `secret_token`; every request must carry it in `X-Telegram-Bot-Api-Secret-Token` (constant-time compare) or it is dropped with no work done. The route holds no business logic.
- **Fast acknowledgement, work behind it.** Telegram retries an update that is not acknowledged within about a minute, and an assistant run can take up to 240 s. The route therefore stores the update (unique on `update_id`, so a retry is harmless), answers 200 immediately, and starts the worker for it with the platform's after-response hook. A **cron every minute** picks up any update left queued or stuck, so a killed function loses nothing.
- **Order and concurrency.** One update per chat is processed at a time, in order (a lock per chat), so two quick messages are not answered out of order or run twice. A long run shows Telegram's "typing…" and, past 20 seconds, one short "working on it" message that is edited into the answer.
- **The run.** The worker resolves the principal from the link (`resolveAiPrincipal(userId, { orgId, readonly })`), applies the workspace's data policy and entitlements, and runs the assistant exactly as the web chat does, in a chat record `source = 'telegram'` so the conversation also appears in Anker AI in the app.
- **Replies** are sent with Telegram's HTML parse mode with every value escaped (never raw model output as markup), split at 4,096 characters at sentence breaks, with a link to the full answer in the app when it is long.
- **Failure in plain words.** A refusal, a budget stop, an AI outage or a data-policy block each produce one human sentence and, where useful, a button ("Open in Anker"). Raw errors never reach the chat.

## 6. Inputs
**Text.** Treated as the person's instruction. Slash commands are shortcuts: `/today` (what is due, who replied, what is waiting for approval), `/inbox` (pending proposals), `/workspace` (switch, if linked to more than one), `/mode`, `/unlink`, `/forget`, `/help`.
**Voice notes** (Telegram's OGG/Opus). The bot downloads the file, transcribes it with the existing transcription (5 minutes or 7 MB; longer is refused with advice to split), **shows the transcript back** in one line ("Heard: …"), and runs it. For anything that would create a proposal the bot first asks for a one-tap **Confirm** when the transcript's confidence is low or it contains names, amounts or dates, because speech recognition is wrong exactly there. Audio is deleted as soon as it is transcribed; only the transcript is kept, with the chat.
**Documents** (PDF, DOCX, XLSX, CSV, TXT, and photos as images). The bot downloads the file through Telegram's `getFile` (the bot API's limit is **20 MB**; larger files are refused with a pointer to the web upload, which allows 25 MB), stores it in the workspace's private Blob path, reads it with the existing attachment reader, and answers about it. The text of the file is **untrusted** data. By default a file is **only context for this conversation** and the Blob is deleted after the run (the upload sweep already enforces a maximum age). To keep it, the bot asks with buttons: *Save to the data room / Attach to a CRM contact / Add the investor to my pipeline / Just answer*. Saving creates a proposal like any other write.
**Photos of business cards or whiteboards** use the vision path; the contacts found come back as a proposal ("Add 3 contacts?"), not as rows.
**Forwarded messages and pasted emails** are labelled untrusted, so "forward me an email and say add this person" works but cannot auto-commit.
**Not accepted:** executables, archives, anything over the limits, and contact or location sharing.

## 7. Outputs
**To the person, in Telegram:** answers; **inline buttons** on every proposal (Approve, Reject, Open); generated files (a summary as DOCX, a list as XLSX) sent as documents, with the same artifact record the web chat creates; the proposal diff in a few lines ("Move Katja Weber: Lead → Contacted").
**To the workspace, the system of record:**
- Reads change nothing.
- Writes go through the action layer as proposals with `source = telegram`, the chat id and the message id in the evidence, so the inbox, the audit trail and undo work as for any proposal. Approving in Telegram is equal to approving in the inbox, and is available for R0 and R1 only; the same rules apply (a member who can write, the untrusted cap, idempotency).
- Notes, tasks, call logs and saved documents carry `created_via = 'telegram'` and the person's user id, so a team can see what came from where.
- The conversation itself is a chat in Anker AI with the transcript of voice notes and the names (not the bytes) of files.
**Proactive messages from Anker to the person** (opt-in, per type, with quiet hours): proposals waiting for approval, a reply to their outreach, a deadline today, the **daily brief** (from the agent runtime, doc 44), and an agent's finished work. These are product notifications to the customer, not operator alerts; they use the same opt-in and rate limits and never contain more than a one-line summary and a link.

## 8. Privacy and security
| Risk | Control |
|---|---|
| Someone else messages the bot | Only a Telegram user id with an active link is served; everyone else gets one fixed message. Link codes are single-use, ten minutes, hashed, and need an in-app confirmation. |
| A stolen or shared phone | The person or an owner revokes the link in the app at once; links idle for 90 days suspend; R2 and R3 are impossible from the chat; approvals above R0 can require a **re-confirm** (a short code sent in the app or an answer to a challenge) per workspace setting. |
| A forged webhook call | The secret-token header is checked before anything is parsed; wrong or missing means drop. The webhook URL is not guessable and carries no data. |
| Prompt injection through a PDF, a forwarded email or a photo | Content is untrusted: no auto-commit, no tool whose class is above R0, the model is told the source is untrusted, and links in it are never fetched without being shown to the person. |
| Group chats | Refused. The bot leaves a group it is added to. |
| Data leaving to Telegram | Telegram is a sub-processor in the register (region and agreement shown as unverified until checked). A workspace whose data policy is EU only or no external provider cannot link. **Sensitive classes go out as a summary and a link**: LP documents, KYC cases, data-room documents, signed agreements and anything the owner marks. The linking screen says in one sentence that messages pass through Telegram. |
| Content retained by Telegram | The bot deletes its own long answers on request (`/forget` removes the bot's messages from the last 48 hours, the limit Telegram allows, and the chat record in Anker). Nothing sensitive is repeated in notifications. |
| Directory personal data | Answers about people in the shared directory obey the use gate and restrictions of doc 54 exactly as in the web chat; an erased or objecting person is never returned. |
| Cost abuse | Per-workspace limits (messages, audio minutes, file megabytes per day) are entitlement keys; the AI spend ceiling of doc 41 applies; the voice and file steps are priced in the run budget; one chat is limited to a few messages a minute; Telegram's own flood limits are respected with back-off. |
| Cross-tenant leakage | The principal carries one workspace; every tool already filters by it. A person linked to two workspaces switches explicitly (`/workspace`) and the bot names the active one in the first line of every answer for a write. |

## 9. Data model (Anker, additive; all keyed to the workspace so erasure and export cover them)
- `telegram_links`: `id`, `user_id`, `org_id`, `telegram_user_id`, `chat_id`, `telegram_username` (display only), `mode` (`write`, `read`), `status` (`pending`, `active`, `suspended`, `revoked`), `linked_at`, `last_seen_at`, `confirmed_in_app_at`, `revoked_at`, `revoked_by`.
- `telegram_link_codes`: `code_hash`, `user_id`, `org_id`, `expires_at`, `used_at`.
- `telegram_updates`: `update_id` (unique), `link_id`, `received_at`, `status` (`queued`, `running`, `done`, `failed`, `dropped`), `kind` (`text`, `voice`, `document`, `photo`, `callback`), `attempts`, `error` (plain words, no content), `finished_at`. **No message text is stored here**; the content is stored once, in the workspace's chat.
- `telegram_prefs`: `link_id`, notification opt-ins (`approvals`, `replies`, `deadlines`, `daily_brief`), `quiet_start`, `quiet_end`, `timezone`, `language`.
- `anker_chats` gains `source` (`web`, `telegram`, `mcp`); proposals, notes and tasks gain `created_via` where they do not have it.
- Entitlement keys: feature `channel_telegram`; limits `telegram_messages_per_day`, `telegram_audio_minutes_per_day`, `telegram_file_mb_per_day`.
- A tenant-registry rule for each table (the coverage test of doc 41 fails until each is classified) and a sub-processor register row for Telegram.

## 10. The product screens
- **In the app, Settings, Connected channels:** link, devices (name, last used, mode), revoke, per-type notification switches and quiet hours, the plain-language notice, and the list of what the bot can do.
- **For owners:** a workspace switch to allow or forbid the channel, a "read only for everyone" switch, a list of every link with revoke, and the sensitive-class settings.
- **In SAIL (operator):** the channel's health (queue depth, failures by kind, webhook last seen), per-workspace usage, and the ability to disable the channel for a workspace. SAIL never sees message content.
- **An alert rule** (doc 56) when the webhook has been silent for an hour during working hours, or the queue is backing up.

## 11. Slices
- **T1, link and ask (read only).** The bot and its webhook, the secret-token check, linking with the in-app confirmation, `/unlink`, `/help`, text questions answered by the assistant in a read-only principal, the chat record in Anker AI, entitlements and the data-policy block, SAIL health and the alert rule. *Acceptance:* an unlinked account gets only the fixed message; a linked account answers a question about its own pipeline and nothing from another workspace; a forged webhook does nothing; a retried update runs once.
- **T2, actions and notifications.** Write mode, proposals with inline Approve and Reject, `/inbox` and `/today`, the proactive notifications with quiet hours. *Acceptance:* "move X to Contacted" becomes a proposal, approving in Telegram applies it once and it appears in the audit trail and the inbox; an untrusted-source proposal is never auto-committed; nothing is sent to a third party from the chat.
- **T3, voice and files.** Voice transcription with the echo and confirm step, documents and photos through the attachment reader, the "save to" buttons as proposals, Blob deletion after the run. *Acceptance:* a 60-second voice note creates the intended proposal after one confirm; a 15 MB PDF is summarised and then deleted; a 25 MB file is refused with the web pointer; instructions hidden in a PDF do nothing.
- **T4, outputs and agents.** Generated files back to the chat, the daily brief, agent results, `/forget`, the sensitive-class summaries.
- **T5, later.** Several workspaces per person, voice replies, a per-tenant bot option for large customers, and further channels (WhatsApp, with its business verification and templates) on the same channel layer.
Each slice is tested and deployed alone, behind a platform flag (`telegram_channel`) and the workspace entitlement, off by default.

## 12. Tests
Webhook: wrong or missing secret does nothing; duplicate `update_id` runs once; out-of-order and parallel messages in one chat run in order; a killed worker's update is picked up by the cron. Linking: code single-use, expiry, wrong user, replay, in-app confirmation required, revoke stops work already queued, 90-day suspension. Principal: a linked account acts only in its workspace; read mode refuses every write tool; an unlinked or revoked id gets only the fixed message; a group chat is refused. Actions: proposals carry the Telegram evidence; approval from Telegram equals approval in the inbox; untrusted content never auto-commits; R2 and R3 are impossible from the chat. Inputs: voice echo and confirm; transcript only is kept; a 20 MB limit; unsupported types; photo to contacts proposal; injection fixtures in a PDF, a forwarded email and a photo. Outputs: HTML escaping; splitting at 4,096; files sent as documents; sensitive classes become summary and link. Privacy: a workspace with the EU-only or no-external policy cannot link; erased directory people never appear; `/forget` removes what Telegram allows. Cost: per-workspace limits; a run past its budget stops with a plain message. Erasure and export cover every new table. The coverage tests of the tenant registry and the privacy registers stay green.

## 13. Decisions for the founder (defaults chosen; change any)
1. **One product bot for all customers** (not one per tenant): yes.
2. **A new, separate bot** for the product, leaving the current one as the operator alert bot: yes. You create it in @BotFather (name suggestion "Anker AI") and set its token as `TELEGRAM_PRODUCT_BOT_TOKEN` in Vercel; the webhook is registered by a one-time script.
3. **Who gets it first:** founder and VC workspaces, owners and admins in write mode, members in write mode only if the owner allows; **LPs read-only**, later.
4. **What the bot may do without leaving the chat:** R0 (stage changes, tasks, notes) and R1 with a tap; R2 and R3 never. Say if you want R1 behind a re-confirm.
5. **Voice:** always echo the transcript; confirm before a write when names, amounts or dates appear: yes.
6. **Where an uploaded file goes by default:** nowhere (context only, deleted after the run) unless the person taps Save.
7. **Sensitive classes sent as summary and link:** LP documents, KYC, data-room, signed agreements: yes.
8. **Whether Telegram is acceptable for your customers' data at all** (it is a US-linked processor with no end-to-end encryption for bots). The spec makes it opt-in per workspace and blocks it for EU-only and no-external policies; if you would rather start with a channel with stronger terms, section 11 T5 names WhatsApp, which has its own costs and verification.
9. **Order against A2 of the alerts spec:** A2 is small and independent; this is large. Default: finish A2 first (quiet hours matter now that Telegram buzzes at night), then start T1.

## 14. Not in scope
Telegram groups and channels; payments or invoicing through the bot; the bot making or receiving calls; a general consumer assistant for people without a workspace; storing any message content in the channel tables; end-to-end encryption (Telegram bots cannot provide it); sending email, LinkedIn or any message to a third party from the chat; replacing the web app.

## 15. Build status
**T1, link and ask (read only) (2026-10-16), built and tested, deployed behind the platform flag `telegram_channel` (off) and the plan feature `channel_telegram`** (migration `2026-10-16i-telegram-channel`). Nothing is live for customers until the founder creates the product bot and switches the flag on.
- **Bot and webhook.** `lib/telegram/api.ts` reads `TELEGRAM_PRODUCT_BOT_TOKEN` (a separate token from the operator alert bot, which is never read here). The webhook secret is **derived** from the platform `SECRET_KEY`, so there is no second secret to enter. `POST /api/telegram/webhook` checks the secret header in constant time before it parses anything, stores the update (encrypted, unique on `update_id`), answers 200 at once and processes after the response; a cron every minute (`telegram-sweep`) retries what a killed function left. Registering the webhook is a button in SAIL (Platform, Telegram channel), which calls Telegram from the app, so the token never leaves production.
- **Queue rules.** An update is processed once; a chat's messages are answered in order; a failure is retried up to three times and then given up on with the stored content wiped; a stuck "running" update is reclaimed after five minutes; an update from a device revoked meanwhile is dropped. The stored update is wiped as soon as it is done; no message text is kept in these tables.
- **Linking** (`/dashboard/channels`, the Telegram card): Connect Telegram gives a single-use code (24 characters, ten minutes, stored hashed) as a `t.me` link; pressing Start creates a **pending** link; the person approves the device in the app (only the person the code was made for can); disconnect from the app or `/unlink`; an owner or admin can disconnect any device in the workspace; a device idle for 90 days is suspended and must be approved again. One live link per Telegram account. Two accounts racing for a code: exactly one wins.
- **What the bot does:** unknown accounts get one fixed message and nothing runs; pending and suspended devices are not served; groups are refused and left; `/help`, `/whoami`, `/unlink`; text questions are answered by the **existing assistant in a read-only principal** (`resolveAiPrincipal` with `readonly`), with the last six messages as context, and the exchange is saved in the workspace's own chat in Anker AI (title "Telegram"). Voice, photos and files are declined with "next release". A flood from one chat is slowed down. Answers are escaped (no markup or link can be injected), bold and code kept, long answers cut into at most three messages plus a pointer to the app.
- **The gate** (every message): the platform flag, the plan feature, a workspace that is not paused, and the workspace's **AI data policy must be Standard**: an EU-only or no-external workspace is refused, with the reason in words. Telegram is in the sub-processor register as a messaging provider, not yet in use.
- **SAIL:** Telegram channel page (set-up checklist, the bot, webhook status and last Telegram error, queue and device counts; never a message or a secret) and a new alert rule `telegram_queue` (messages waiting over ten minutes, or three failures in an hour). The tenant registry covers the three new tables, and the plan feature `channel_telegram` is on the internal plan only.
- 48 tests in Anker (suite 1,861 passing) and 3 in SAIL (188).
- **Not in T1:** writes and approval buttons (T2), voice and files (T3), outputs and the daily brief (T4); the `/dashboard/channels` page is not yet linked from the app's navigation (reachable by its address); per-person notification settings; multi-workspace switching.
- **To switch on (founder):** create the bot in @BotFather (suggested name "Anker AI"); set `TELEGRAM_PRODUCT_BOT_TOKEN` in Vercel (Production) and redeploy; in SAIL, Telegram channel, press Register the webhook; assign the `channel_telegram` feature to a workspace (or use the internal plan) and turn on the flag `telegram_channel`; then connect from Connected channels.

**T2, actions and notifications (2026-10-16), built and tested, deployed behind the same flag** (migration `2026-10-16j-telegram-t2`). Still off for customers until the founder sets the bot up.
- **Allow changes is a switch per device, off by default.** In Anker, Connected channels, the owner of a device turns on "Allow changes". It is refused for anyone who cannot write in the workspace (an LP or a read-only seat); the assistant then runs with a writing principal, still through the action layer: it **proposes**, never writes.
- **A proposal in the chat.** After a run that proposed changes, each one (at most five, the rest pointed to in the app) is sent as a message with what would change and **Approve and Reject** buttons, or only "Open in Anker" on a read-only device. Proposals that reach other people (R2, R3) and large batches that need a typed count never get an Approve button: they say so and point to the app. A proposal that rests on outside content carries a warning line. Everything the model or a record wrote is escaped.
- **A tap is not the authority.** Each tap is checked again: the device is active and in write mode, the gate (platform flag, plan, data policy), the proposal belongs to the workspace and is the right kind, and the person can still write. It is then decided by the existing `decide()` as the linked person, with the audit trail of the action layer plus a `telegram.decision` entry. The message turns into the result; a change that is reversible gets an **Undo** for 30 minutes (older ones are undone in the app). Rejecting is always allowed. A failure is one plain sentence.
- **Commands:** `/inbox` (what is waiting, with buttons), `/today` (a count of approvals waiting, tasks due and overdue, and replies in the last day, each from the workspace's own tables), `/mode`.
- **Notifications (opt-in per device, off until switched on):** changes waiting for approval, replies to the person's outreach, tasks due (once each morning). **Counts and a link only**, never a name or a summary; nothing between 22:00 and 07:00 Berlin time, and the watermark means the morning message covers the night; a proposal already shown in the chat is not announced again; switching a notification on starts its watermark at that moment, so old items are not announced. Cron `telegram-notify` every five minutes.
- **Not in T2:** the chat cannot approve or undo anything above R1, and nothing leaves for a third party from the chat (by design); notification quiet hours are fixed at the defaults; voice and files are T3.
- 36 more tests in Anker (suite 1,886 passing).

## 16. T3 and Halyard: do notes through the bot need Halyard running?
**No.** Halyard (the `Call-Intelligence` desktop app) and the Telegram bot do different jobs and meet in one place, Anker's **call notes library** (`investor_calls`: the Call Intelligence page for founders and fund managers, Call notes for LPs).
- **Halyard** listens live on a computer: the microphone and the other side of a call, with a running brief and answers during the conversation. It transcribes on the machine (local Whisper) or with the person's own provider and uploads **only a transcript the person queues**, through a device key. It is the right tool for a live call on a laptop, and a phone cannot replace that.
- **A voice note or a document sent to the bot** is recorded or written after the fact, on a phone, and is transcribed by Anker's own speech-to-text (the same Qwen service the web chat uses). It needs nothing installed and no desktop running.
- **They share the library.** A Telegram note is saved with `source = telegram` through the same `saveCall` that Halyard's sync and the paste box use, so it appears in the same list, can be linked to a CRM contact, analysed and turned into a follow-up draft in the same way, and is found by the assistant's existing call-notes tool ("what did Katja say about the term sheet?"), which also reads notes Halyard uploaded. Nothing about Halyard changes.
- **Decision:** build the phone path now (T3, no dependency on Halyard); keep Halyard as the live-call tool; do not build a bridge between them. If a person wants a recorded call (an hour-long recording) in the library from a phone, the answer is to record in Halyard or paste the transcript, because a Telegram clip is limited to about five minutes. A later option, not needed now, is a longer-recording upload from the app.

## 17. Build status, T3
**T3, voice and files (2026-10-17), built and tested, behind the same flag** (migration `2026-10-16k-telegram-t3`).
- **Voice notes and audio files** (up to five minutes or 7 MB; longer is refused before downloading, with advice to send shorter parts): downloaded from Telegram (the bot limit is 20 MB), transcribed with the existing Qwen3-ASR service, and **shown back** ("Heard: ...") with three buttons before anything is done: **Save as note**, **Ask Anker**, **Discard**. Speech is never acted on unconfirmed. A read-only device is offered Ask and Discard only, and told how to allow notes.
- **The held transcript** is stored encrypted for one hour, for one device only, and deleted when the person decides (or swept after the hour). It is the only place a transcript lives before it is saved.
- **Save as note** writes a call note (`source = telegram`, the person as owner, the workspace's scope) through the existing save, with the held item's id as its upload id, so a second tap or a retry saves nothing twice. It needs a device that may make changes and a person who can write; too short (under 20 characters) or too long (over 60,000) is refused in words. The tap is the person's confirmation that they may keep what they recorded; the prompt does not claim consent on anyone's behalf.
- **Files and photos** (PDF, Word, Excel, text, CSV, JSON and images up to 20 MB): read with the **same reader as the web chat** (scans are read by OCR, images by vision). A caption is the question; with no caption the file is summarised with its dates, amounts and names. The content is **untrusted data**: the run is marked untrusted, so nothing it proposes can commit by itself, and instructions hidden in a file are not followed. Files are **not stored**: only the question and the file name go into the workspace's chat. If the file had readable text, the bot offers once to keep its text as a call note.
- **Limits:** 40 voice notes and 30 files per device per day; each refusal says so in words.
- **Not in T3:** saving a file to the data room or to a CRM contact (a proposal, planned for T4), longer recordings, voice replies, and a per-workspace setting for the daily limits (fixed constants for now).
- 23 more tests (suite 1,910 passing).

## 18. Build status, T4 (2026-10-16)
Built, tested (1937 Anker tests, 188 SAIL tests, typecheck clean), migration `2026-10-16l-telegram-t4.sql` applied to Neon and recorded.
- **Configurable limits.** The four daily numbers (voice notes per device, files per device, audio minutes per workspace, spoken replies per workspace) are now entitlement limits (`telegram_voice_per_day`, `telegram_files_per_day`, `telegram_audio_minutes_per_day`, `telegram_voice_replies_per_day`), set per workspace in SAIL. Defaults 40 / 30 / 120 / 20 apply when nothing is set; `unlimited` is stored as -1.
- **Longer recordings.** A Telegram voice note may now be up to 45 minutes (20 MB, Telegram's download limit): the Ogg/Opus file is split at page boundaries into pieces of about four minutes, transcribed three at a time and joined. Other audio files stay at five minutes / 7 MB. The audio length is stored (`telegram_updates.units`) to meter the workspace's daily minutes.
- **Voice replies.** Off by default; each device can switch "read my answers aloud" on. The answer is spoken with Qwen TTS, encoded to MP3 (lamejs) and sent as a voice message after the text. A failure never loses the text. Capped per workspace per day.
- **Files out.** Files the assistant generates (up to three per answer, 20 MB each) are sent as documents, only if they belong to this workspace.
- **Sensitive answers.** Answers built from data room, LP or KYC records send no detail through Telegram, no voice and no file: only a pointer to Anker AI. The full answer is saved in the workspace's own chat.
- **/forget.** Deletes the last 48 hours of messages in the chat (both sides, from the ids kept in `telegram_sent`, no text), clears the conversation in Anker and the held transcripts. Telegram does not let a bot delete older messages; the reply says so.
- **Daily brief.** Opt-in per device; one message each morning (after quiet hours) naming pending approvals, today's and overdue task titles and new replies. It replaces the plain task-count notification and is the one message that names things, because the person asked for it.

Caveats, stated plainly:
- **Not verified live.** ASR, TTS and Telegram delivery have been tested against mocks and recorded fixtures only; the product bot does not exist yet (founder step: BotFather, `TELEGRAM_PRODUCT_BOT_TOKEN`, webhook, feature, flag).
- **LGPL.** `lamejs` (MP3 encoding) is LGPL; it is used unmodified as a dependency. Counsel should confirm this is acceptable for the distribution model.
- Deferred: save-to-data-room and CRM notes as proposals, agent-result messages, T5.

## 19. A workspace's own bot (2026-10-16): connect it in the app, no Vercel step
**Request:** instead of the founder creating one bot and putting its token into Vercel, a workspace owner should create the bot and connect it inside Anker, the way the LinkedIn extension is connected, with the token saved under that workspace.

**Decision.** A Vercel environment variable is one value for the whole platform, so it cannot be per workspace, and changing it needs a redeploy. So the token is a **workspace setting stored encrypted in the database**, and the app does the Vercel-equivalent steps itself: it checks the token with Telegram, registers the webhook and shows the result. The shared platform bot (`TELEGRAM_PRODUCT_BOT_TOKEN`) stays as an optional default for workspaces that do not want their own. We do not call the Vercel API: it would need a Vercel token with write access to production, and it would still be one bot for everyone.

**The flow (Connected channels, owner or admin only):**
1. The page says: open @BotFather in Telegram, send `/newbot`, choose a name and a username ending in `bot`, copy the token it gives you.
2. The owner pastes the token. Anker calls `getMe` (token valid and it is a bot), refuses a bot that is already connected to any workspace or is the platform bot, saves the token **encrypted**, registers the webhook `https://<app>/api/telegram/webhook/<bot id>` with a secret derived from the platform key and the bot id, and shows "Connected: @name".
3. The token is never shown again, never logged, never returned by any route and never in an export (`secret` column in the tenant registry). Disconnecting removes the webhook, revokes every device linked through that bot and deletes the token. The page tells the owner they can also revoke the token in BotFather.
4. Devices then link exactly as before (code, Start, approve in the app), through the workspace's own bot.

**Data model (migration `2026-10-16n`).** `telegram_bots` (one per workspace: `id`, `org_id` unique, `bot_user_id` unique, `username`, `token_enc`, `created_by`). `bot_id` (default `platform`) added to `telegram_links`, `telegram_link_codes`, `telegram_updates` and `telegram_sent`: a Telegram `update_id` and a message id are only unique **per bot**, so the keys become `(bot_id, update_id)` and `(bot_id, chat_id, message_id)`, and one Telegram account may be linked once per bot.

**Isolation.** A link code is made for one bot and works only there, so a code from workspace A cannot link a phone through workspace B's bot. Each webhook URL has its own derived secret. Every send, download, notification, sweep and `/forget` uses the bot the link belongs to.

**Costs and limits.** The workspace owns its bot, so Telegram traffic is theirs. Anker's AI, speech and storage costs follow the workspace as before (doc 58 will meter them). The plan feature `channel_telegram` and the flag `telegram_channel` still gate the workspace.

**Not in scope:** creating the bot for the person (Telegram does not allow it; BotFather is the only way), bot avatars and descriptions (set in BotFather), webhook secrets entered by the owner, one workspace with several bots.

### Build status, section 19 (2026-10-16)
Built and tested (10 new tests; 1957 Anker tests in all); migration `2026-10-16n-telegram-own-bot.sql` applied to Neon.
- Connected channels shows a "Your workspace's bot" panel to owners and admins: three steps for BotFather, a password-style token field, then "Connected: @name" with the webhook status and a Disconnect button. API: `GET/POST/DELETE /api/telegram/bot`.
- The token is stored encrypted in `telegram_bots`, excluded from exports (`secret: ["token_enc"]`), never returned, logged or put in an error (tested). The webhook is registered by the app at `/api/telegram/webhook/<bot id>` with a secret derived per bot; the shared bot's secret does not open a workspace bot's route.
- Everything that talked to "the" bot now takes the bot the link belongs to: webhook, queue (`(bot_id, update_id)`), sweep, notifications, replies, files, voice, `/forget`.
- A link code works only on the bot it was made for (tested); one Telegram account can be linked once per bot.
- **No Vercel variable is created, by design** (section 19). `TELEGRAM_PRODUCT_BOT_TOKEN` is now optional: it is only the shared default for workspaces without their own bot.
- **Not verified live:** no real bot has been connected. The first real connect should be tried with a throwaway bot.
- **Known limit:** erasing a workspace deletes its bot row and token but does not call Telegram to remove the webhook; the webhook then answers 401 until the owner revokes the token in BotFather.

## 20. Whose bot: the workspace's, or a member's own (2026-10-16)
**Request:** the bot should be specific to the workspace and to the user, because several people work in one workspace.

**Decision.** Two kinds of own bot, both stored the same way as in section 19, and a clear order for which one answers:
1. **A personal bot** (a member's own, made in BotFather by that member). Only that member can link a phone through it; a link code made by someone else is refused on it. Any member who may use the channel can connect one. It reaches the same workspace data the member can reach, never more: every answer still runs as that member.
2. **The workspace bot** (made by an owner or admin) is shared: each member links their own phone to it, one Telegram account per member.
3. **The shared Anker bot** (optional, platform-wide) is the default when neither exists.

A member's route is personal, then workspace, then shared. Owners and admins can see every bot in the workspace and disconnect any of them (removing a member from the workspace does not remove their bot automatically yet; an owner or admin disconnects it). Disconnecting works as in section 19: webhook removed, devices on that bot disconnected, token deleted.

**Data.** `telegram_bots.user_id` (null for the workspace bot). One workspace bot per workspace; one personal bot per member per workspace; one Telegram bot in only one place (unchanged). A link code is checked against the bot's owner as well as its workspace.

**Not in scope:** moving a personal bot between workspaces, a member with personal bots in several workspaces sharing one bot (a bot serves one workspace).

### Build status, section 20 (2026-10-16)
Built and tested (5 new tests; 1972 in all); migration `2026-10-16p-telegram-personal-bots.sql` applied to Neon.
- Connected channels now has "Your own bot" (any member), "The workspace's bot" (owner or admin to connect, everyone uses it) and, for owners and admins, a list of members' own bots with Disconnect. API: `GET/POST/DELETE /api/telegram/bot` with `scope` or `botId`.
- A member's phone is routed personal, then workspace, then shared. A personal bot accepts a link code only from its owner, and a code is checked against the bot's workspace as well (tested, including a code made for another workspace).
- Every answer still runs as the linked member, so a personal bot reaches nothing the member could not reach in the app.
- **Not done:** removing a member from a workspace does not yet disconnect their personal bot or their phones (an owner or admin does it by hand). Worth wiring to the member-removal path.
- Still not verified against a real Telegram bot.

## 21. Where this stands and what remains (2026-10-18)
**Built (T1 to T4, §19 and §20):** see section 15, 17, 18, 19 and 20 above. **Verified live: nothing that touches Telegram.** No bot exists, no device has been linked, the flag is off. Every Telegram behaviour has been tested against recorded fixtures and a fake Telegram only. This is the largest unverified area of the platform (`docs/status-register.md`).

**What the old T5 turns into.** Voice replies and the per-tenant bot (the old T5 items) are built. The rest is split so each piece can be built, tested and deployed alone:
- **T5a, the first real run (no new code, mostly the founder's hands).** Connect a bot in Connected channels, switch the flag on for one workspace, assign the feature, then walk the whole channel live with a harness like the investor test: link and approve, a question, a proposal approved by button, a voice note, a PDF, a spoken reply, `/forget`, a notification, a second member on a personal bot, a leaver. This is where the faults will be, as the investor test showed (it found the portal returning an error to everyone). *Acceptance:* each behaviour of doc 57 sections 4 to 9 observed once on a real phone, faults fixed, the result recorded in the register.
- **T5b, the deferred actions.** (1) A voice note or message saved as a **CRM note** through a new capability `crm_add_note` (CRM activities are append-only, so undo is a counter-note, not a delete); (2) a received file saved to the **data room** as an R1 proposal with its folder chosen by tap; (3) **agent results** pushed to the chat when an agent finishes, as a short summary with a link. *Acceptance:* each is a proposal with buttons, appears in the inbox and audit trail, and nothing is written without an approval.
- **T5c, several workspaces per person.** Today a Telegram account links to one workspace per bot. A person in two workspaces (a founder and a fund) needs `/workspace` to choose, a visible "you are in: X" line on every answer, and the unique rule changed from one live link per Telegram account to one per (account, workspace). *Acceptance:* a person with two links sees only the chosen workspace's data, a switch is explicit and audited, and an unlink removes one workspace only.
- **T5d, allowance and incident messages.** The 80% and 100% allowance warnings (doc 58) and workspace-relevant incidents to owners who opted in, counts and links only, inside quiet hours.
- **T5e, investors on Telegram (after doc 61 P1).** An investor links a Telegram account to their profile and asks about their own account, statements and notices, read-only, answered from their records only; any request that implies action becomes a request to the fund as in doc 60 L5. Needs the investor profile first, and the data policy question for investor data on Telegram answered by counsel.
- **T5f, further channels (WhatsApp),** on the same channel layer, with Meta's business verification and message templates. Later, only if customers ask.

**Order and why.** T5a first: it is cheap, it is the only way to learn what is wrong, and every other slice builds on a channel that has never carried a real message. Then T5b (it completes what the voice and file features promised), T5c (people in two workspaces are common), T5d (small). T5e waits for doc 61. T5f waits for demand.

**Decisions for the founder (defaults chosen):** (1) start with T5a before any new code (default yes); (2) which workspace is the first to switch the flag on: the founder's own (default); (3) T5b's note capability stays "append only, undo by counter-note" (default yes); (4) T5c shows the workspace on every answer (default yes); (5) T5e only after counsel has seen it (default yes).

## 22. Decision of 2026-10-18: no note-taking through Telegram
The founder decided that call notes are **not** taken through Telegram: Halyard becomes its own feature with a web app and the desktop app (doc 62). Consequences for this document: the "save as call note" step of a voice note, `lib/telegram/notes.ts` and the note buttons, section 16 (Telegram and Halyard), and the T5b items "voice note as a CRM note" and "agent results" are **retired** (removal is slice H0 of doc 62). Voice notes stay as **questions and commands**: transcribed, shown back, then answered or discarded. T5b keeps one item, saving a received file to the data room as a proposal.

Also decided the same day: Telegram is set up by customers in Anker (Connected channels); SAIL **supervises** it: lists every workspace and personal bot with health and device counts, and can remove a connection or a single device with a reason, after which the phones are told and the workspace's owners are notified (built 2026-10-18). Telegram now marks itself "in use" on the public sub-processor list by itself the first time a bot is connected or a phone linked.
