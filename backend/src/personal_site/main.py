"""Fabrique ASGI : API, politiques HTTP puis fichiers statiques."""

import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse, Response

from personal_site.admin.llm import LLMGateway
from personal_site.admin.security import AdminBodyLimit
from personal_site.admin.store import AdminStore
from personal_site.api.admin import router as admin_router
from personal_site.api.assistant import router as assistant_router
from personal_site.api.content import router as content_router
from personal_site.api.health import router
from personal_site.api.public import router as public_router
from personal_site.assistant.service import AssistantService
from personal_site.config import Settings
from personal_site.content.files import MediaFiles
from personal_site.content.store import ContentStore
from personal_site.content.validation import ContentError
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
    app.state.admin_store = AdminStore(settings) if settings.admin_enabled else None
    app.state.content_store = (
        ContentStore(app.state.admin_store) if settings.admin_enabled else None
    )
    app.state.media_files = (
        MediaFiles(app.state.content_store, settings.media_quota_bytes)
        if settings.admin_enabled
        else None
    )
    app.state.upload_lock = asyncio.Lock()
    app.state.llm = LLMGateway()
    app.state.chat_lock = asyncio.Lock()
    app.state.assistant = (
        AssistantService(app.state.content_store) if settings.admin_enabled else None
    )
    app.state.assistant_runs = {}
    app.add_middleware(AdminBodyLimit)

    @app.exception_handler(ContentError)
    async def content_error(request: Request, exc: ContentError):
        return JSONResponse(
            {"detail": exc.message, "errors": exc.errors, "usages": exc.usages},
            status_code=exc.status,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        if request.url.path.startswith("/api/admin/"):
            # FastAPI's default validation response includes rejected secret input.
            return JSONResponse(
                {"detail": "Vérifiez le format et la longueur des champs ou du message."},
                status_code=422,
            )
        return await request_validation_exception_handler(request, exc)

    @app.middleware("http")
    async def response_policy(request: Request, call_next) -> Response:
        response = await call_next(request)
        private = request.url.path in {"/admin", "/admin/"} or request.url.path.startswith(
            "/api/admin/"
        )
        if not settings.indexable or private:
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if private:
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self'; "
                "img-src 'self' data:; connect-src 'self'; font-src 'self'; "
                "base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
            )
        if private or request.url.path.startswith("/api/") or response.status_code >= 400:
            response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(router)
    app.include_router(admin_router)
    app.include_router(content_router)
    app.include_router(assistant_router)
    app.include_router(public_router)
    mount_builds(app, settings)
    return app
