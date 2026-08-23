# Agent Tooling Expansion — full persona coverage + a Phiner-style data-room refinery

*Goal: expand the agent tool belt so a Founder / VC-GP / LP copilot can perform **any**
action its human counterpart would — outreach, investor/firm DB query + export, document
creation (Word / LaTeX / LibreOffice), and **acquisition data-room cleaning** — grounded
in the [Phiner](https://phiner.ai) principle: **the model suggests, the sealed engine
computes, a person approves only what doesn't tie**, and every figure traces to its
source. Companion to `anker-agentic-deepseek-plan.md` (engine-verifier) and
`anker-plugins-and-model-skills.md` (skills/presets).*

## The organizing principle (from Phiner)
> "No model ever writes a final number. The model suggests, the sealed engine computes, a
> person approves only what doesn't tie." Every figure recomputed exactly, with a trace to
> its source file. Anything uncertain goes to a person, once — then it's a permanent rule.

Anker already has the two hard parts: **deterministic engines** (`lib/modules/*`:
409A/OPM, loan amortization, vesting, fund TVPI/IRR, waterfall) and the **agent-verify**
skill. We extend that pattern from "verify a number the agent stated" to "**rebuild and
prove a whole data room**."

## Where we are (29 tools today)
Research (web_search/crawl), investor DB (query_investors, score_investors, matchmake_lps,
build_investor_profile, enrich_firms), CRM/pipeline (crm_*, deal_pipeline,
network_intro_paths), outreach (draft_outreach_batch, outreach_inbox), and generation
(generate_spreadsheet=xlsx, generate_document=Word via `docx`, create_pitch_deck=pptx/pdf).
All **Node-native** → run on Vercel serverless. Persona presets already scope the belt.

---

## Expansion by area

### A. Outreach — from draft to send + sequence
| New/enhanced tool | Does |
|---|---|
| `send_outreach` | Send an approved draft via Resend (reuses `lib/email/resend.ts`); records to `outreach_messages`, respects wave caps + the 4-gate deliverability guard. |
| `outreach_sequence` | Multi-step cadence (connect → value → nudge → ask) with delays; schedules via the campaign cron. |
| `lp_campaign_run` | GP → LP campaign over the same engine (the `/dashboard/outreach/lp-campaign` flow) as a tool. |
| `followup_sweep` | Flip stale sent (>N days, no reply) into the follow-up bucket + draft the nudge. |
*Guardrail: sending is **explicit-approval** gated (never auto-send from a model turn) — mirrors the campaign engine's `autoSend` toggle.*

### B. Investor / investment-firm DB — richer query + output
| Tool | Does |
|---|---|
| `query_firms` (extend `query_investors`) | Compound filters (stage, sector, geo, check size, has-email, recent-activity), sort, pagination — over `investment_firms` + `investors`. |
| `export_investors` | Run a query → **xlsx/csv export** with chosen columns (reuses `generate_spreadsheet`). |
| `save_segment` | Persist a query as a named segment for reuse in campaigns. |
| `firm_dossier` | `build_investor_profile` + `deep-research` → a source-anchored one-pager (docx/pdf). |

### C. Document creation — one tool, several engines
`generate_report({ format, ... })` — a single model-facing tool that dispatches by engine:

| Engine | Format | Runtime | Status |
|---|---|---|---|
| **`docx`** (Node) | Word `.docx` | **serverless ✓** | have it (generate_document) — extend with tables, sections, headers/footers, cover page. This is the "python-docx equivalent" that runs on Vercel. |
| **`pdf-lib` / pptx→pdf** (Node) | PDF | **serverless ✓** | have the pieces — wrap a clean report→PDF path. |
| **`xlsx`** (Node) | Spreadsheet | **serverless ✓** | have it. |
| **LaTeX (tectonic)** | typeset PDF | **binary — needs a worker** | high-fidelity (white-paper class). Not serverless. |
| **LibreOffice / python-docx** | any → PDF/docx | **binary — needs a worker** | conversions + pixel-fidelity. Not serverless. |

**The fork (needs your decision):** LaTeX / LibreOffice / python-docx are local binaries —
they can't run on Vercel. Two paths:
- **Serverless-native only** — Word via `docx`, PDF via `pdf-lib`/pptx. Ships everywhere,
  good fidelity, no LaTeX. *(fastest; recommended default)*
- **Add a doc/compute worker** — a small long-running service (or the dsh sidecar) with
  tectonic + LibreOffice + Python; the agent calls it for LaTeX/LibreOffice output. Full
  fidelity, but a new deployable. *(Phase 2)*

### D. Full persona action coverage
Map every action each persona takes to a tool; fill the gaps. Sketch of what's still
missing per preset:
- **Founder:** cap-table/409A/runway *modeling* tools (call the engines), data-room
  assemble + share-link, pitch-deck critique→revise loop.
- **VC/GP:** capital call / distribution *drafting* (engine-computed, human-approved),
  IC-memo generator, portfolio KPI rollup, fund-tax/compliance checklists as tools.
- **LP:** capital-account explainer, distribution/call notices, document retrieval — all
  read-only, all figures via `agent-verify`.
Each is a thin tool over data + an engine that already exists.

### E. Data-room cleaning — the Phiner-style refinery (flagship)
A tool **suite** that turns raw financial exports into a proven, buyer-ready package.
Every stage is **deterministic code** (the "sealed engine"); the LLM only *suggests*
mappings and *drafts* narratives; a person approves exceptions.

`lib/dataroom/` (new) + tools:

| Stage | Tool | Deterministic engine does | LLM only |
|---|---|---|---|
| Inventory & triage | `dataroom_ingest` | Parse xlsx/csv/GL/trial-balance (later: bank files, scanned PDFs via OCR); catalog sources, row counts, date coverage. | — |
| Chart of accounts | `dataroom_normalize` | Apply a standard CoA mapping; deterministic where the rule exists. | *suggests* a mapping for unmapped accounts (ranked, with evidence) → an **open question** |
| Cross-source reconcile | `dataroom_reconcile` | Trial balance **balances** (Σdebits=Σcredits); subtotals = Σ lines; cross-source ties (GL↔bank↔ops); **flag anything that doesn't tie** into an exception log with a source trace. | — (never writes a number) |
| Unified statement + EBITDA bridge | `dataroom_statements` | Recompute normalized P&L + EBITDA bridge (reported → addbacks → adjusted) from the reconciled ledger. | *drafts* addback rationale; the addback **amount** is engine-computed |
| Output | `dataroom_package` | Emit reconciled **workbook** + normalized statements + **exception log** + a **trace from every figure to its record** (xlsx/docx). | *drafts* the CIM-ready narrative |
| Questions → rules | `dataroom_questions` | Surface only what evidence can't settle, as ranked plain-English answers; a person answers **once** → saved as a **permanent rule** so the next room asks fewer. | ranks answers, shows evidence |

**Invariant:** the model never emits a final figure — it maps and narrates; the engine
computes and reconciles; the exception log + traces make every number provable. This is
the DeepSeek verifiable-reward loop applied to a full ledger, and it's serverless-safe
(pure TS over `xlsx`), reusing Anker's fund-ledger + engine modules.

---

## Architecture notes
- **Sealed-engine pattern everywhere a number is produced:** tools that output figures
  route through `lib/modules/*` (or the new `lib/dataroom/reconcile`), never the LLM.
  This is the same seam as `agent-verify`; formalize a `computes: true` flag on such tools
  so the MCP schema + UI can label "engine-computed, human-approved."
- **Exception + rule store:** a `dataroom_rules` table (mapping decisions) + an
  `exceptions` log per engagement — the "answered once, saved as a rule" mechanism.
- **Deployment:** everything above is serverless-safe **except** LaTeX/LibreOffice/
  python-docx (§C fork). Recommend serverless-native now; add a doc/compute worker only if
  LaTeX-fidelity output is required.
- **Presets:** new tools slot into the persona presets (founder/vc get the data-room
  suite; lp read-only).

## Phased plan
1. **Data-room reconciler MVP** (§E: ingest → reconcile → exception log → package) —
   serverless-safe, the clearest differentiator, directly the Phiner wedge. **✅ Shipped
   (2026-08).** Full refinery in `lib/dataroom/` (`reconcile.ts` + `statements.ts`) with all
   six stages as tools: `dataroom_ingest`, `dataroom_reconcile`, `dataroom_normalize`,
   `dataroom_statements` (P&L + EBITDA bridge), `dataroom_questions`, `dataroom_package`
   (7-sheet buyer-ready workbook). Deterministic; both EBITDA paths cross-check.
2. **Document engine** (§C serverless-native: rich `docx` + report→PDF) + `export_investors`.
   **✅ `export_investors` shipped** (xlsx/csv, selectable columns); `docx` engine is the
   white-paper house style in `lib/branding/doc-theme.ts` (numbered ink headings, justified
   11pt serif, cover + watermark), shared by every engine.
3. **Outreach send/sequence** (§A) + persona action gaps (§D). **✅ Shipped (2026-08).**
   - §A: `send_outreach` (dry-run by default, `confirm:true` gate, deliverability guard +
     daily wave cap in `lib/outreach/send-gate.ts`); `outreach_sequence` (4-touch cadence
     with dated offsets, draft-only); `followup_sweep` (stale-contact worklist from
     `outreach_messages`⋈`crm_entries` + a drafted nudge each, read-only).
   - §D: engine-backed modeling in `lib/assistant/tools-modeling.ts` — `model_vesting`,
     `model_409a` (OPM), `model_waterfall` (+ per-LP split), `draft_capital_call` (pro-rata,
     ties-to-the-penny, human-approved), `ic_memo` (house-style docx), `portfolio_kpi_rollup`
     (fund-wide KPI aggregation from `portfolio_kpis_monthly`), and `lp_capital_account`
     (commitment / called / distributed / unfunded / DPI from `fund_lps`, LP-read-only).
     Every figure comes from `lib/modules/*` or the fund tables; the model chooses inputs
     and drafts narrative only.
4. **LaTeX/LibreOffice doc-worker** (§C fork). **✅ Shipped (2026-08).** Client seam
   `lib/docworker/client.ts` + the `render_document_pro` tool, AND the worker deployable
   itself: `services/doc-worker/` (Node server + Dockerfile bundling tectonic + LibreOffice,
   bearer auth, `/health`). Verified end-to-end locally — a LaTeX POST returns a typeset PDF.
   Inert until `DOC_WORKER_URL` is set (agent falls back to serverless docx); the only
   remaining step is deploying the container and setting `DOC_WORKER_URL` / `DOC_WORKER_TOKEN`
   on the app. See `services/doc-worker/README.md`.

## Decisions I need from you
1. **Doc engines:** serverless-native (Word via `docx`, PDF via `pdf-lib`) now, or stand up
   a **doc/compute worker** for LaTeX + LibreOffice + python-docx fidelity?
2. **Build order:** lead with the **data-room reconciler** (flagship), or the **document
   engine + investor export** first?
3. **Scope of the reconciler MVP:** start with **trial-balance / GL xlsx-csv** ingest +
   balance/tie checks + exception log + reconciled workbook — then layer normalization,
   EBITDA bridge, and questions→rules?
