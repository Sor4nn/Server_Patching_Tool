#!/usr/bin/env bash
# Run the GPTA backend test suite.
#
#   ./scripts/test-backend.sh            # unit tests (no DB needed)
#   ./scripts/test-backend.sh integration # integration tests (needs gpta_test Postgres)
#   ./scripts/test-backend.sh all         # everything
#
# Integration tests need a reachable Postgres with a `gpta_test` database
# (e.g. the docker compose db). Without one they are skipped automatically.
set -euo pipefail

cd "$(dirname "$0")/../backend"

PY="${PYTHON:-./.venv/Scripts/python.exe}"
[ -x "$PY" ] || PY="$(command -v python3 || command -v python)"

ARGS=(-p no:cacheprovider)
case "${1:-unit}" in
  integration) ARGS+=(-m integration) ;;
  all)         ARGS+=() ;;
  *)           ARGS+=(-m "not integration") ;;
esac

exec "$PY" -m pytest "${ARGS[@]}"
