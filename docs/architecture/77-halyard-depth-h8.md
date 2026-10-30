# 77. Halyard depth (H8 of doc 62)

Status: **H8a built 2026-10-30 (custom playbooks). H8b to H8f are specified here and deliberately not built, each with the reason and the trigger that starts it.** Written before the code, as the rule requires.

## 1. Why H8 is split

Doc 62 named six things under "H8 (later): depth". They are not one slice. Two of them can be built and tested honestly here; four need something this environment cannot supply (a model download measured on real calls, a browser extension reviewed by a store, an always-on service, a phone, recorded audio to evaluate on). Building those without the thing they depend on would produce code nobody can trust. So: build what can be proved, write down the rest.

| Slice | What | Built? | Why / the trigger |
| --- | --- | --- | --- |
| **H8a** | **Custom playbooks**: a person or workspace writes their own call mode, in the same file format as the shipped ones | **Yes** | Pure server and UI work; the parser, the validator and the prompt path already exist and are tested |
| **H8b** | Silero VAD v5 in the browser (replaces the energy-based detector) | No | Needs the 2.3 MB model and a 14 MB WebAssembly runtime shipped as static files and, above all, a **measurement** on recorded calls (doc 62 section 7's quality bar) to show it is better. Trigger: the first set of consented recorded calls |
| **H8c** | On-device WebAssembly transcription (private and EU-only mode) | No | A model of tens to hundreds of MB, WebGPU where present, quality below the server path in noise. Cannot be judged without a real machine and real calls. Trigger: the first customer whose data policy forbids the server path (today the start screen says so and points to the desktop app) |
| **H8d** | Chrome extension side panel with reliable tab audio | No | Needs a store review and a signed package, and tab capture from an extension is only knowable in a real Meet or Zoom. The web room's own tab share (H4) already does this for Chrome and Edge. Trigger: users who cannot share a tab (policy) or who need the panel inside Zoom's web client |
| **H8e** | Streaming gateway | No | Only if the measured latency misses doc 62 section 5's target. It has never been measured against a real provider. Trigger: p95 above 4 s in SAIL's Halyard page with real customers (the alert `halyard_latency` is the signal) |
| **H8f** | Phone companion; speaker diarisation for room mode | No | A phone app is out of scope in doc 62 section 19 until asked for; diarisation needs a model and labelled audio. Trigger: a customer who runs calls in a room with one microphone and asks for it |

## 2. H8a: custom playbooks

### What a playbook is
The same thing as a shipped skill: a `SKILL.md` text with frontmatter (`name`, `description`, a `halyard:` block) and a body with `## Action: say` sections. The same parser and validator check it (`parseSkillMarkdown`, `validateSkill`), so what is accepted behaves exactly like a shipped mode, in the live brain, in the notes draft and in the email draft.

### Rules
1. **Who may write one.** A member for themselves (**personal**: only they see and use it). A workspace owner or admin for the workspace (**workspace**: every member can pick it; only owners and admins edit it). Viewers cannot write.
2. **Identity.** The playbook's `name` is its slug, lowercase letters, numbers and hyphens, at most 40 characters, unique in the workspace, never equal to a shipped skill's id (a custom one cannot impersonate a shipped one). The mode stored on a session is `pb-<slug>`.
3. **Limits.** At most 20 playbooks per workspace and 10 personal per person; the file at most 24,000 characters (the validator already caps the body at 20,000). The shipped base is always `call`: the interview base is a desktop-only skill and is rejected.
4. **Stored encrypted** (`markdown_enc`) like every other text of Halyard, though it holds no call content, because it often holds deal and pricing detail.
5. **It is instructions the author chose, so it is not evidence.** A playbook is placed in the system prompt under "Call mode guidance", before the guard, exactly where a shipped skill goes. The transcript stays evidence. A playbook cannot turn off the spoken-only contract, answer lengths or the guard (they are in code), and cannot give the assistant tools (it has none).
6. **A workspace playbook is visible to every member before they use it** (the editor and the start screen show who wrote it and when), because it shapes what the assistant tells them in a live call.
7. **Deleting.** A playbook can be deleted at any time; a session already started with it keeps working with the general mode (the mode is looked up per request and falls back). Erasing a workspace deletes its playbooks; the person's own export includes their personal ones.
8. **Kill switch and plan.** Editing playbooks is not blocked by the kill switch (it is configuration, not a live action); starting a session with one is, like any session.

### Start from a copy
The editor offers "start from" a shipped mode (its raw text, copied into the editor) or a short template, because writing a mode from nothing is the hard part. Shipped modes themselves are not editable.

### Feedback in plain words
Every validator message is shown as it is ("name must be lowercase letters, numbers and hyphens", "the body is empty", "unknown action ..."), and a **preview** shows the label, the action sections found and the number of characters, so the author sees what the parser understood before saving.

### API (browser session only; a paired desktop key may list)
`GET /api/halyard/playbooks` (shipped modes, workspace and personal ones with who and when), `POST` (create), `PUT /:id`, `DELETE /:id`, `POST /preview`, `GET /template?from=<shipped id>`.

### Tests
Parser and validator cases on custom text; slug rules and collisions with shipped ids; limits; who may write, edit and see which scope; personal playbooks invisible to others; a session started with a custom mode uses its sections in the prompt and its notes focus in the notes draft; a deleted playbook falls back to general; the guard is still in the prompt; erasure and export cover the table.

### Not in H8a
Sharing a personal playbook with one colleague (promote it to the workspace instead), versions and history, playbooks for the desktop app (the desktop has its own user skills folder), a marketplace.

## 3. Built (2026-10-30)
Migration `2026-10-30-halyard-playbooks.sql` (applied to production; one new empty table). `skillFromText` in the shared core (the file loader now uses it, so a playbook and a shipped file are parsed by one code path; the differential test still passes). `lib/halyard/playbooks.ts` (preview, create, edit, delete, list, lookup per request), routes under `/api/halyard/playbooks` (list with the built-in modes, create, get, update, delete, preview, template), the editor at `/dashboard/halyard/playbooks` (live preview in the parser's own words, start from a template or a copy of a built-in mode), the start screen's call-type list gains "Your playbooks", and the person's own export includes their playbooks. A session in a custom mode uses its sections in the live prompts, its notes focus and guide in the notes draft and its email guide in the email draft. **Tests:** 12 integration tests (validation messages, built-in names protected, interview base refused, who can write and see what, name locked, limits, encryption, the prompt content and the guard after it, fall back to general when deleted or not yours, export). **Not verified:** the editor page in a browser against real use, and how well a person-written playbook steers a real model (that is the author's craft and is judged on calls).
