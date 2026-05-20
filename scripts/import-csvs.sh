#!/usr/bin/env bash
# Import CSVs produced by export-csvs.sh back into Postgres.
#
# Handles schema drift: each table is loaded with the EXPLICIT column
# list taken from that CSV's own header, so columns the table has gained
# since the export (twenty_*, tracking_id, opens, …) fall back to their
# defaults instead of erroring with "missing data for column".
#
# Tables are loaded in FK-dependency order so references resolve.
#
# Usage:
#   ./scripts/import-csvs.sh                 # from csv-export/, uses .env.local DATABASE_URL
#   ./scripts/import-csvs.sh --in data/csv   # custom source dir
#   DBURL=postgres://… ./scripts/import-csvs.sh
#   ./scripts/import-csvs.sh --truncate      # TRUNCATE each table before load (DANGER)
#
# Safe to re-run WITHOUT --truncate only if your CSV ids don't collide
# with existing rows (it will error on PK conflict).  Use --truncate for
# a clean reload.

set -uo pipefail

IN_DIR="csv-export"
DO_TRUNCATE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --in)        IN_DIR="$2"; shift 2;;
    --truncate)  DO_TRUNCATE=1; shift;;
    -h|--help)   sed -n '1,22p' "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

# Resolve DB URL
if [[ -z "${DBURL:-}" ]]; then
  if [[ -n "${DATABASE_URL:-}" ]]; then DBURL="$DATABASE_URL"
  elif [[ -f .env.local ]]; then
    DBURL="$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | sed 's/^["'"'"']//; s/["'"'"']$//')"
  fi
fi
[[ -n "${DBURL:-}" ]] || { echo "Set DBURL or DATABASE_URL (or put it in .env.local)" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql not found (brew install libpq && brew link --force libpq)" >&2; exit 1; }

# FK-dependency order.  Parents first.
ORDER=(
  investment_firms
  investors
  startups
  contacts
  deals
  investor_matches
  crm_entries
  outreach_messages
  outreach_replies
  outreach_events
  agent_runs
  news_articles
  documents
  pitch_decks
  data_room_files
  saved_templates
  activities
  local_users
  lp_match_audit
  system_settings
)

echo "→ importing from $IN_DIR/ into $(echo "$DBURL" | sed -E 's|.*@([^/]+)/.*|\1|')"
imported=0; skipped=0; failed=0

for t in "${ORDER[@]}"; do
  CSV="$IN_DIR/$t.csv"
  if [[ ! -s "$CSV" ]]; then echo "  skip $t (no file)"; skipped=$((skipped+1)); continue; fi
  # A header-only file has just 1 line — nothing to import.
  LINES=$(wc -l < "$CSV" | tr -d ' ')
  if [[ "$LINES" -le 1 ]]; then echo "  skip $t (header only)"; skipped=$((skipped+1)); continue; fi

  COLS=$(head -1 "$CSV")
  if [[ $DO_TRUNCATE -eq 1 ]]; then
    psql "$DBURL" -q -c "TRUNCATE TABLE \"$t\" CASCADE" 2>/dev/null \
      && echo "  truncated $t"
  fi
  if psql "$DBURL" -q -c "\copy \"$t\" ($COLS) FROM '$CSV' WITH (FORMAT csv, HEADER true)"; then
    n=$((LINES-1))
    echo "  ✓ $t  (~$n rows)"
    imported=$((imported+1))
  else
    echo "  ✗ $t  FAILED (see error above)"
    failed=$((failed+1))
  fi
done

echo
echo "→ done · imported $imported · skipped $skipped · failed $failed"
[[ $failed -eq 0 ]]
