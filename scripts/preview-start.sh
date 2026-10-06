#!/usr/bin/env bash
# Preview bootstrap: embedded PostgreSQL -> migrations -> seed (first run) -> Node API (watch mode)
cd "$(dirname "$0")/../backend"
PORT_DB=${PREVIEW_PG_PORT:-5433}
if ! (echo > /dev/tcp/127.0.0.1/$PORT_DB) 2>/dev/null; then
  bash ../scripts/preview-db.sh
fi
npx prisma migrate deploy
mkdir -p ../.preview
if [ ! -f ../.preview/seeded ]; then npx tsx prisma/seed.ts && touch ../.preview/seeded; fi
exec npx tsx watch src/index.ts
