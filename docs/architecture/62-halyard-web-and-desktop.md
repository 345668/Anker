# 62. Spec: Halyard as an Anker feature, on the web and on the desktop

Status: **spec. Nothing is built.** Raised by the founder on 2026-10-18. It does two things: (1) it **scraps the plan to take call notes through Telegram** and makes **Halyard its own feature** of the platform; (2) it gives Halyard a **web app on the Anker platform that does what the desktop app does**, with the same call modes, the same live assistance and the same notetaker, sharing one library of calls. Builds on doc 57 (the Telegram channel, section 16 of which this supersedes), doc 58 (metering), doc 54 (data policy and providers), doc 43 (proposals) and the Halyard repository (`~/Call-Intelligence`, `github.com/345668/Halyard`, Electron 44, plain JavaScript, about 7,800 lines in `src/`).

## 0. Reading guide
Sections 1 to 3 are the product (high level). 4 and 5 are the architecture. 6 to 9 are the web app in detail (capture, transcription, the live brain, notes). 10 to 12 are the data model, the API and the client. 13 to 16 are privacy, governance, supervision and testing. 17 is the build order. 18 is the decisions. 19 is what is out of scope.

## 1. What is decided
1. **No note-taking through Telegram.** The Telegram assistant keeps asking and answering (text, voice commands, files for questions, proposals). It stops saving anything as a call note. Concretely: the "save as call note" step of a voice note, `lib/telegram/notes.ts` (`saveAsCallNote` and its helpers), the note buttons and their callbacks, the `crm_add_note` and agent-result items planned for T5b, and section 16 of doc 57 are **retired** (slice H0). A voice note sent to the bot is transcribed and either answered or discarded.
2. **Halyard is a feature of Anker, not only a downloadable.** It has an entitlement, usage limits, a supervision page in SAIL, a library, and two ways to run: a **web app** (new) and the **desktop app** (existing). One person can use either, and everything they record lands in the same place.
3. **The web app is "just like the desktop version"** in what it does (section 3 is the parity table) and **unlike it in one stated way**: a browser cannot hide itself from screen sharing and cannot capture the whole machine's audio on every system. The desktop app remains the private, invisible mode. The web app says so plainly.
4. **The intelligence moves to one place.** The logic that makes Halyard "call intelligence" rather than a transcriber (utterance segmentation, the rolling brief, extracted figures, the call modes and their per-action playbooks, the spoken-only answer contract) becomes **one shared core**, run by Anker's servers for the web app and, over time, for the desktop app too. Today it exists only inside the Electron app.

## 2. What exists today
**Halyard desktop** (Electron 44, macOS 14.4+ and Windows, no native modules): a glass overlay that is invisible to screen capture (best-effort, stated honestly); three inputs (screen, your microphone as the **You** channel, meeting audio as the **Them** channel); local **whisper.cpp** or a provider for speech to text, Silero VAD v5 in the renderer for utterance boundaries (pre-roll 300 ms, minimum 180 ms, maximum 25 s, overlap 300 ms); actions **Assist, What should I say, Follow-up questions, Recap, Ask anything** (and a coding solver, kept desktop-only and off for this spec); **call modes as skill files** (General, Job interview, Sales call, Investor call · Founder, Investor call · VC) with per-action sections; a **running brief** that folds evicted turns into a rewritten summary (at most 2,400 characters) and **figures pulled out by code, not by the model**; a **notetaker** (encrypted notebook, key points, decisions, action items, follow-ups, figures, a chunked AI draft for calls over 50,000 characters, a follow-up email draft); bring-your-own provider keys stored with the OS credential store; and an **upload-only sync** to Anker (a device key, queued transcripts, 60,000-character cap, idempotent import id, no audio).
**Anker** has a call library (`investor_calls`, with sources `paste` and `sync`), a post-call analysis (`lib/calls/analyze.ts`: summary, sentiment, interest, objections, next steps, key questions, follow-up draft, suggested stage, all as suggestions), device keys (`call_sync_devices`), a download page and release manifest for the desktop app, and the assistant that can read calls. **Measured 2026-10-18: `investor_calls` has 0 rows and `call_sync_devices` 0 rows: no one has used any of it.** The Telegram note-taker (doc 57 T3) is built and never run.

## 3. The product: one feature, three surfaces
| Surface | What it is | Who it is for |
| --- | --- | --- |
| **Live room (web)** | `/dashboard/halyard`: start a session in the browser, a floating panel with Chat, Transcript, Notes and Prep tabs, the call mode pill, and the five actions | Anyone on a laptop who does not want to install anything; teams where installing is blocked |
| **Desktop app** | The existing overlay, invisible in screen sharing, native audio capture, local transcription option | Private use during calls where invisibility and offline matter |
| **Library** | The existing calls library, extended: every session's transcript, brief, notes, figures, suggestions used, follow-up draft and proposals, from either surface | Everyone, afterwards |

**Parity with the desktop**
| Capability | Desktop | Web app | Note |
| --- | --- | --- | --- |
| Your microphone (You) | Yes | Yes | `getUserMedia` |
| Meeting audio (Them) | macOS 14.4+, Windows | **Browser tab audio** in Chrome and Edge on every system; whole-system audio on Windows Chrome/Edge only; **none in Safari and Firefox** | Stated to the user before they start |
| Floating panel above the meeting | Always-on-top overlay | **Document Picture-in-Picture** (Chrome, Edge) or a second window | Visible in a full-screen share |
| Invisible in screen sharing | Best-effort | **No** | Say so; advise sharing one tab or window |
| Call modes and per-action playbooks | Yes | Yes (the same skill files) | |
| Running brief and extracted figures | Yes | Yes (server-side) | |
| Local transcription | whisper.cpp | Optional later (WebAssembly, section 7) | |
| Provider | Bring your own key | **The workspace's Anker AI** (metered, policy-checked) | Desktop gains this option too (H7) |
| Notetaker and AI draft | Yes | Yes, saved straight to the library | |
| Screen reading (Assist on what is on screen) | Yes | Optional: one shared tab or window frame on request | Off by default |
| Coding solver, interview coaching | Yes | **No** (not an Anker use case) | Interview coaching stays an opt-in desktop skill |
| Follow along on a second device | No | **Yes** (a read-only live view) | New, both surfaces |

## 4. Architecture in one picture
```
 Capture (client-specific)        Transcribe                 Session brain (shared core, server-side)            Outputs                 Library
 ───────────────────────────      ──────────────────────     ──────────────────────────────────────────          ───────────────         ─────────────────────
 Web: mic + tab/system audio ─►   Web: utterances to the  ─► segments ► rolling brief ► figures ► skill        ─► suggestions (SSE)    investor_calls + notes
 Desktop: native audio       ─►   server ASR, or local     ► prompt builder (spoken-only contract)            ─► live notes           analysis, proposals,
 (both: VAD and utterance cut)    whisper on the desktop      ► model through the workspace's AI provider        ─► end-of-call draft    CRM links, follow-up draft
```
- **Capture and utterance cutting stay on the client** (they need the microphone and are latency-critical).
- **Everything after a finished utterance runs on Anker's servers** for the web app: it can be metered, policy-checked, supervised and kept in one place. The desktop app can use the same server brain (H7) or keep its own local one.
- **One shared core.** The pure modules (`utterance-segmenter`, `rolling-summary`, `note-figures`, `skill-files`, the prompt contract in `prompts.js`, `echo-filter`, `repeat-filter`) are ported to TypeScript in the Anker repository with their existing tests, then **exported as a small package** the desktop build also consumes. Until the desktop adopts it, a test compares the two implementations on the same fixtures so they cannot drift silently.
- **State is in the database,** not in server memory (serverless functions are short-lived): segments, brief versions, notes and suggestions are rows. A session survives a reload, a deploy and a switch of device.
- **Transport:** HTTPS requests for utterances and actions, **server-sent events** for streamed suggestions and the follow-along view. There are no WebSockets on the platform's functions, which shapes the transcription choice in section 7.

## 5. Latency and cost budget (the point of a live assistant)
Target, end of the other person's sentence to the first words of a suggestion on screen: **p50 under 2.5 s, p95 under 4 s**.
| Step | Budget |
| --- | --- |
| Voice-activity hangover (silence that ends an utterance) | 300 ms |
| Upload of about 1 to 25 s of audio as Opus or 16 kHz PCM | 100 to 250 ms |
| Server speech to text | 600 to 1,200 ms (to be measured) |
| Prompt assembly (brief, window, skill) | under 30 ms |
| First token from the model | 500 to 900 ms |
| Render | under 50 ms |
Suggestions are **spoken-length** (the desktop contract: short, usable, no chatbot essays), streamed from the first token. The model never sees raw audio. **Cost** per call-hour is speech (3,600 s at the unit price in `unit_prices`, **a placeholder today**, about 11 cents at the seeded value) plus roughly 30 to 60 suggestions of about 2,000 tokens in and 150 out, plus brief folding every few minutes: low single-digit dollars at list prices, **to be measured in H2 and entered into SAIL's unit economics**, not assumed.

## 6. The web app: capture
- **Permission flow.** A start screen explains in plain words what will be heard and where it goes, asks for the microphone, then (optionally) for **"Share a tab" with audio** for the meeting. It checks the browser first and says exactly what will and will not work (for example, "Safari cannot capture meeting audio; the microphone alone will hear both sides if you use speakers"). No capture starts before the attestation in section 13.
- **Two channels.** `You` from `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`; `Them` from `getDisplayMedia({ audio: true, video: false-or-minimal })` on a chosen tab. If only a microphone exists (a room meeting, or Safari), a single **Room** channel is used and speaker labels come from the model's turn structure, marked as uncertain.
- **Echo.** Without headphones the microphone hears the other side. The desktop `echo-filter` logic (suppress a `You` utterance whose text matches a just-finished `Them` utterance) is ported and runs server-side on text; the audio constraint `echoCancellation` helps at capture.
- **Audio pipeline.** An `AudioWorklet` resamples to 16 kHz mono 16-bit PCM; frames go to a **Web Worker** running **Silero VAD v5** through `onnxruntime-web` (the same vendored ONNX model the desktop uses, about 2 MB). The utterance cutter uses the desktop parameters. Each utterance is encoded (Opus in WebM through `MediaRecorder` when the browser supports it, otherwise WAV) and sent with `seq`, channel and start and end times.
- **Floating panel.** `documentPictureInPicture.requestWindow()` (Chrome, Edge) hosts the panel in an always-on-top window; elsewhere a "pop out" window. A **screen wake lock** keeps the machine awake; `beforeunload` warns during a live session; the page title shows a recording dot.
- **Resilience.** Unsent utterances wait in memory and in IndexedDB (at most 10 minutes of audio, deleted when acknowledged and when the session ends). A dropped network resumes by `seq`; the server de-duplicates on `(session, seq)`. If the tab that is being captured closes, the room says so and stops that channel, not the session.

## 7. The web app: transcription
Options, with the default marked:
| Option | Latency | Privacy | Cost | Verdict |
| --- | --- | --- | --- | --- |
| **A. Server ASR per utterance** (Qwen3-ASR-Flash through the existing `transcribeAudio`, metered as `asr_second`) | 0.6 to 1.2 s per utterance | Audio goes to the provider named in the workspace's data policy (Singapore region today) | Per second | **Default for H3** |
| B. Streaming ASR over a long-lived connection (a provider's real-time endpoint) | Lowest | As A | Per second | Needs a small always-on gateway service (functions cannot hold sockets). Only if A misses the latency target (H8) |
| C. **On-device WebAssembly** (whisper through `transformers.js` or `whisper.cpp` WASM, WebGPU when present) | 1 to 3 s on a recent laptop | **Audio never leaves the machine** | None | **The private mode and the answer for EU-only workspaces.** Model download of tens to a few hundred MB, quality below the server path for noisy calls. H8 |
- **Data policy first** (doc 54): the workspace's preset decides which transcription provider may receive audio. **Today there is no EU-resident speech provider wired in, so a workspace set to EU-only cannot use the web app's server path.** It can use the desktop app's local whisper now and option C later. The start screen says this instead of failing.
- **Languages.** German and English are first-class; the language is set per session (auto-detect per utterance is an option) and recorded with the segments.
- **Quality bar** (measured on recorded calls before launch, not assumed): word error rate on real investor calls in English and German, proper-noun and number accuracy (numbers matter most), and the share of utterances cut mid-sentence. The desktop VAD evaluation method (`docs/vad-evaluation-2026-09-20.md`) is reused for the browser pipeline.

## 8. The live brain (shared core, server-side)
**Per session, in order:**
1. **Segments** arrive (`you` or `them`, text, times). They are stored encrypted. Near-duplicates from overlapping utterances are dropped by the ported `repeat-filter`.
2. **The window.** For each action the prompt contains the last N turns (the desktop `MODE_WINDOW`: assist 12, say 14, follow-up 20, recap all, ask 12).
3. **The running brief.** When turns fall out of the window and at least 6 have accumulated, a **fold** job rewrites the brief from (previous brief + newly evicted turns), never appending, capped at 2,400 characters; it runs after the response, off the critical path, and its result is a new row (`halyard_briefs`, version, `upto_seq`).
4. **Figures** are extracted by code (the `FIGURE_PATTERNS` and `NOTE_PATTERNS` of the desktop: amounts, percentages, multiples, quarters, dates, counts), kept with the sentence and the speaker, and handed to the model as **must-keep facts** in the brief and in recap and notes. The model is told it may not round, merge or drop them.
5. **The skill.** The call mode's `SKILL.md` body plus the section for this action (`## Action: say|assist|followup|recap|prep|notes|email`), plus the user's **Prep** context for that mode, plus the fixed **guard** and the one-line **task**. The spoken-only contract, answer lengths and the no-repeat memory are in the code and cannot be turned off by a skill (as on the desktop).
6. **The model call** goes through `generate`/`generateStream` with `task: "halyard_<action>"`, so it is recorded in `ai_calls` with the workspace's cost centre, checked by the allowance (doc 58) before it runs, and refused with a plain message when the allowance is used up. Suggestions stream to the browser.
7. **Untrusted content.** The transcript, the brief and anything shared from a screen are **evidence, never instructions** (the rule `analyzeCall` already follows). The assistant here **writes nothing**: it produces suggestions. Anything that changes a record afterwards (a stage, a task, a follow-up draft) is a **proposal** (doc 43), approved by a person.

**Actions** (the same five): **Assist** (the do-the-smart-thing key: answer, exact fact, what's on screen, unstick the conversation); **What should I say?** (the next sentence to speak, short); **Follow-up questions** (2 to 4, skipping what was answered, pinning down a number); **Recap** (bold headers, verbatim figures, the whole call using the brief); **Ask anything** (a typed question about the call). Shortcuts mirror the desktop (Cmd/Ctrl+Enter for Assist).

**Call modes** ship from one folder, `skills/halyard/`, shared by the web app and the desktop package: General, Sales call, Investor call (Founder), Investor call (VC), Job interview (opt-in, off by default for Anker workspaces). A test enforces that every shipped skill has all action sections, as on the desktop. Workspaces can add **Prep context** per mode (names, the deal, the questions to ask); custom playbooks are later.

## 9. Notes, the end of a call and the library
- **Live notes** during the session (the desktop notetaker's structure): key points, decisions, action items, follow-ups, figures, each with the time it was said; the person can edit, pin or delete; a note is never overwritten by a later AI draft without showing the difference.
- **AI draft** at any time and automatically at the end: the whole bounded transcript, a 60 s deadline, cancellation, calls over 50,000 characters drafted in **chunks of 45,000** (at most 25 parts) and merged, figures injected from code. Lists are capped at 200 items. A **follow-up email draft** from the notes (a draft only; sending is a person's act, under the existing send rules).
- **End of call** (`POST /end`): the transcript is compiled from the segments and a row is created in `investor_calls` with `source = 'halyard-web'` (or `'halyard-desktop'`), linked to the session. **The existing 60,000-character cap is a problem**: a 90-minute call is about 90,000 characters. Rule: the session keeps the **full** transcript; `investor_calls.transcript` holds up to the cap and a marker, the analysis and notes are produced from the **chunked** path, and the library page reads the full text from the session.
- **Analysis and proposals.** The existing `analyzeCall` runs (summary, sentiment, interest, objections, next steps, key questions, follow-up draft, suggested stage), then **proposals** are made, not writes: move the contact's stage (R0), add the next-step tasks (R0), save the follow-up as an outreach draft (R1). The person approves in the Actions inbox or in the call's page.
- **Library page** per call: transcript with speaker and time, the brief, figures with their sentences, notes (editable), the suggestions that were shown and which were used, the follow-up draft, the proposals and their state, the CRM contact and deal links. Search across calls. Export as Markdown, PDF and DOCX. Deletion removes the session, segments, briefs, notes and the linked call (doc 54 rules).
- **LP persona:** a quieter variant (the existing LP call notes): no live suggestions by default, notes and a private summary only.

## 10. Data model (Anker, additive; every table keyed to the workspace so erasure and export cover it)
- `halyard_sessions`: `id uuid`, `org_id`, `user_id`, `source` (`web`|`desktop`), `mode`, `title`, `language`, `state` (`live`|`paused`|`ended`|`abandoned`), `started_at`, `ended_at`, `consent_attested_at`, `participants_informed` bool, `crm_entry_id`, `call_id` (to `investor_calls`), `stt` (`server`|`local`|`wasm`), `device_id`, `audio_seconds`.
- `halyard_segments`: `session_id`, `seq int` (primary key with `session_id`), `channel` (`you`|`them`|`room`), `started_ms`, `ended_ms`, `text_enc`, `confidence`, `final bool`. **Text is encrypted at the application level** (the platform key, as the identity documents of doc 60).
- `halyard_briefs`: `session_id`, `version`, `upto_seq`, `brief_enc`, `figures_enc`.
- `halyard_suggestions`: `id`, `session_id`, `action`, `requested_at`, `first_token_ms`, `total_ms`, `model`, `tokens_in`, `tokens_out`, `text_enc`, `shown bool`, `used bool`, `rating smallint null`.
- `halyard_notes`: `session_id`, `version`, `body_enc` (the structured notes), `edited_by`, `created_at`.
- `halyard_prep`: `org_id`, `user_id`, `mode`, `context_enc`.
- `halyard_viewers`: `session_id`, `viewer_user_id`, `granted_by`, `revoked_at` (the follow-along view).
- Metering uses what exists: `usage_events` (`asr_second`) and `ai_calls` (`task` `halyard_*`). Retention fields on the workspace policy (section 13). Registered in the tenant registry; `text_enc`, `brief_enc`, `figures_enc`, `body_enc`, `context_enc` are excluded from exports and covered by the person's own export route instead.

## 11. API (under `/api/halyard`, signed-in session; the desktop uses its device key on the same routes)
| Route | Purpose | Notes |
| --- | --- | --- |
| `POST /sessions` | Create: mode, title, language, CRM link, **consent attestation required** | Refuses without the entitlement, a live allowance, a policy that permits the chosen transcription path; one live session per person |
| `PATCH /sessions/:id` | Pause, resume, change mode or title | |
| `POST /sessions/:id/utterances` | Multipart: audio, `seq`, channel, times | Up to 1 MB; transcribes, stores the segment, returns the text; idempotent on `seq`; metered |
| `POST /sessions/:id/segments` | Text already transcribed (desktop local, WebAssembly) | Same storage and de-duplication |
| `POST /sessions/:id/act` | `say`, `assist`, `followup`, `recap`, `ask`, optional question and optional one image | **SSE stream**; records the suggestion with timings; allowance checked first |
| `GET /sessions/:id` | State, transcript page, brief, notes | |
| `GET /sessions/:id/stream` | SSE for the follow-along viewer | Owner and listed viewers only |
| `PUT /sessions/:id/notes`, `POST .../notes/draft`, `POST .../notes/email` | Notes | |
| `POST /sessions/:id/end` | Finalise: compile, create or attach the call, start the draft and analysis | Returns the call id |
| `DELETE /sessions/:id` | Delete everything of the session | |
Limits: at most 6 utterance uploads a second per session; a session lasts at most 4 hours; at most 1,000,000 characters of transcript (the desktop notebook cap); suggestion requests spaced by the allowance check, not a fixed rate.

## 12. The client (Next.js, under `app/dashboard/halyard`)
- **Pages:** `/dashboard/halyard` (start and recent), `/dashboard/halyard/[id]` (the live room, then the finished call), `/dashboard/halyard/[id]/follow` (viewer). The existing `/dashboard/calls` library gains the Halyard fields and links to them.
- **Components:** `HalyardStart` (checks, permissions, attestation), `AudioCapture` (worklet, VAD worker, uploader, queue), `LiveRoom` (panel with Chat, Transcript, Notes, Prep, the mode pill and the five action buttons), `SuggestionStream`, `NotesEditor`, `ConsentBanner`, `BrowserCheck`, `PipHost`.
- **State:** one session store per room (a reducer fed by the capture events and the SSE stream); the server is the source of truth, the client keeps only what has not been acknowledged.
- **Accessibility:** captions are the transcript; every action reachable by keyboard; reduced-motion respected; the recording state is announced to screen readers.
- **Design:** the same glass material and Inter as the desktop where the platform's design system allows; the room must be usable at 360 px for the follow-along view on a phone.

## 13. Privacy, consent and security
- **Consent.** Recording or transcribing a call can require the **consent of every participant** (many countries, and some US states, require all parties). Every session begins with an attestation ("I have the permission I need to transcribe this conversation") recorded with the time, and an optional on-screen reminder to announce it. The room shows a persistent recording indicator. **Audio is not stored**: only text, and only after the person ends or leaves the session.
- **Data policy** (doc 54): the workspace preset decides whether server transcription and the model provider may be used; the start screen explains a refusal. No call content is used to train any model; the provider terms are recorded on the sub-processor page.
- **At rest:** transcripts, briefs, notes, suggestions and prep are encrypted by the application. **Retention** is a workspace setting, default **12 months** after the call, then deleted; the person can delete a call any time; the deletion removes the linked call, notes, and suggestions.
- **Access:** a session is visible to its owner; sharing is explicit (a viewer list for the follow-along view, a teammate share of the finished call under the workspace's roles). A platform operator never sees content (SAIL shows counts and health, section 15).
- **Prompt injection:** the other side of a call is an outside party who can say anything. Transcript and screen content are marked as evidence in every prompt; the assistant has **no tools** here; outputs are text for the person. Hidden instructions in a shared screen do nothing (a test fixture).
- **Abuse:** per-session and per-person rate limits; the one-live-session rule; the device key model of `call_sync_devices` stays for the desktop.

## 14. Entitlements, plans and metering
- A feature key **`halyard`** and limits **`halyard_minutes_month`** (audio minutes) and **`halyard_sessions_live`** (concurrent, default 1) in the entitlement model (doc 41); platform flag **`halyard_web`** as the kill switch.
- Speech counts as `asr_second` and every suggestion, brief fold and draft as a chat call against the workspace's monthly AI allowance (doc 58); the usage page shows Halyard as its own line. The estimate-based check (`assertCan`) runs before a session starts and before each action.
- Which plans include it and how many minutes is a **pricing decision** (doc 42): default is **on for every plan that has the assistant, 600 audio minutes a month, adjustable per workspace in SAIL**. Founder and fund plans differ only in the modes shown.

## 15. Supervision in SAIL (the platform keeps oversight, the customer does the work in Anker)
A SAIL page **Halyard**: per workspace the sessions, audio minutes, suggestions, failure rate of transcription, p50 and p95 latency, and the allowance used; the kill switch and a per-workspace override; the list of desktop devices and their key expiry with revoke (extends the existing device list); the desktop release manifest (exists). **No content of any call is visible.** Alert rules in the engine of doc 56: `halyard_latency` (p95 above 4 s over 15 minutes with at least 20 suggestions), `halyard_stt_failing` (more than 10% of utterance uploads failing over 15 minutes), both severity 3 until there are customers.

## 16. Testing
- **Core port:** the existing Halyard tests for the segmenter, brief folding, figures, skill parsing, echo and repeat filters run against the TypeScript port on the **same fixtures**, plus a differential test against the desktop's JavaScript implementation until the desktop adopts the package.
- **Backend:** in-process database tests for sessions, idempotent segments, the fold, the end-of-call compile (including a 90-minute transcript over the 60,000 cap), proposals, deletion and erasure, the allowance refusing a session, the policy refusing a provider; a fake model and a fake ASR.
- **Browser:** Playwright with Chromium's fake audio devices (`--use-fake-device-for-media-stream` with a recorded call as the input) to drive the whole room: permissions, two channels, utterance upload order, reconnect with a dropped network, the PiP window, the consent gate.
- **Latency harness:** replays recorded calls through the real ASR and model and reports p50 and p95 per step; the target of section 5 is a test, not a hope.
- **Quality:** a labelled set of real calls (with consent) for word error rate and figure accuracy in English and German, run before any customer is told it is live.
- **Live run** (as for the investor leg and the Telegram channel): a real browser, a real call with a colleague who knows, the founder's hands, the result recorded in `docs/status-register.md`.

## 17. Build order
- **H0 (about 1 day): retire the Telegram note-taker. BUILT 2026-10-27 (see doc 57 section 22).** Remove the save-as-note step, `lib/telegram/notes.ts` and its callbacks, the T5b note items; keep voice-as-question; update doc 57. *Acceptance:* a voice note is answered or discarded, nothing is saved as a call, the tests and the doc agree.
- **H1 (about 3 days): the shared core.** Port the pure modules and the skills to TypeScript in the Anker repo with their tests and the differential test; no UI. *Acceptance:* all ported tests pass on the desktop's fixtures.
  - **Built 2026-10-27.** `lib/halyard/core/*` (repeat and echo filters, rolling summary, note figures, brief folder, VAD, utterance segmenter, call-mode prompts, skill files) and `skills/halyard/*` (four skills), with the desktop tests converted and a differential test (`differential.test.ts`) that runs the desktop JavaScript and the TypeScript port on the same fixtures and requires identical output; it skips with a warning where `~/Call-Intelligence` (or `HALYARD_DESKTOP_DIR`) is absent. The coding solver (`leetcode`) and interview-coaching prompts stay desktop-only. No UI, nothing wired in yet.
- **H2 (about 4 days): sessions backend.** Tables, create and end, segments, the `act` stream with skills, brief fold, figures, metering, entitlement, data policy, retention. *Acceptance:* a scripted 90-minute transcript produces suggestions, a bounded brief that keeps the figures, and a complete call row; the allowance and the policy refuse correctly.
- **H3 (about 4 days): the web live room, microphone only.** Capture, VAD worker, server transcription, the panel and the five actions. *Acceptance:* in Chrome, a real person speaking gets a suggestion inside the latency target; a reload resumes.
- **H4 (about 3 days): meeting audio and resilience.** Tab and system audio, two channels, echo handling, PiP, wake lock, reconnect queue, the browser check. *Acceptance:* a real Google Meet call in a second tab is transcribed with both sides labelled; unplugging the network for 30 seconds loses nothing.
- **H5 (about 3 days): notes and the library.** Live notes, the chunked draft, figures, the email draft, the end-of-call flow into `investor_calls`, analysis and proposals, the library page, export. *Acceptance:* ending a call produces notes, a follow-up draft and proposals; a 90-minute call is complete in the library.
- **H6 (about 2 days): governance and SAIL.** Consent, retention, deletion, export, the SAIL page, alerts, the kill switch, the plan feature. *Acceptance:* each toggle works, deletion leaves nothing, SAIL shows no content.
- **H7 (about 4 days): the desktop, aligned.** An "Anker AI" provider and live sync of segments and notes, the shared core package, the follow-along viewer, device key use on the new routes. The old upload-only queue stays for offline. *Acceptance:* a call run on the desktop appears live on the web viewer and in the library, using the workspace's allowance.
- **H8 (later): depth.** On-device WebAssembly transcription (private and EU-only mode), a Chrome extension side panel with reliable tab audio for Meet and Zoom on the web, a streaming gateway if latency demands, a phone companion, custom playbooks, speaker diarisation for room mode.
About 24 working days to H7. H0 to H5 make the web app usable by one person; H6 makes it safe to give to a customer.

## 18. Decisions for the founder (defaults chosen; change any)
1. **Scrap the Telegram note-taker now** (H0). Default yes.
2. **Server transcription first** (option A), on-device later for private and EU-only use. Default yes.
3. **The browser version is a visible companion; the desktop app stays the invisible mode,** and the web app says so before every session. Default yes.
4. **Audio is never stored; text is encrypted; retention 12 months.** Default yes.
5. **The assistant only suggests; changes after a call are proposals.** Default yes.
6. **One shared core and one skills folder,** the desktop moving onto it in H7. Default yes.
7. **Entitlement `halyard`, 600 audio minutes a month, on for plans that have the assistant.** Default; prices belong to doc 42.
8. **One live session per person at a time; a mandatory consent attestation every session.** Default yes.
9. **Interview coaching and the coding solver stay desktop-only and opt-in;** Anker workspaces see the investor, sales and general modes. Default yes.
10. **Counsel reviews the consent wording and the recording notice before any customer uses it** (a founder step). Required.

## 19. Not in scope
Storing or replaying audio or video; a meeting bot that joins calls as a participant; transcribing other people's calls without the person present; automatic sending of anything; coding or exam assistance; a mobile app (H8 names a phone companion); real-time translation; replacing the desktop app; a guarantee of invisibility in the browser.
