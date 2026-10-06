#!/usr/bin/env bash
# Local/preview PostgreSQL using the binaries shipped in backend/node_modules (embedded-postgres).
# In your own environment just run any PostgreSQL 14+ (e.g. `docker compose up -d db`) instead.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN=$(ls -d "$ROOT"/backend/node_modules/@embedded-postgres/*/native/bin | head -1)
DATA="${PREVIEW_PG_DATA:-$ROOT/.preview/pgdata}"
PORT="${PREVIEW_PG_PORT:-5433}"
id postgres >/dev/null 2>&1 || useradd -r -M postgres
mkdir -p "$DATA" && chown -R postgres "$DATA" && chmod 700 "$DATA"
chmod -R o+rx "$(dirname "$BIN")"
AS="su postgres -s /bin/bash -c"
if [ ! -f "$DATA/PG_VERSION" ]; then
  echo postgres > /tmp/pgpw && chmod 644 /tmp/pgpw
  $AS "$BIN/initdb -D $DATA -U postgres --pwfile=/tmp/pgpw -A md5 -E UTF8" 
fi
rm -f "$DATA/postmaster.pid"
$AS "$BIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp -c listen_addresses=127.0.0.1' -l $DATA/pg.log -w start"
echo "[preview-db] PostgreSQL running on $PORT"
