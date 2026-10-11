# 51. Spec: subject replacement and staged video pipelines in the Anker Media Studio

Status: **decided 2026-10-11 (section 8); P1 slice 1 built (section 12); P0 spike open (section 11).** Source analysed: <https://github.com/345668/Genjustsu-Open-Source-Workflow> (MIT, about 1,200 lines of Python, last push 2026-10-08, 0 stars), cloned and read on 2026-10-11. Builds on docs 47, 48 and 49.

**What was read, and what was not.** Read in full: `README.md`, `AGENTS.md`, `docs/MODELS.md`, `docs/ENHANCOR-API.md`, `docs/VALIDATION.md`, `THIRD-PARTY.md`, `pipeline.py`, `seedance_bridge.py`, `mask_review.py`, `raw_masks.py`, `audio_workflow.py`, `media_host.py`, `.env.example`. Skimmed: `app.py` routes. Not read: `static/index.html`, `face_mesh.py`, `mesh_worker.py`, `workflow.py`, the tests. **Nothing was run.** Its own validation notes claim one live end-to-end run on macOS and say other systems and failure conditions are not exhaustively tested; we treat the repo as a design reference, not as proven code.

## 1. What the repo is
A local, single-user tool that **replaces the person (or object) in a video with a different character**, keeping the original motion, timing and audio. The recipe, as its docs describe it:
1. Keep the source file untouched. Split the audio into vocals and music with **Demucs** (Replicate), shift the vocals **+3 semitones** with Rubber Band, keep the timing.
2. Normalise to 24 fps, at most 960 px, at most 30 s. Make a **coloured depth video** (Depth Anything, Replicate). Cut out the subject with **SAM 3** raw masks (Replicate) and composite the depth subject over the original background. Optional "fast" and "combined" modes track a **face mesh** locally instead or as well.
3. **A person must watch the whole mask video and approve it.** The approval is stored with a SHA-256 over the exact prepared files; any change invalidates it, and a submission without a valid approval is refused.
4. Upload the prepared video and the character reference to a public temporary host (Tmpfiles, Catbox), submit to **Enhancor's Seedance 2.5** (a third-party reseller API, `pass_faces: true`) as a **draft**, poll, download.
5. **Restore the entire original audio packets** onto the result (the generated audio is discarded). A draft is upgraded to **1080p only on a second, explicit approval**, which is a separate billed call.
6. Every provider response and request id is saved before anything else; a paid call is **never retried** after an ambiguous timeout.

## 2. What to take, and what to leave
| Idea in the repo | Take? | Why |
|---|---|---|
| **Staged pipeline with persisted artifacts**, resumable from any stage | **Yes** | Our jobs are single calls. Subject replacement needs stages that survive a restart. |
| **Review gate bound to artifact hashes** (approval dies if a byte changes) | **Yes, as a general mechanism** | The strongest idea in the repo and the same philosophy as our send authorisations (doc 46). Reusable for any expensive or sensitive step. |
| **Draft first, then an explicit second approval for the final render** | **Yes** | Cuts spend on the dearest step; fits the existing spend limit. |
| Never resubmit a paid request; save the id first | Already ours | Matches `uncertain` handling in doc 47. |
| **Original-audio restoration**, hold-the-last-frame to align duration | **Yes** | Directly improves our voice-synced ads (doc 48), where we had to re-mux by hand. |
| Vocal and music separation | **Optional** | Useful for ads built from existing footage. Needs a provider decision (section 5). |
| Depth plus SAM masks, face mesh | **Only as steps of a recipe** | They are the preparation. Prefer running them on ComfyUI (doc 49 has depth, SAM and Wan nodes) over a second provider. |
| Public temporary hosting (Tmpfiles, Catbox) | **No** | Private client footage must never go to a public host. We already have private Blob with signed links. |
| Cloudflared tunnel and webhook receiver | **No** | The cron poller we have is authoritative and needs no inbound traffic. |
| Enhancor as the generation provider | **Behind a flag, after review** | A reseller we have not vetted (terms, retention, data path, price claims in the README are marketing). Not the default. |
| Python, PyAV, local single-user server | **No (code)** | Different stack and no auth, no tenants. We take the design and rewrite the stages. |
| Rubber Band for pitch | **No** | GPL executable; ffmpeg can pitch-shift and keep timing. See section 4. |
| TEIN branding, example videos | **No** | Excluded from the MIT licence by the repo itself. |

## 3. Safety and rights: the part that gates everything
Replacing a person in footage with another identity is also how synthetic impersonation is made. This is a **product and legal risk, not a footnote**, and it decides whether the feature ships at all.
- **Consent attestation per job.** Before upload the user states, and we record with user, workspace, time and file hash, that they own or have written permission for the **source footage and every person in it**, and for **every identity reference** (a real person's likeness needs that person's consent). Stored, shown in the job, and part of the provenance record.
- **No ordinary-user replacement with a real, named person's likeness** unless the attestation says that person consented. Public-figure and minor detection is a P1 screen (face match against a block list, and age screening), and a hit blocks the job. Fail closed.
- **Provenance on every output.** The file carries a visible or embedded marker (C2PA manifest where our toolchain allows, plus a metadata tag and a line in the studio library), and the library keeps the attestation.
- **We do not build to evade a provider's safety filters.** The repo's recipe feeds the generator a *depth rendering* so the provider never sees the real face, and sets `pass_faces: true`. If a provider declines faces, we do not route around it with preparation tricks. Where a provider supports faces by contract, we use that contract and record it.
- **Voice.** Pitch shifting the vocals is part of the repo's recipe. We do not clone or alter a real person's voice without the same consent; the first release keeps the original audio untouched.
- **Who may use it.** Staff and the platform owner first, then paid workspaces that accepted the usage terms. Rate limits per workspace; every job auditable (doc 43's audit trail).
- The legal wording (terms, takedown route, EU AI Act transparency duties for synthetic media, right-of-publicity) needs counsel before any customer uses it. This spec lists the technical controls; it does not settle the legal position.

## 4. Licensing, stated plainly (verify before building)
- **The repo's code is MIT**: reusable with attribution, and we intend to reuse ideas, not files.
- **Its assets** (TEIN artwork, example videos) are explicitly excluded. Do not copy them.
- **Rubber Band** is GPL (a commercial licence exists). Calling it as a separate program on our own servers is not distributing it, but ffmpeg's `rubberband` filter has the same licensing and plain `asetrate`/`atempo` pitch shifting does not. Decision in section 8.
- **Model weights have their own terms.** Demucs code is MIT. **Depth Anything and Video-Depth-Anything weights differ by size** (the small ones Apache-2.0, the larger ones non-commercial, as we understand it; **to verify**). SAM 3 is under Meta's own licence (**to read**). Each model or hosted endpoint gets an entry in the licence register from doc 49 and only commercially usable ones are offered. This is a build gate.
- **Hosted providers** (Replicate, Enhancor, DashScope) carry their own terms on use of faces, retention and training. Read before sending any client footage.

## 5. Architecture
**5.1 Pipelines.** A pipeline is an ordered list of **stages**; a stage reads artifacts, writes artifacts and ends in a state. `ai_studio_jobs` stays as it is for single-call generation; a pipeline creates child jobs for the stages that call a model, so reservation, spend limits, `uncertain` handling and the poller are reused.
```
ai_studio_pipelines   id, scope, org_id, user_id, recipe_id, recipe_version, status, input_hash, consent_id, created_at
ai_studio_stages      pipeline_id, ord, kind, status, job_id?, started_at, ended_at, error
ai_studio_artifacts   id, pipeline_id, stage_ord, kind, blob_path (private), sha256, bytes, created_at
ai_studio_reviews     id, pipeline_id, stage_ord, artifact_set_hash, approved, note, reviewer, reviewed_at
ai_studio_consents    id, org_id, user_id, source_sha256, statement_version, subjects (text), created_at
```
All tenant-keyed, added to the registry and its snapshot test (doc 37).

**5.2 Stages for "Replace a subject".**
`ingest` (probe, limit 30 s, size and format checks, consent) → `audio_split` (optional) → `normalise` → `depth` → `mask` → `composite` → **`review` (human gate)** → `generate_draft` → **`approve_final` (human gate)** → `generate_final` → `restore_audio` → `deliver`. Each stage is idempotent on its artifacts: re-running a finished stage is a no-op; a failed one resumes.

**5.3 Review gate.** `artifact_set_hash` is the SHA-256 over the named artifacts of the stage. `generate_draft` refuses unless a review row exists with `approved = true` and the same hash. The reviewer sees the whole mask video and the composite (a player, not a thumbnail), and the page says what to look for (the repo's checklist: edges, hair, hands, spill, flicker, cuts). A reviewer is a person with the right on the workspace; the platform owner is firewalled from tenant footage like every other private record.

**5.4 Where the heavy stages run.** Vercel functions are the wrong place for ffmpeg and model calls that last minutes. Options: (a) the **same worker host as the ComfyUI gateway** (doc 49) with a small job runner, (b) a container service for ffmpeg stages, (c) hosted providers only for model stages and ffmpeg in a short-lived job runner. *Recommendation: (a) once the GPU host is chosen; until then (c) with ffmpeg in a container job.* Stages poll through the existing cron; the studio page shows stage progress.

**5.5 Providers behind one interface (doc 49 section 4).**
| Stage | Default | Alternative |
|---|---|---|
| depth, mask | a ComfyUI recipe on our GPU (Depth Anything and SAM nodes) | Replicate models, behind a flag, after the licence and data review |
| generate | **Qwen Cloud video editing / character replacement through the DashScope API** (Wan 2.x animate or VACE-style models; **availability, input limits and price to verify against the live API before committing**) | a ComfyUI Wan recipe; Enhancor Seedance as an optional adapter |
| audio | ffmpeg | none |
The reason for DashScope first: it is the provider we already integrate, run under our own key and terms, and it avoids adding a reseller that sees client faces.

**5.6 Media.** Everything in private Blob; provider fetches use short-lived signed links, never a public host. Deleting a pipeline deletes its blobs; retention follows the studio library rules. Artifacts of a rejected or abandoned pipeline expire after 14 days.

**5.7 Spend.** Every model stage reserves its estimated cost under the existing AI spend limit before it starts; the draft is the default, and the final render shows its own estimate on the approval screen. A pipeline never starts a second billed call without an approval row.

## 6. What the studio gains beyond this one feature
1. **Hash-bound approvals** usable for any step that costs money or exposes a person (ads that show a real face; long video renders).
2. **Draft then final** for long video: a short, cheap draft is approved before the 15 s render.
3. **Audio restored from the source**, with hold-last-frame alignment, in our voiced ads (`lib/ai/studio/wav.ts` and the compositing script become one tested stage).
4. **Resumable stages** instead of "uncertain" for multi-step work.
5. **A mask and review player** that other recipes (inpaint, doc 49 P2) need anyway.

## 7. Phases
- **P0, spike (about one week, no product change, no real people).** On consented footage of ourselves: run depth and mask on a GPU (or the Replicate models once), run one DashScope character-replacement call, one ffmpeg audio restore. Record seconds, cost, memory, failure modes, licences of every file, and **whether DashScope accepts and returns what we need**. Decide go or no-go from numbers.
- **P1, foundation.** The four tables and the consent table, the stage runner with idempotent stages, the review gate with hashes, ffmpeg stages (normalise, composite, audio restore, hold-frame), consent screen, provenance marker, block-list and age screen, platform flag `ai_studio_replace` (off, staff only). Tests per section 9.
- **P2, the recipe.** Depth, mask, review player, draft and final generation through the chosen provider, library and download with provenance. Staff only.
- **P3, polish and scale.** Optional audio separation, face-mesh mode if the P0 numbers justify it, queue and spend page in SAIL, nightly golden-clip evals.
- **P4, customers.** Terms and counsel sign-off, paid workspaces, rate limits, takedown route.

## 8. Decisions (founder, 2026-10-11)
1. **Ship person replacement to customers, together with the staged-pipeline foundation.** Built as one programme. The safety controls in section 3 are **not optional and not deferred**: consent attestation, likeness screening, provenance and the review gate ship with it. Enabling it for customers stays behind the platform flag `ai_studio_replace` until counsel has reviewed the terms and the transparency duties; the flag, not the code, is the legal gate.
2. **Qwen Cloud (DashScope) first.** The **Artlist MCP** (`https://mcp.artlist.io/mcp`) is noted: an MCP server is a tool for an agent in an editor, signed in as a person, so it cannot be a provider that Anker's production server calls. It stays a **manual or agent-assisted route** (for example stock footage or music for ads, used from VS Code) until Artlist offers an API with commercial terms for generated work. Nothing in production depends on it. Artlist content is licensed to the account holder, so redistributing it to our customers' videos needs its own licence check.
3. **Run it the cheapest way: no new infrastructure in P1.** Decided from the design, not from a price list (Runway was **not** priced):
   - **Artifacts and outputs in the private Vercel Blob we already run.** It is storage, not compute, and it is the cheapest place for this footage because it costs nothing extra to operate and keeps media under our own control.
   - **ffmpeg stages (ingest, normalise, composite, audio restore, hold-frame) run in Vercel functions** with the bundled ffmpeg, one stage per invocation, on clips of 30 s or less at 960 px, where each stage takes seconds to a minute. Heavier stages go to a job runner only if measured to exceed the function limit.
   - **Model stages are Qwen Cloud calls.** The Wan animate models take the source video and the character image directly, so **our own depth and mask stages are not needed for the first version** (section 5.2 shortens accordingly). The mask and depth recipes stay as a later option on ComfyUI.
   - **Runway** is not added now: it would be another third party seeing client faces and a second bill, and we have not priced it. Revisit only if Qwen's models fail the P0 quality bar.
4. **Keep the voice shifting**, with the same consent rule as the footage: the person whose voice is shifted is covered by the attestation, the shifted voice is never presented as that person's real voice, and the provenance record says the audio was altered. Implemented with ffmpeg pitch filters (no GPL dependency), with a measured comparison against Rubber Band quality in P0.
5. **Provenance:** both a visible or metadata mark and a C2PA manifest on final deliveries (recommended default, accepted by silence on this point; say if you want it narrower).
6. **First users:** staff and the platform owner, then paid workspaces behind the flag (recommended default, accepted by silence).

**Revised stage list for the first version** (decision 3): `ingest` → `normalise` → **`review` (the source, the character reference and the consent)** → `generate_draft` (Qwen animate model) → **`approve_final`** → `generate_final` → `restore_audio` (original audio, or the shifted vocals if chosen) → `deliver`. The review gate is bound to the hashes of the prepared video, the reference and the consent record; the mask review of section 5.3 returns if and when we add our own masks.

## 9. Tests and evals
Stage idempotency (re-run is a no-op; failure resumes at the right stage); review gate (refuses without approval, refuses after a one-byte change, accepts the exact hash); no paid call without an approval row; consent required and stored; block-list and age screen fail closed; provenance marker present on every delivery; signed-link-only fetches (no public host); tenant isolation on all new tables; ffmpeg audio restore produces byte-identical audio packets and aligned duration (golden clips); adapter contract tests with fake providers; nightly eval that no pipeline is stuck and that every model used appears in the licence register.

## 10. Not in scope
Real-time or live replacement; voice cloning; replacing people without consent attestation; accepting customer-written workflows; training identity models for customers; building to evade a provider's moderation; copying the repo's code or assets into ours.

## 11. P0 findings (2026-10-11)
- **The candidate Qwen models are recognised.** Posting an empty request to the DashScope video endpoint for `wan2.2-animate-mix`, `wan2.2-animate-move`, `wan2.1-vace-plus` and `wan2.7-videoedit` returned an account-status error, while an invented model name returned "Model not exist". That is evidence the four names exist on the international endpoint, **not** proof that they accept our inputs or give acceptable quality. No task was created and nothing was billed.
- **A key in the local environment file is refused for overdue payment** (`Arrearage`). That is the local `DASHSCOPE_API_KEY`, which may not be the key production uses (production reads the free-tier or standard key from the router configuration). It needs the account owner to check the Alibaba Cloud billing standing before any paid spike call. The production keys have not been probed.
- **Still to do in P0:** (a) confirm with a good key that an animate model accepts a 5 s clip and one character image and returns a usable result; (b) measure seconds, cost and quality; (c) compare ffmpeg pitch shifting against Rubber Band on a vocal sample; (d) read the DashScope terms on faces, retention and training; (e) read the licence of every file used. The paid call in (a) uses **our own consented footage** (a clip of the founder and an image the founder owns), not anyone else's.

## 12. Build status (2026-10-11)
**Slice 1 of P1, the foundation. No provider is called by any of it.** Migration `2026-10-11-ai-studio-pipelines` is applied to production: `ai_studio_consents`, `ai_studio_pipelines`, `ai_studio_stages`, `ai_studio_artifacts`, `ai_studio_reviews`, and the platform flag `ai_studio_replace` (**off**).
- `lib/ai/studio/pipeline/recipe.ts`: the recipe (`replace-subject` v1) and the rules by stage kind: which stages are gates, which are paid and which gate each paid stage needs.
- `consent.ts`: the attestation schema. Every statement must be true; the version, who gave it, the hash of the footage and the reference images, and whether the voice is altered are stored. Read-only members cannot give it.
- `review.ts`: the hash-bound gate. The reviewed set is every file produced before the gate **plus the consent record**, so a changed file or a changed consent voids the approval. A decision on stale files is refused. Approving completes the gate stage; rejecting ends the pipeline.
- `runner.ts`: creates a pipeline under a consent (one consent, one pipeline; a request key makes a repeat call return the same pipeline), runs the next unfinished stage exactly once (a pending-to-running claim stops a double start), never runs a gate, **refuses a paid stage without its approval**, and **never retries a failed paid stage**.
- Tenant registry: pipelines and consents are exported and erased with the workspace, and files held in Blob by pipelines are erased with it (`mediaRefs` in the executor); the child tables are classified as cascade children.
- 20 integration tests on PGlite with the real migration cover: the full attestation, consent per person and workspace, stage order, no double start, review on stale files, approval of the exact files, a one-byte change voiding it, a consent change voiding it, rejection ending the pipeline, the final approval, no automatic retry of a paid stage, isolation between workspaces, the flag, and the set hash. Full suite: 1567 tests pass.

**Not built yet (next slices):**
1. **Slice 2, stages and routes:** the ffmpeg stages in Vercel functions (ingest checks, normalise, audio restore with hold-frame alignment, voice shift), Blob storage of artifacts with signed fetch links, HTTP routes for consent, create, review, run and status, behind `replaceEnabled`.
2. **Slice 3, the generation stages:** the Qwen animate call as a child job under the existing reservation, spend and `uncertain` handling. **Blocked on the P0 spike** (section 11): the model's inputs and quality are not yet verified.
3. **Slice 4, the person-facing screens:** consent, review player with the exact-files hash, draft and final approval, library with provenance.
4. **Slice 5, the safety screens:** likeness and age screen, provenance mark and C2PA on deliveries.
Customers cannot reach any of this: no route exists yet, and the flag is off.
