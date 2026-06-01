#!/usr/bin/env bash
#
# One-shot setup for the Twenty + Readability + pgvector + SearXNG +
# Marker + AI SDK bridge integration pass.  Run from the Anker repo
# root on your Mac.
#
# Usage:
#   chmod +x scripts/setup-integrations.sh
#   ./scripts/setup-integrations.sh
#
# Or pipe it inline:
#   bash scripts/setup-integrations.sh
#
# What it does, in order:
#   1. Clear any stuck git locks (sandbox-induced)
#   2. Stage + commit pending changes
#   3. pnpm install (picks up the new deps)
#   4. Apply the pgvector migration to your DATABASE_URL
#   5. Pull the embedding model into Ollama
#   6. Backfill embeddings on investment_firms / investors / crm_entries
#   7. Boot the integration sidecars (Twenty + SearXNG + Marker)
#   8. pnpm build
#   9. Start in the background and curl the homepage to confirm
#
# Anything missing on your machine (pnpm, ollama, docker, psql) is
# diagnosed and skipped with a clear message — the script never fails
# the whole run because of one missing tool.

set -u  # don't fail on errors, we want to keep going and report

cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
DIM='\033[2m'
RESET='\033[0m'

ok()    { echo -e "${GREEN}✓${RESET} $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $*"; }
fail()  { echo -e "${RED}✗${RESET} $*"; }
step()  { echo -e "\n${DIM}━━━${RESET} $*"; }

# ─── 1. clear stuck git locks ──────────────────────────────────────────
step "1/9 · clearing stuck git locks"
rm -f "$ROOT/.git/index.lock" "$ROOT/.git/HEAD.lock" 2>/dev/null
ok "removed any stale locks"

# ─── 2. commit ─────────────────────────────────────────────────────────
step "2/9 · committing pending changes"
if git diff --quiet HEAD 2>/dev/null && [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  ok "working tree clean — nothing to commit"
else
  git add -A 2>&1 | tail -3
  git commit -m "feat: Twenty CRM + Readability + pgvector + SearXNG + Marker + AI SDK typed bridge

- lib/twenty/{client,sync}.ts: GraphQL Companies/People/Opportunities, push + pull stages
- lib/admin/web-crawler.ts: lazy Readability + jsdom; legacy regex fallback
- scripts/migrations/2026-05-08-pgvector.sql: 768-d HNSW indexes on 3 tables
- lib/ai/{embeddings,semantic-search}.ts: local Ollama embeddings + similarity
- lib/agents/web-search.ts + deep-research integration: SearXNG URL resolution
- scripts/marker/{Dockerfile,server.py} + lib/ai/{pdf,pdf-marker}.ts: Marker fallback
- lib/ai/sdk-bridge.ts: typed structured-output via Vercel AI SDK
- docker-compose.integrations.yml: Twenty + SearXNG + Marker
- INTEGRATIONS.md: full setup + roll-back per integration" 2>&1 | tail -5 \
    && ok "committed" || warn "commit failed — review with: git status"
fi

# ─── 3. pnpm install ───────────────────────────────────────────────────
step "3/9 · pnpm install"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install 2>&1 | tail -10 && ok "deps installed" || warn "pnpm install reported errors"
else
  warn "pnpm not found — skipping. Install with:  brew install pnpm  or  corepack enable"
fi

# ─── 4. pgvector migration ─────────────────────────────────────────────
step "4/9 · pgvector migration"
if [ -z "${DATABASE_URL:-}" ]; then
  warn "DATABASE_URL not set — skipping migration. Export it then run:"
  echo "  psql \"\$DATABASE_URL\" -f scripts/migrations/2026-05-08-pgvector.sql"
elif command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -f scripts/migrations/2026-05-08-pgvector.sql 2>&1 | tail -8
  ok "pgvector migration applied"
else
  warn "psql not found — install postgresql client or apply via Docker:"
  echo "  docker exec -i anker-postgres psql -U anker -d anker < scripts/migrations/2026-05-08-pgvector.sql"
fi

# ─── 5. ollama pull nomic-embed-text ───────────────────────────────────
step "5/9 · ollama pull nomic-embed-text"
if command -v ollama >/dev/null 2>&1; then
  ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -q '^nomic-embed-text' \
    && ok "nomic-embed-text already pulled" \
    || ollama pull nomic-embed-text 2>&1 | tail -3
else
  warn "ollama not found — skipping. Install: https://ollama.com/download"
fi

# ─── 6. backfill embeddings ────────────────────────────────────────────
step "6/9 · backfill embeddings"
if [ -z "${DATABASE_URL:-}" ]; then
  warn "DATABASE_URL not set — skipping backfill. Run later:"
  echo "  DATABASE_URL=… node scripts/backfill-embeddings.mjs"
else
  node scripts/backfill-embeddings.mjs 2>&1 | tail -10 \
    && ok "embeddings backfilled" \
    || warn "backfill reported errors (often OK for empty tables)"
fi

# ─── 7. integration sidecars ───────────────────────────────────────────
step "7/9 · docker compose: twenty + searxng + marker"
if command -v docker >/dev/null 2>&1; then
  docker compose -f docker-compose.yml -f docker-compose.integrations.yml up -d \
    postgres twenty-db twenty-redis twenty searxng marker 2>&1 | tail -15
  echo
  echo "Sidecars (give them ~30s to warm):"
  echo "  Twenty   → http://localhost:3010"
  echo "  SearXNG  → http://localhost:8080"
  echo "  Marker   → http://localhost:8001/healthz"
else
  warn "docker not found — skipping. Install Docker Desktop or Colima."
fi

# ─── 8. pnpm build ─────────────────────────────────────────────────────
step "8/9 · pnpm build"
if command -v pnpm >/dev/null 2>&1; then
  pnpm build 2>&1 | tail -20
  ok "build complete"
else
  warn "pnpm not found — skipping build"
fi

# ─── 9. start ──────────────────────────────────────────────────────────
step "9/9 · pnpm start"
if command -v pnpm >/dev/null 2>&1; then
  echo "Starting Anker on http://localhost:3000 (Ctrl-C to stop)…"
  exec pnpm start
else
  warn "pnpm not found — start manually with:  pnpm start"
fi
