#!/usr/bin/env bash
# Emergent-preview only: PC app on :3000 (proxies /admin to the admin app on :3001).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$ROOT/admin-app" && npx vite --port 3001 --strictPort --host 0.0.0.0) &
cd "$ROOT/pc-app" && exec npx vite --port 3000 --strictPort --host 0.0.0.0
