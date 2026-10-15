#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "::error::Add the SUPABASE_DB_URL repository secret using Supabase's Session pooler connection string."
  exit 1
fi

export PGCONNECT_TIMEOUT=20
export PGSSLMODE="${PGSSLMODE:-require}"
if ! psql --dbname "$SUPABASE_DB_URL" --no-psqlrc --quiet --command 'select 1' >/dev/null 2>&1; then
  echo "::error::Cannot connect to Supabase. Check the SUPABASE_DB_URL secret, its URL-encoded database password, and Session pooler connection settings."
  exit 1
fi

# SQL-editor changes have no CLI history. Recognize the known historical prefix
# once, then let the official Supabase CLI track and apply every future change.
applied="$(psql --dbname "$SUPABASE_DB_URL" --no-psqlrc --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 --file supabase/ci/detect-manual-migrations.sql)"
applied="${applied//$'\r'/}"
if [[ -n "$applied" ]]; then
  mapfile -t versions <<< "$applied"
  for version in "${versions[@]}"; do
    if [[ ! "$version" =~ ^[0-9]{12}$ ]]; then
      echo "::error::Unexpected migration history output; refusing to modify history."
      exit 1
    fi
  done
  supabase migration repair --db-url "$SUPABASE_DB_URL" --status applied "${versions[@]}" --yes
fi
supabase db push --db-url "$SUPABASE_DB_URL" --include-all --yes
