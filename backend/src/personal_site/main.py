"""Fabrique ASGI : API, politiques HTTP puis fichiers statiques."""

import logging

from fastapi import FastAPI, Request
from starlette.responses import Response

from personal_site.api.health import router
from personal_site.config import Settings
from personal_site.delivery import mount_builds


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    for logger_name in ("personal_site", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(logger_name).setLevel(settings.log_level.upper())
    app = FastAPI(
        title="Thibault Leveau",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = settings

    @app.middleware("http")
    async def response_policy(request: Request, call_next) -> Response:
        response = await call_next(request)
        if not settings.indexable:
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.url.path.startswith("/api/") or response.status_code >= 400:
            response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(router)
    mount_builds(app, settings)
    return app
