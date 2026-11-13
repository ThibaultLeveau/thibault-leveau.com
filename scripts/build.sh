#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
npm --prefix frontend run build
uv run --frozen --group docs mkdocs build --strict
