#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export API_PORT="${API_PORT:-8000}"
pids=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait || true
}
trap cleanup EXIT INT TERM
uv run --frozen uvicorn personal_site.main:create_app --factory --reload --host 127.0.0.1 --port "$API_PORT" &
pids+=("$!")
(cd frontend && exec node node_modules/vite/bin/vite.js --host 127.0.0.1) &
pids+=("$!")
wait -n "${pids[@]}"
