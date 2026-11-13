.PHONY: install dev docs check build test-e2e

install:
	uv sync --frozen --group docs
	npm --prefix frontend ci

dev:
	bash scripts/dev.sh

docs:
	uv run --group docs mkdocs serve --dev-addr 127.0.0.1:8001

check:
	bash scripts/check.sh

build:
	bash scripts/build.sh

test-e2e:
	npm --prefix frontend run test:e2e
