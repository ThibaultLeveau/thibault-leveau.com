#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
uv run --frozen ruff check backend
uv run --frozen ruff format --check backend
npm --prefix frontend run check
bash scripts/build.sh
uv run --frozen pytest
