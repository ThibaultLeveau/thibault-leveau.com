# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:0.13.7 AS uv

FROM python:3.13-slim-bookworm AS python-build
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
COPY backend/src/ backend/src/
RUN uv sync --frozen --no-dev --no-editable

FROM python-build AS documentation
RUN uv sync --frozen --no-dev --group docs --no-editable
COPY mkdocs.yml ./
COPY docs/ docs/
RUN uv run --no-sync mkdocs build --strict

FROM python:3.13-slim-bookworm AS runtime
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SITE_ENVIRONMENT=production \
    SITE_STATIC_DIR=/app/build \
    SITE_INDEXABLE=false
WORKDIR /app
RUN groupadd --gid 10001 site && useradd --uid 10001 --gid site --no-create-home site \
    && mkdir /app/data && chown site:site /app/data && chmod 700 /app/data
COPY --from=python-build /app/.venv /app/.venv
COPY --from=frontend /app/build/web /app/build/web
COPY --from=documentation /app/build/documentation /app/build/documentation
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import json, urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)) == {'status': 'ok'}"]
CMD ["uvicorn", "personal_site.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-server-header"]
