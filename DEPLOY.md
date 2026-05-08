# Anker — local production deploy

Goal: get from `pnpm dev` (dev server) to a real built `pnpm start`
(production server) running on your Mac.

## TL;DR

```bash
cd Anker
pnpm install                    # only first time / after deps change
pnpm build                      # ~30-90s, produces .next/
pnpm start                      # serves at http://localhost:3000
```

That's the whole production loop. `pnpm dev` is replaced by
`pnpm start`; nothing else changes.

## Prereqs (one-time)

1. **Postgres running.** Either local Docker (`colima start && docker
   compose up -d postgres`) or a Neon URL. Check it answers:

   ```bash
   psql "$DATABASE_URL" -c "select count(*) from investment_firms;"
   ```

2. **Migrations applied.** Apply any new migrations once before the
   first `pnpm start`:

   ```bash
   for f in scripts/migrations/*.sql; do
     psql "$DATABASE_URL" -f "$f"
   done
   ```

3. **Ollama running** (only if you're not using Anthropic). Default
   single-model setup:

   ```bash
   ollama serve &                  # runs as a background daemon
   ollama pull gemma2:2b           # ~1.6 GB, the legacy default
   ```

   For the multi-model setup (recommended — see "AI model routing"
   below), pull the larger models too.

## Required env

`.env.production` (or `.env.local` if you don't want a separate file —
Next reads both, with `.env.production` winning at build/start):

```
# ─── Database ─────────────────────────────────────────────────────────
DATABASE_URL=postgresql://anker:anker@localhost:5432/anker

# ─── Auth (Supabase OR local-auth) ────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=...           # if using Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
# OR for local-auth: nothing extra needed; the dev-bypass cookie works.

# ─── AI provider ──────────────────────────────────────────────────────
# Pick ONE (or none — heuristic fallback kicks in):
ANTHROPIC_API_KEY=sk-ant-...           # cloud, model: claude-haiku-4-5
OLLAMA_URL=http://127.0.0.1:11434      # local
OLLAMA_MODEL=gemma2:2b                 # legacy single-model env (fallback)
```

The DB driver auto-routes: if the URL hostname matches `neon.tech` it
uses the serverless HTTP driver; otherwise it uses node-postgres. No
config knob, no LOCAL_DB hack in production.

## AI model routing — different models for different tasks

The system can route each task to a different local Ollama model so a
fast 2 B model handles classification and a stronger 7-14 B model
handles deep analysis. Each tier is faster than running everything on
the same large model.

### Tiers

| Tier      | Default model              | Disk  | Speed (M-series) | Use for                                  |
| --------- | -------------------------- | ----- | ---------------- | ---------------------------------------- |
| `fast`    | `gemma2:2b`                | 1.6 GB | 50–150 tok/s     | reply classify, DM hooks, 1-line ratios |
| `balanced`| `qwen2.5:7b-instruct`      | 4.4 GB | 20–40 tok/s      | deck-extract JSON, fund critique         |
| `deep`    | `qwen2.5:14b-instruct`     | 9 GB   | 10–20 tok/s      | full deck critique, long-form analysis   |

Pull what you actually need:

```bash
ollama pull gemma2:2b
ollama pull qwen2.5:7b-instruct
ollama pull qwen2.5:14b-instruct
```

### Per-tier env overrides

```
OLLAMA_MODEL_FAST=gemma2:2b
OLLAMA_MODEL_BALANCED=qwen2.5:7b-instruct
OLLAMA_MODEL_DEEP=qwen2.5:14b-instruct
```

### Per-task env overrides (highest priority)

Use these to pin a specific task to a specific model:

```
OLLAMA_MODEL_TASK_REPLY_CLASSIFY=qwen2.5:1.5b      # tiny model for 5-bucket classifier
OLLAMA_MODEL_TASK_DM_PERSONALIZE=gemma2:2b
OLLAMA_MODEL_TASK_AI_RATIONALE=gemma2:2b           # runs hundreds of times per match
OLLAMA_MODEL_TASK_DECK_EXTRACT=qwen2.5:7b-instruct
OLLAMA_MODEL_TASK_FUND_CRITIQUE=qwen2.5:14b-instruct
OLLAMA_MODEL_TASK_DECK_CRITIQUE=qwen2.5:14b-instruct
```

### Task tags — what gets routed where

| Task                  | Default tier | Where it's called from                                |
| --------------------- | ------------ | ----------------------------------------------------- |
| `reply_classify`      | fast         | `lib/ai/reply-handler.ts` (Layer 4 reply classifier)   |
| `dm_personalize`      | fast         | `lib/ai/dm-personalizer.ts` (Layer 2 DM sequence)      |
| `ai_rationale`        | fast         | `lib/matching/v2/ai-enrichment.ts` (per-investor 1-line)|
| `match_summary`       | fast         | reserved for matchmaking session summaries             |
| `doc_summary`         | fast         | reserved for document summarization                    |
| `deck_extract`        | balanced     | founder + fund deck profile extraction (JSON)          |
| `fund_critique`       | balanced     | LP analyst 6-dim fund-deck review                      |
| `deck_critique`       | deep         | 8-dim founder pitch-deck critique                      |

Resolution order at call time:
1. `OLLAMA_MODEL_TASK_<TASK>` env (per-task override)
2. `OLLAMA_MODEL_<TIER>` env (per-tier override)
3. tier default
4. legacy `OLLAMA_MODEL`

No extra round trips at call time — the router is a 1-line lookup.

## After build

```bash
pnpm start
# ▲ Next.js 16.0.10
# ✓ Started server on 0.0.0.0:3000
```

Open http://localhost:3000.

If you change source code, you need to `pnpm build` again. `pnpm
start` does **not** hot-reload like `pnpm dev`.

## Build issues — known fixes

| Symptom                                              | Fix                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm: not found` from inside Next                   | install pnpm or use `npm run build && npm run start`               |
| Failed to download `@next/swc-…`                     | restart with network access; the binary caches under `node_modules/.pnpm/@next+swc-darwin-arm64@…` and `@next+swc-darwin-x64@…` |
| `DATABASE_URL is required`                           | set it in `.env.production` (Neon URL or local Postgres)            |
| Hydration mismatch on a dashboard page               | confirm the page has `export const dynamic = "force-dynamic"`       |
| `pdf-parse` / `docx` / `pg` bundling error           | already handled — they're in `serverExternalPackages` in `next.config.mjs` |

## What's running

`pnpm start` runs `next start`, which serves:

* SSR for every page in `app/dashboard/*`
* The `/api/*` route handlers (Node.js runtime, NOT edge — Postgres
  driver requires Node)
* Static assets from `.next/static`

The SWC binary stays warm in memory; CPU at idle is ~0.

## CI / multi-machine deploys

For a real cloud deploy (Vercel, Railway, Fly):

* Set `DATABASE_URL` to your managed Postgres / Neon URL
* Set `ANTHROPIC_API_KEY` (Vercel doesn't have a local Ollama daemon)
* Build command: `pnpm install --frozen-lockfile && pnpm build`
* Start command: `pnpm start`
* Or output `output: "standalone"` in `next.config.mjs` and ship the
  `.next/standalone` bundle as a Docker image.
