#!/usr/bin/env bash
# Dump every Postgres table in `public` to a CSV under csv-export/.
#
# Usage:
#   ./scripts/export-csvs.sh                  # uses $DATABASE_URL or .env.local
#   DATABASE_URL=postgres://... ./scripts/export-csvs.sh
#   ./scripts/export-csvs.sh --out /tmp/anker # custom output dir
#   ./scripts/export-csvs.sh --zip            # also produce csv-export.zip
#
# Output:
#   csv-export/<table>.csv         — one CSV per table, RFC4180-quoted, UTF-8
#   csv-export/_manifest.csv       — table, row_count, bytes, exported_at
#
# Notes:
# • Uses psql \copy (client-side) so no Postgres superuser needed.
# • Pulls table list dynamically from information_schema, so it always
#   exports the current schema — agent_runs, system_settings, etc. all
#   come along automatically.
# • Skips materialized views and the agent_runs_latest helper view (those
#   can be regenerated).

set -euo pipefail

OUT_DIR="csv-export"
DO_ZIP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)  OUT_DIR="$2"; shift 2;;
    --zip)  DO_ZIP=1; shift;;
    -h|--help)
      sed -n '1,18p' "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

# Load DATABASE_URL from .env.local if not in env (don't override existing).
if [[ -z "${DATABASE_URL:-}" && -f .env.local ]]; then
  export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | sed 's/^["'"'"']//; s/["'"'"']$//')"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (export it, or put it in .env.local)" >&2
  exit 1
fi

command -v psql >/dev/null || {
  echo "psql not found — install Postgres client: brew install libpq && brew link --force libpq" >&2
  exit 1
}

mkdir -p "$OUT_DIR"

echo "→ Dumping schema 'public' from $(echo "$DATABASE_URL" | sed -E 's|.*@([^/]+)/.*|\1|') to $OUT_DIR/"

# Get every regular table in public (no views).
TABLES=$(psql "$DATABASE_URL" -At -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type   = 'BASE TABLE'
  ORDER BY table_name
")

if [[ -z "$TABLES" ]]; then
  echo "No tables found in public schema." >&2
  exit 1
fi

# Manifest header
MANIFEST="$OUT_DIR/_manifest.csv"
echo "table,row_count,bytes,exported_at" > "$MANIFEST"

EXPORTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TOTAL_ROWS=0
TOTAL_TABLES=0

while IFS= read -r t; do
  [[ -z "$t" ]] && continue
  FILE="$OUT_DIR/$t.csv"

  # \copy is client-side; we wrap in a single-shot psql call.
  ROWS=$(psql "$DATABASE_URL" -At -c "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo "?")
  psql "$DATABASE_URL" -c "\copy (SELECT * FROM \"$t\") TO '$FILE' WITH (FORMAT csv, HEADER true, QUOTE '\"', FORCE_QUOTE *)" >/dev/null

  BYTES=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null || echo "?")
  printf "  %-32s rows=%-9s bytes=%s\n" "$t" "$ROWS" "$BYTES"
  echo "$t,$ROWS,$BYTES,$EXPORTED_AT" >> "$MANIFEST"

  if [[ "$ROWS" =~ ^[0-9]+$ ]]; then TOTAL_ROWS=$(( TOTAL_ROWS + ROWS )); fi
  TOTAL_TABLES=$(( TOTAL_TABLES + 1 ))
done <<< "$TABLES"

echo
echo "→ ${TOTAL_TABLES} tables · ${TOTAL_ROWS} total rows · written to $OUT_DIR/"

if [[ $DO_ZIP -eq 1 ]]; then
  ZIP="${OUT_DIR%.zip}.zip"
  rm -f "$ZIP"
  (cd "$(dirname "$OUT_DIR")" && zip -qr "$(basename "$ZIP")" "$(basename "$OUT_DIR")")
  echo "→ Zipped to $ZIP ($(stat -f%z "$ZIP" 2>/dev/null || stat -c%s "$ZIP") bytes)"
fi
