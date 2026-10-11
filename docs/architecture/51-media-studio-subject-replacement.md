# 51. Spec: subject replacement and staged video pipelines in the Anker Media Studio

Status: **spec for decision, nothing built.** Source analysed: <https://github.com/345668/Genjustsu-Open-Source-Workflow> (MIT, about 1,200 lines of Python, last push 2026-10-08, 0 stars), cloned and read on 2026-10-11. Builds on docs 47, 48 and 49.

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

## 8. Decisions for the founder
1. **Go or no-go on person replacement as a customer feature** after reading section 3. *Recommendation: build the pipeline foundation (section 6 gains) regardless; keep the replacement recipe staff-only until counsel has signed off.*
2. **Generation provider:** DashScope first (recommended), a ComfyUI Wan recipe later, Enhancor only after a vendor review.
3. **Where the heavy stages run** (section 5.4) and the monthly ceiling for the P0 spike.
4. **Pitch shifting of voices:** leave out of the first release (recommended), or build it behind the same consent rule.
5. **Provenance:** C2PA manifests (more work, better evidence) or a visible mark plus metadata (simpler). *Recommendation: both on final deliveries.*
6. **Who may use it first:** staff and the platform owner only (recommended) or the two design partners as well.

## 9. Tests and evals
Stage idempotency (re-run is a no-op; failure resumes at the right stage); review gate (refuses without approval, refuses after a one-byte change, accepts the exact hash); no paid call without an approval row; consent required and stored; block-list and age screen fail closed; provenance marker present on every delivery; signed-link-only fetches (no public host); tenant isolation on all new tables; ffmpeg audio restore produces byte-identical audio packets and aligned duration (golden clips); adapter contract tests with fake providers; nightly eval that no pipeline is stuck and that every model used appears in the licence register.

## 10. Not in scope
Real-time or live replacement; voice cloning; replacing people without consent attestation; accepting customer-written workflows; training identity models for customers; building to evade a provider's moderation; copying the repo's code or assets into ours.
