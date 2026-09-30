#!/usr/bin/env bash
# Corre las migraciones y las pruebas de permisos en un Postgres local y
# descartable (no toca ningún proyecto de Supabase).
#
# Requiere: PostgreSQL 15+ (initdb, pg_ctl, psql), pgTAP y pg_prove.
# En Debian/Ubuntu: apt-get install postgresql postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
#
# Uso: npm run test:db
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"

WORK="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"
cleanup() {
  pg_ctl -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# initdb no corre como root: si hace falta, se usa el usuario "postgres".
RUN=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$WORK"
  RUN=(runuser -u postgres --)
fi

"${RUN[@]}" initdb -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN[@]}" pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

export PGHOST="$WORK" PGPORT="$PORT" PGUSER=postgres
psql -q -v ON_ERROR_STOP=1 -c 'create database iris_test' postgres
export PGDATABASE=iris_test
psql -q -v ON_ERROR_STOP=1 -c 'alter database iris_test set search_path = "$user", public, extensions'

echo "→ Base simulada de Supabase"
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-local/supabase-shim.sql"

echo "→ Migraciones"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -f "$f"
done

echo "→ Pruebas de permisos"
pg_prove --ext .sql -r "$ROOT/supabase/tests"
