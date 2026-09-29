#!/usr/bin/env bash
# Aplica las migraciones de supabase/migrations en un Postgres temporal y corre
# las pruebas de supabase/tests. Requiere Postgres instalado (initdb, pg_ctl, psql).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"

DIR="$(mktemp -d)"
PUERTO="${PUERTO:-54329}"
trap 'pg_ctl -D "$DIR/datos" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

# initdb se niega a correr como root; en ese caso se usa el usuario postgres.
COMO=()
if [ "$(id -u)" = 0 ]; then
  chown postgres "$DIR"
  COMO=(runuser -u postgres --)
fi

"${COMO[@]}" initdb -D "$DIR/datos" -U postgres -A trust >/dev/null
"${COMO[@]}" pg_ctl -D "$DIR/datos" -o "-p $PUERTO -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null

PSQL=(psql -h "$DIR" -p "$PUERTO" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$RAIZ/supabase/tests/00_stub_supabase.sql"
for migracion in "$RAIZ"/supabase/migrations/*.sql; do
  echo "Migración: $(basename "$migracion")"
  "${PSQL[@]}" -f "$migracion"
done
for prueba in "$RAIZ"/supabase/tests/[1-9]*.sql; do
  echo "Pruebas: $(basename "$prueba")"
  "${PSQL[@]}" -f "$prueba"
done
