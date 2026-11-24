#!/usr/bin/env bash
# Runs every test suite. Usage: scripts/test-all.sh [quick]   ("quick" skips the real-app tests)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Backend: unit, integration, regression, performance =="
(cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest -q)

echo "== Frontend: unit tests, lint, type check, build =="
(cd frontend && npm run lint && npx vitest run && npm run build)

if [ "${1:-}" = "quick" ]; then exit 0; fi

echo "== Desktop: system, end-to-end, compatibility, performance =="
(cd desktop && npx prettier --check . && npm test)
