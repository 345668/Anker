# 49. Spec: ComfyUI behind the Anker Media Studio

Status: **spec for decision, nothing built.** Source analysed: <https://github.com/comfy-org/comfyui> (GPL-3.0, about 137k stars, stable releases roughly every two weeks) and its server and Comfy Cloud documentation, 2026-10-09. Builds on docs 47 and 48.

## 1. What ComfyUI is, in terms that matter here
A backend that runs **node graphs** ("workflows") for diffusion and other generative models, with a web UI on top. For Anker the UI does not matter; the **server and its graph format** do.
- **Graph in, files out.** A workflow in *API format* is a JSON object `{ "<node id>": { "class_type": "...", "inputs": { "...": value | ["<node id>", output index] } } }`. `POST /prompt` queues it and returns a `prompt_id`; `GET /history/{prompt_id}` reports the result and the output file names; `GET /view?filename&subfolder&type` serves a file; `POST /upload/image` takes inputs; `GET /queue`, `POST /interrupt`, `GET /object_info` (every node and its inputs), `GET /system_stats`; `/ws` streams `execution_start`, `executing`, `progress`, `executed`, `execution_error`.
- **Models.** Image: Qwen-Image, Flux.1 and 2, SDXL, SD3.5, Hunyuan Image and others. Editing: Qwen-Image-Edit, Flux Kontext. Video: Wan 2.1 and 2.2, LTX-Video (with audio variants), HunyuanVideo, CogVideoX, Mochi. Audio: ACE-Step, Stable Audio. Also 3D, segmentation and depth. Weights are downloaded separately, are large (several to tens of GB each) and each has its own licence.
- **Building blocks Anker lacks today:** LoRAs (style and subject adapters), ControlNet and depth/pose guidance, inpainting and outpainting with masks, upscaling and face restoration, image-to-video and first/last-frame video, video extension, batch and seed sweeps, node-level caching (only changed parts re-run), and a way to chain steps (image, then edit, then animate, then upscale) in one job.
- **Partner (API) nodes.** Optional nodes that call third-party paid models through Comfy's service. They send prompts and media to outside parties and are disabled with `--disable-partner-nodes` or `--offline`.
- **Extension model.** Custom nodes (community code, each with its own licence), managed by ComfyUI-Manager when enabled.
- **Hardware.** NVIDIA (CUDA), AMD (ROCm), Intel Arc, Apple Silicon (Metal) and CPU. Memory streaming runs large models on small GPUs, slowly.
- **Comfy Cloud.** A hosted ComfyUI: base `https://cloud.comfy.org`, `X-API-Key` header, paid subscription required for API access, stateful (assets, queue, installed models). Concurrency limits, pricing and data-retention terms are **not stated in the pages read** and must be confirmed before any client material is sent.

## 2. What the studio does today and where it stops
Qwen Cloud (DashScope) text-to-image, image edit, and Wan 2.7 / HappyHorse video with a voice track (docs 47, 48). It is excellent for speed and needs no GPU, but: one model call per job with no chaining; no LoRA, ControlNet, masks, upscaling or video extension; no control over weights, versions or cost per image; every prompt and image goes to a third party; and long videos take 12 to 15 minutes in the provider's queue.

## 3. Licensing, stated plainly
- ComfyUI is **GPL-3.0**. Running it as a **separate service that Anker calls over HTTP is not "conveying" it** (the licence says mere network interaction is not), so Anker's own code stays proprietary. The condition is that **no ComfyUI source is copied into the Anker repository** and nothing is linked into Anker's process. The Anker side is a client that speaks the documented HTTP API.
- **Custom nodes and model weights have separate licences.** Several popular weights are non-commercial (for example Flux.1 [dev]); others are permissive (Qwen-Image and Wan are Apache 2.0). Because the studio makes marketing material for paying customers, every model and node gets an entry in a **licence register**, and only commercially usable ones are offered. This register is a build gate, not a footnote.
- Any workflow templates Anker writes are Anker's. Templates copied from the community keep their own terms and are recorded.

## 4. Architecture
```
Browser ─ studio form (rendered from a recipe's declared inputs)
   │
Anker (Vercel) ── createJob ── reserve (unchanged) ── ProviderAdapter.submit
   │                                                    ├─ dashscope  (today)
   │                                                    └─ comfy      (new)
   │                                                          │  HTTPS, API key, private network
   │                                                    Gateway (auth, route allow-list, rate limit)
   │                                                          │
   │                                                    ComfyUI worker(s) on GPU
   └─ cron /api/cron/ai-media ── ProviderAdapter.status ── fetch outputs ── private Blob (unchanged)
```
1. **Provider adapter interface.** Today `submitGeneration` and `generationStatus` are DashScope functions. They become an interface with `submit(job) → providerRef`, `status(providerRef) → { state, outputs[] }` and `cancel`. `provider_id` already carries a prefix (`task:` or `img:`); Comfy adds `comfy:<prompt_id>`. Reservation, limits, polling, saving, the never-resubmit rule and roles are unchanged.
2. **Recipes, not free workflows.** A *recipe* is a versioned, reviewed API-format workflow with **named parameter slots** and a declared schema: inputs (prompt, negative prompt, seed, size, source image, mask, audio, LoRA choice, strength), limits (sizes, durations), required nodes and models, licence tag, expected seconds, and cost class. The studio form is **generated from the schema**, so adding a recipe adds a capability without UI code. The server fills slots and submits; **users never submit graphs.** Initial recipes: `image.qwen-image`, `image.edit.qwen-image-edit`, `image.upscale`, `image.inpaint`, `video.wan22.t2v`, `video.wan22.i2v`, `video.extend`, `image-to-video.chain` (generate, then animate), `audio.music.ace-step`.
3. **Job lifecycle on ComfyUI.** Submit `POST /prompt` with `client_id` and a **caller-chosen `prompt_id`** (the studio job id), so a job can always be found again. *The spike (section 11) showed that resubmitting the same `prompt_id` queues it a second time, so it is not idempotent: after an ambiguous submit the adapter looks the id up first and only then decides.* Poll `GET /history/{prompt_id}` from the existing one-minute cron (Vercel cannot hold a WebSocket; `/ws` is kept for a future live progress bar through a small relay). Fetch outputs with `/view`, validate by file signature, size and type exactly as now, then store privately. Ambiguous submits stay `uncertain` unless the `prompt_id` lookup settles them.
4. **Inputs.** Uploaded images and audio are pushed to the worker with `POST /upload/image` under a per-job name, never by a path the user supplies; masks are produced by the studio's own mask editor and uploaded as images.
5. **Where it runs.** Three options, decided in section 9:
   - **A. Comfy Cloud**: no GPU operations; paid API key; data terms to confirm.
   - **B. Self-hosted GPU** (own box, or a GPU cloud such as RunPod or Modal): full control and data residency; Anker operates it.
   - **C. Both**: Cloud for bursts and early work, self-hosted for steady load and sensitive material. The adapter hides the difference.

## 5. Security (the part that cannot be skipped)
ComfyUI has **no authentication** and its API can execute any installed node, read and write files on the worker, and load custom-node routes. So:
1. **Never expose it to the internet or to the browser.** Only the Anker server reaches it, over a private network or an authenticated tunnel, **through a gateway** that requires an API key, allows only `/prompt`, `/history`, `/view`, `/upload/image`, `/queue` (read) and `/system_stats`, refuses `/interrupt` and queue edits except from an admin path, caps body sizes and rates, and logs every call.
2. **Server-side recipes only.** No user-supplied graph, node name, file path or URL reaches the worker. Slot values are typed and bounded (lengths, enums, integer ranges); text is never interpolated into node names.
3. **Pinned and minimal.** Pin ComfyUI to a release commit and every custom node to a commit hash; install only reviewed nodes; keep `--enable-manager` off in production; start with `--disable-partner-nodes` unless a partner node is deliberately adopted and its data flow documented; no outbound network from the worker except to the model host during provisioning.
4. **Isolation.** One container per worker, non-root, read-only image, a scratch volume wiped between jobs, no secrets in the container, no access to Anker's database or Blob token. Outputs leave only through `/view` to the gateway.
5. **Moderation.** Open models have **no built-in content safety**; DashScope screens prompts and results. Self-hosted jobs therefore need an explicit step: a prompt screen before submit and an image or frame classifier before a result is saved or shown, failing closed (`blocked`). This is a release gate for any recipe that accepts free text.
6. **Supply chain.** Model files are downloaded by hash from approved sources into a read-only store; new custom nodes go through the same review as a code dependency.

## 6. What it adds, concretely
| Capability | Today | With ComfyUI recipes |
|---|---|---|
| Brand-consistent look | prompt wording only | workspace style LoRAs chosen from a reviewed list |
| Fix part of an image | regenerate everything | masked inpaint and outpaint |
| Resolution | provider size table | upscale and face restore as a step |
| Video length | up to 15 s, one shot | extend, first/last frame, chain image to video |
| Reproducibility | seed on video only | seed and pinned model version recorded on every job |
| Steps in one job | one call | image, edit, animate, upscale as one queued recipe |
| Cost per output | provider list price | GPU seconds measured per job |
| Data path | prompt and media leave to a third party | stays on Anker-controlled GPUs (option B) |
| Time to a 15 s clip | 12 to 15 minutes in a shared queue | set by our own GPU; to be measured in P0 |

## 7. Phases
- **P0, spike (one week, no product change).** One GPU (an Apple-Silicon machine is enough for a first image test; a rented NVIDIA card for video). Run ComfyUI at a pinned release, drive it with a script through the gateway pattern, and measure three recipes: Qwen-Image text-to-image, Wan 2.2 image-to-video, an upscaler. Record seconds per output, memory, failure modes, determinism for a fixed seed, and the licence of every file used. Confirm `prompt_id` idempotency and `/history` output shapes on the pinned version. Read Comfy Cloud's retention and concurrency terms and price a month.
- **P1, adapter and three recipes.** Provider interface, `comfy` adapter, gateway, licence register, moderation steps, recipe schema and the schema-driven form. Behind a platform flag (`ai_studio_comfy`), off by default, staff-only first. Migration adds `provider` and `recipe_id` and `recipe_version` to `ai_studio_jobs`.
- **P2, edit tools.** Mask editor, inpaint and outpaint, upscale, image-to-video chaining.
- **P3, consistency and length.** Style LoRAs, character consistency through edit models, video extension, audio recipes (music; talking-video with LTX audio variants where the licence allows).
- **P4, scale and cost.** Autoscaling workers, GPU-second metering into the existing AI spend limit, SAIL page for queue depth and failures, nightly golden-prompt evals per recipe version.

## 8. Tests and evals
Recipe schema validation (every slot typed and bounded); a golden-prompt set per recipe checked for output type, size and a perceptual hash within tolerance for a fixed seed and pinned version; gateway route allow-list; "no user text reaches a node name" property test; moderation fail-closed test; adapter contract tests with a fake ComfyUI server; the existing studio tests unchanged; a live evals check that no `comfy` job is older than the stuck threshold and that every recipe's models appear in the licence register.

## 9. Decisions for the founder
1. **Where to run it for P0 and P1:** Comfy Cloud (fastest, no GPU operations, terms to confirm), or a rented GPU. *Recommendation: P0 on a rented GPU and a Cloud trial side by side; decide on the measured numbers.*
2. **Which models are acceptable:** commercially licensed only (recommended), or also non-commercial ones for internal drafts.
3. **Budget:** a monthly GPU ceiling for P0 to P1, and whether partner nodes (third-party paid models through Comfy) are ever allowed.
4. **Moderation bar** for free-text recipes on self-hosted GPUs.
5. **Who may use it:** staff and the platform owner first, then paid plans.

## 10. Not in scope
Training LoRAs for customers; exposing ComfyUI's own interface to users; accepting customer-written workflows; real-time streaming generation; replacing DashScope (it remains the default and the fallback).

## 11. P0 spike results, 2026-10-10 (real ComfyUI, no model weights)
Run: ComfyUI **v0.39.2** (commit `3c1b7a17fdf2…`) on an Apple-Silicon Mac, CPU mode, `--disable-all-custom-nodes --disable-api-nodes`, driven with model-free nodes (`EmptyImage`, `SaveImage`) so the API contract could be tested without GPU or weights. Not measured here (needs a GPU and weights): seconds per output, memory, determinism, model licences in use.
- `POST /prompt` accepts a caller-chosen `prompt_id` and returns it with `number` and `node_errors`. **Resubmitting the same id is accepted and queued again** (`number` 1): not idempotent.
- **`GET /api/jobs/{id}`** returns one record with `status` (`completed` seen; pending, in progress, failed, cancelled expected), timestamps, `outputs_count`, `outputs` and `execution_status`. It is the primary status call; `/history/{id}` plus `/queue` is the fallback for older versions. `/history/{unknown}` answers **200 with `{}`**, not 404.
- `GET /history/{id}`: `{ outputs: { "<node>": { images: [{ filename, subfolder, type }] } }, status: { status_str, completed, messages } }`. `GET /view?filename&subfolder&type` returns the file (PNG signature seen).
- Validation failures are **400 with `node_errors`** (unknown node `missing_node_type`; out-of-range value `value_smaller_than_min`): certain failures, nothing ran.
- `POST /upload/image` (multipart `image`, optional `overwrite`) returns `{ name, subfolder, type }`.
- **Routes the gateway must refuse** (all present in this release): `/userdata*`, `/users`, `/settings*`, `/models*`, `/experiment/models*`, `/extensions`, `/free`, `/history` (POST), `/interrupt`, `/queue` (POST), `/api/jobs/cancel`, `/view_metadata/*`, `/object_info` (reveals installed nodes), `/upload/mask` unless used.
- Server start-up was clean with custom nodes and partner nodes off; RAM use is modest without models. A real model run needs a GPU host (next step).
Decision recorded: the studio uses the job id as `prompt_id`, polls `/api/jobs/{id}`, and treats "not found" after the reconcile window as "not accepted, nothing to pay for".

## 12. Build status (2026-10-10)
**Built and tested (P1, behind the platform flag `ai_studio_comfy`, off in production; migration `2026-10-10-ai-media-studio-comfy.sql` applied):**
- `services/comfy-gateway`: API key, route allow-list (the routes in section 11 are 404), workflow validation against a node allow-list, size and rate limits, body-free logs, admin-only interrupt and cancel. 8 tests.
- `lib/ai/studio/comfy/`: licence register (a non-commercial model can never be offered), recipe schema and slot filler (typed and bounded; text stays text), client for the gateway (https required except on this machine), moderation gate that **fails closed** (free-text recipes stay off until screening exists), a model-free smoke test.
- Provider facade, job lifecycle and cron: a self-hosted job uses its id as the worker's prompt id, results arrive as bytes and are saved privately, an unconfirmed submit is settled by asking the worker (found: queued; missing for five minutes: it never arrived, nothing owed), refused prompts become `blocked`. Jobs record `provider`, `recipe_id` and `recipe_version`. A live eval checks that and that none is stuck.
- **Verified end to end against real ComfyUI v0.39.2 through the gateway** with the smoke recipe: `PASS 538 ms 512x288 PNG`. Gateway against the real worker: `/userdata` and `/object_info` are 404, a `LoadImage` workflow is refused.
- Anker tests: 72 studio tests (including 7 on the self-hosted path), 14 on recipes, client, screening and smoke.

**Not done, needs a decision or hardware:** a GPU host and weights (decision 1); the Qwen-Image and Wan 2.2 recipes stay `draft` until run there, so **no recipe is offered to customers yet**; the content screens (decision 4); inpaint, upscale, LoRA, extend and chaining recipes (P2 onward); GPU-second metering and the SAIL page (P4); Comfy Cloud adapter (only if chosen in decision 1).

## 13. Option B in detail: renting a GPU (kept in the spec; decision 1 is still open)
Everything from section 4 is the same on rented hardware; only where the worker runs changes. This section is what has to be true to choose it.

### 13.1 What the models need (from ComfyUI's own tutorials, read 2026-10-10)
| Recipe | Weights | Memory and speed on record | Consequence |
|---|---|---|---|
| Qwen-Image text-to-image (fp8) | diffusion model 20.4 GB (fp8) or 40.9 GB (bf16), plus a text encoder and a VAE | on an RTX 4090-class 24 GB card it used about 86% of VRAM; 94 s first run, 71 s warm; 55 s then 34 s with the 8-step "Lightning" LoRA; the distilled fp8 model (about 15 GB, 15 steps) ran 69 s then 36 s | a **24 GB card is the floor** for images; the first run after a cold start is slower because weights load |
| Wan 2.2 TI2V-5B (video, text or image) | 5B hybrid model | documented to fit **8 GB** with ComfyUI's native offloading (slow) | the cheapest video path; quality below the 14B models |
| Wan 2.2 T2V-A14B and I2V-A14B | 14B models | the tutorial gives no tested GPUs or times; fp8 repacks and community GGUF files exist for smaller cards | **needs measuring in P0**; plan on 48 GB or more for comfortable 720p, and on minutes per clip |
Unknown until the spike: time per 5-second clip, the largest clip that fits, and whether a 24 GB card is enough for the 14B models with fp8 and offloading. These numbers set everything below.

### 13.2 Shapes of rented capacity
1. **Always-on single GPU** (a rented box by the hour or month). Simplest: models stay on the disk and in memory, no cold start. Cost is paid whether or not anyone generates. Fits a steady load and the P0 and P1 phases.
2. **Serverless GPU** (a worker that starts per job or per burst and stops after it idles). You pay for seconds used, but each cold start loads tens of GB of weights from a network volume, which can add minutes to the first job. Needs weights on a persistent volume in the same region and a keep-warm window.
3. **Reserved or dedicated** (a contract for a card or a server). Cheapest per hour at high use; only after P3 shows the load.
Recommendation: **start with one always-on card for the spike, then decide between shapes 1 and 2 on the measured job rate and the cold-start time**, not on list prices.

### 13.3 Choosing a provider: the questions that matter
- **Data location and terms.** Anker is a German platform with EU customers: where does the host run, is there an EU region, does the provider process or keep inputs and outputs, and will it sign a data-processing agreement. Customer images and prompts must not leave the chosen region.
- **Network isolation.** A private network or tunnel so only the gateway reaches the worker (section 5 depends on this); no public port for ComfyUI itself.
- **Persistent storage** for the model store, large enough for the models in use (plan on 100 to 200 GB for two image models, two video models and their text encoders), in the same region as the GPU.
- **Image control.** Run a container that Anker pins (ComfyUI release, nodes, weights by hash), not a provider's mutable template.
- **GPU supply.** Availability of 24 GB and 48 GB or larger cards at the hour they are needed, spot versus on-demand interruption, and how the provider behaves when a card is not available.
- **Billing and limits.** Per-second or per-hour billing, minimums, egress charges, and a hard spending cap on the account.
- **Support and exit.** How quickly a stuck host is replaced, and how the whole stack moves to another provider (it must: weights and recipes live in Anker's control, the worker is a container).
Candidate types to quote: GPU marketplaces and serverless GPU platforms, the big clouds' GPU instances, and European GPU hosts. Prices move; **collect written quotes for the same three workloads during P0** rather than relying on any list here.

### 13.4 Cost model (to fill with measured numbers)
- **Per job:** GPU seconds x price per second, plus a share of idle and warm-up time. Record GPU seconds on every job so this is measured, not estimated.
- **Per month:** (always-on hours x hourly price) + storage + egress, or (jobs x average GPU seconds x price) + keep-warm. Compare both against the DashScope price list for the same outputs (for example about $0.035 per Qwen-Image 2.0 image and roughly $0.10 to $0.15 per video second at list price) to find the monthly volume where renting pays off. Below that volume the hosted route is cheaper and simpler; above it self-hosting wins; data-location needs can override the arithmetic.
- **Guardrails:** a monthly GPU ceiling (decision 3), an account-level hard cap at the provider, and the existing `ai_spend_usd_month` workspace limit extended to count GPU seconds (P4).

### 13.5 Operating it
- **One container image**, built from the pinned ComfyUI release, with the gateway in front (`infra/comfy/`). A second tiny health container is not needed: `GET /health` on the gateway plus the smoke recipe cover it.
- **Provisioning script** that creates the model volume by downloading each file by SHA-256 from its approved source and refusing anything unlisted, so a rebuilt worker is identical.
- **Observability:** the gateway's request log (no bodies), per-job GPU seconds and queue wait written to the job row, the live eval that flags stuck jobs, and a SAIL page for queue depth and failures (P4).
- **Failure handling:** a worker that dies mid-job leaves the job unsettled; the cron's reconcile step and the one-hour stuck check handle it; a job is never resubmitted automatically.
- **Updates:** ComfyUI is updated on a schedule, not on its release day: a new pinned image runs the smoke recipe and the golden-prompt set on a spare worker before traffic moves.

### 13.6 The GPU spike, step by step (P0, when a host is chosen)
1. Rent one 24 GB card and one 48 GB or larger card for a day each, in the intended region, with a persistent volume.
2. Start the pinned image behind the gateway; run `npx tsx scripts/ai/comfy-smoke.mts` (expect PASS).
3. Download the Qwen-Image fp8 files and the Wan 2.2 files by hash; add their exact file names and licence text to `licences.ts`.
4. Run each draft recipe at three sizes and three seeds; record cold and warm seconds, peak memory and any error; confirm a fixed seed and pinned image give the same picture.
5. Run the 14B video recipes at 5 s and 10 s on both cards; record the largest clip that fits and the time.
6. Run the same prompts through DashScope and compare cost, time and quality side by side (a short written comparison with the pictures).
7. Fill the cost model in 13.4 from the measurements and write down the break-even volume.
8. Mark the recipes that passed as `verified` (still behind the flag) and keep the report with the repo.
Exit criteria for choosing self-hosting: a verified recipe, a measured cost per output below the hosted route at an expected volume or a data-location reason, the screening hook in place, and a working failure drill (kill the worker mid-job and confirm the job settles).
