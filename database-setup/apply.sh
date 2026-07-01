#!/usr/bin/env bash
# Apply the schema migrations (00 -> 12) in strict order against a target DB.
# Fails on the first error. Never touches seeds/dev-only/.
#
# Usage:
#   ./apply.sh "postgresql://user:pass@host:5432/dbname"
#   DATABASE_URL=... ./apply.sh
#
# CI uses this against a throwaway Postgres to prove a clean cutover.
set -euo pipefail

DB_URL="${1:-${DATABASE_URL:-}}"
if [[ -z "${DB_URL}" ]]; then
  echo "error: pass a connection string as \$1 or set DATABASE_URL" >&2
  exit 2
fi

cd "$(dirname "$0")"

# Numeric-prefixed files only, in lexical order (00_, 01_, ... 12_).
# seeds/ is a subdirectory and is intentionally excluded.
shopt -s nullglob
files=([0-9][0-9]_*.sql)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "error: no migration files found" >&2
  exit 1
fi

for f in "${files[@]}"; do
  echo ">> applying ${f}"
  psql "${DB_URL}" --set ON_ERROR_STOP=1 --quiet --file "${f}"
done

echo "OK: applied ${#files[@]} migration(s) cleanly"
