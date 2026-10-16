# 53. Spec: an open-weights lane (self-hosted language models)

Status: **spec for later. Nothing is built, and nothing should be until the P0 test (section 8) has produced numbers.** Builds on docs 35 (Qwen first), 41 (entitlements), 49 (the ComfyUI gateway and the GPU decision) and 52 (credits). Raised by the founder on 2026-10-16, after the newsroom's Mistral model was archived under us.

## 1. What we have, and what the idea changes
- **A provider router** (`lib/ai/model-router.ts`, `lib/ai/provider.ts`) that already treats **Ollama** as a provider, with a model per tier (`OLLAMA_MODEL_FAST`, `_BALANCED`, `_DEEP`, `_REASON`) and per task (`OLLAMA_MODEL_TASK_<TASK>`).
- **Qwen lanes** (doc 35, `lib/ai/qwen-lanes.ts`): a free-tier lane first, a token-plan lane as backup, each model skipped when its allowance is spent. The portal's newsroom uses the same lanes (`~/SAIL/lib/qwen-lanes.ts`).
- **A gateway pattern** for a self-hosted worker (doc 49, `services/comfy-gateway`): an API key, a route allow-list, size and time limits, no direct exposure of the engine.
- **A recent lesson:** a hosted model can disappear. Mistral archived the model our stored key used, and the newsroom stopped. Today every lane is someone else's hosted API.

The idea: add a lane that calls **open-weights models we run ourselves**, through an OpenAI-style API on a gateway. Anker would then be able to say that a workspace's data never leaves infrastructure we control, and would no longer depend on any one provider for every task.

## 2. Why, and why not yet
**For.** (1) **Privacy as a product feature**: fund and LP data, decks and call transcripts stay on our side. (2) **Independence**: a third lane that no provider can archive or rate-limit. (3) **Cost at volume** for small, frequent tasks (classifying replies, one-line match rationales, URL classification).
**Against, today.** Cloud spend is near zero (free tier plus the token plan) and traffic is small, so a GPU that is always on costs more than it saves. Small open models are good at classification and short summaries and noticeably weaker at long, accurate writing and tool use. Running a server is real work for a team of one founder and Claude. Licences vary by model.
**So:** build it as an **extra lane for chosen tasks**, switched on by evidence, never as a replacement for Qwen cloud.

**Start when any one is true:** a design partner or customer asks for a private mode; the monthly cloud AI bill passes a ceiling the founder sets; a provider outage or archive stops a feature twice; or a GPU host has been chosen for ComfyUI (doc 49), which removes most of the fixed cost.

## 3. Words used here
- **GPU host**: a rented GPU, by the second or the hour (a RunPod-style service; "Runway" is a video-AI company, not a host).
- **Serving engine**: the program that loads the model and answers requests. **vLLM** (or SGLang) for production throughput and an OpenAI-style API; **Ollama** for a first test or a small box; **LM Studio** is a desktop app and is **not** used for serving.
- **Gateway**: our own thin service in front of the engine. The engine is never reachable from the internet. (Ollama has no login by default, and exposed Ollama servers are a common security finding.)
- **Lane**: one credential-and-endpoint route a task may use, tried in a stated order.

## 4. Architecture
**4.1 Serving.** One GPU host, region in the EU, running vLLM with an OpenAI-compatible server. One model per replica, quantised (AWQ or FP8) to fit the card. Weights come from the official repository, are pinned by checksum, and are recorded in the licence register (section 6). Scale-to-zero (pay per second) for the test; a keep-warm window on working hours if cold starts hurt (a cold start is expected to cost one to two minutes, to be measured).
**4.2 Gateway.** Reuses the doc 49 pattern: API key per consumer (the Anker app, SAIL), allow-list of exactly `GET /v1/models`, `POST /v1/chat/completions` and `POST /v1/embeddings`, a request size cap, a time cap, a per-key rate limit, TLS, and a health route that reports model loaded or cold. **No prompt or output is logged**; only counts, timings and status. Keys live in the platform key store, never in code.
**4.3 The lane.** A new provider, `openweights`, beside `ollama`, with its own base URL and key and one model per tier (`OPENWEIGHTS_MODEL_FAST`, `_BALANCED`). It plugs into the existing lane logic so it can sit first, second or last for a task. Settings live on SAIL's AI configuration page like the Qwen lanes.
**4.4 Routing policy.** Per task, an ordered list of lanes:
- **Fast tasks** (reply classifier, "why this investor" line, URL classifier, firm disambiguation): open-weights first when healthy, then Qwen free, then Qwen plan.
- **Writing and reasoning tasks** (newsroom drafts, deck critique, deep research, campaign readiness): Qwen first. Open-weights only if the evals pass for that task.
- **Private mode** (a workspace entitlement, `private_models`, doc 41): every task that touches that workspace's private records uses the open-weights lane **only and fails closed**: if it is down or cold, the person sees a clear message and nothing is sent to a third-party model. This is the premium behaviour and the reason to build the lane.
**4.5 Health and fallback.** A circuit breaker marks the lane down after repeated failures or timeouts and retries on a schedule. A cold lane is not an error: the first call waits up to a stated budget, then falls back (outside private mode). Every call records the lane and model it used (as the newsroom audit entry does now).
**4.6 Cost and credits.** GPU seconds are metered per call and added to the AI spend ceiling (doc 41). Studio credits (doc 52) are unaffected: they price image and video generation, not text.

## 5. Which models
Candidates, to be confirmed against the evals and the licence check, not chosen here: current **Qwen3 instruct** sizes (8B to 32B) because the rest of Anker is tuned for Qwen, **Mistral Small**, and one more family for comparison. Selection criteria: valid JSON on our prompts, context length for decks and call notes, German and English quality, speed on one card, and a licence that allows commercial use for paying customers without conditions we cannot meet. Embeddings may use a small open model too (the current embedding setup is separate; this is only an option).

## 6. Licences and provenance
Every model gets an entry in a **licence register** (the pattern of `lib/ai/studio/comfy/licences.ts`): name, version, source, checksum, licence text link, commercial use allowed, conditions (for example attribution or user-count limits). A task may use a model only if its entry says yes. Some well-known open licences carry restrictions (some Llama-family terms, for example), so "open weights" does not by itself mean "free to use in a product". Counsel reads the register before private mode is sold.

## 7. Security and privacy
- The engine and the host's management ports are not reachable from the internet; only the gateway is.
- The GPU provider is a processor: a data-processing agreement, EU region, no training on our traffic, no retention of requests, confirmed in writing before any customer data is sent. Until then the lane may carry **our own test data only**.
- vLLM's prefix cache is shared across requests, which can leak timing information between tenants. In private mode it is switched off or the cache is keyed per workspace. To be settled in P1.
- No customer prompt, output or document is written to the host's disk by our code. Model files only.
- Keys are rotated on a schedule and revocable in SAIL. The gateway refuses a request without a key before it reaches the engine.

## 8. Evals and the first test
**Task suites** from the prompts we already run: reply classification, rationale lines, URL classification, DM personalisation, campaign draft (JSON), deck extraction (JSON), newsroom draft. Each suite is a fixed set of real or realistic inputs with the expected shape.
**Measures:** valid-JSON rate; agreement with Qwen cloud's answer on classification tasks (as a reference, not as truth); a human check of 30 samples per writing task; latency p50 and p95 including a cold start; cost per 1,000 requests; and failures by kind.
**Adoption bars (to be confirmed with the founder):** at least 95% valid structured output, at least 90% agreement on classification, no writing regression flagged in the human check, p95 latency inside the budget of the feature.
**P0, one week, no product change:** a serverless GPU, vLLM, three candidate models, the suites above, and a cost sheet. Our own data only. Output: the numbers, and a go or no-go per task.

## 9. Phases
- **P0, test** (above). Budget ceiling set by the founder.
- **P1, lane and gateway** behind a platform flag (`ai_openweights`, off), staff only, fast tasks only, with the licence register and the health breaker.
- **P2, private mode** for one design partner, under the entitlement, after the data-processing agreement and the cache question are settled.
- **P3, tuning.** A small LoRA on an open model for Anker's voice and structured tasks, once there are a few hundred reviewed examples (newsroom edits and approved drafts are a natural source). Not before.
- **P4, scale and visibility:** autoscaling, GPU-second metering into the spend ceiling, a SAIL page for lane health and latency, nightly evals per model version.

## 10. The cost question, to fill from P0
Monthly self-hosted cost = GPU hours billed × hourly price (or GPU seconds × per-second price) + gateway hosting. Monthly cloud cost for the same tasks = requests × tokens × the Qwen price (near zero on the free tier). Self-hosting pays on cost alone only when the cloud bill for the moved tasks exceeds the GPU bill, and it pays on privacy the day a customer asks for it. P0 records the real numbers for both sides. No price in this document has been checked.

## 11. Decisions for the founder
1. **The GPU host and region**: one decision shared with doc 49 (ComfyUI).
2. **A budget ceiling for P0.**
3. **Which tasks go first** (recommended: the four fast tasks).
4. **Whether private mode is a product feature** to sell, and to whom first.
5. **The licences you will accept** (commercial-friendly only is recommended).

## 12. Not in scope
Training a model from scratch; offering our models to customers as an API; replacing Qwen cloud; LM Studio in production; serving customers before the processing agreement exists.
