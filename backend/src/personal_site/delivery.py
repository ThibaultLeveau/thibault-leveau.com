"""Distribution des artefacts construits, sans réécriture SPA."""

import re
from html import escape
from pathlib import Path

from fastapi import FastAPI, Request
from starlette.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from personal_site.config import Settings
from personal_site.content.public import PAGES, PATHS, PublicContent, address

HASHED_ASSET = re.compile(r"^assets/.+-[A-Za-z0-9_-]{8,}\.[a-zA-Z0-9]+$")


class BuildFiles(StaticFiles):
    def __init__(self, directory: Path, *, hashed_assets: bool = False) -> None:
        super().__init__(directory=directory, html=True)
        self.hashed_assets = hashed_assets

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        immutable = self.hashed_assets and HASHED_ASSET.fullmatch(path)
        response.headers["Cache-Control"] = (
            "public, max-age=31536000, immutable" if immutable else "no-cache"
        )
        return response


def mount_builds(app: FastAPI, settings: Settings) -> None:
    web = settings.static_dir / "web"
    documentation = settings.static_dir / "documentation"
    if settings.environment == "production":
        missing = [
            str(path / "index.html")
            for path in (web, documentation)
            if not (path / "index.html").is_file()
        ]
        if missing:
            raise RuntimeError("Artefacts manquants ; exécuter make build : " + ", ".join(missing))

    @app.api_route("/documentation", methods=["GET", "HEAD"], include_in_schema=False)
    async def documentation_redirect() -> RedirectResponse:
        return RedirectResponse("/documentation/", status_code=308)

    if documentation.is_dir():
        app.mount("/documentation", BuildFiles(documentation), name="documentation")
    if web.is_dir():

        def document(title, description, *, status=200):
            html = (web / "index.html").read_text()
            html = re.sub(
                r"<title>.*?</title>",
                lambda _: f"<title>{escape(title)} · Thibault Leveau</title>",
                html,
            )
            html = re.sub(
                r'<meta\s+name="description"\s+content="[^"]*"\s*/?>',
                lambda _: (
                    f'<meta name="description" content="{escape(description, quote=True)}" />'
                ),
                html,
            )
            return HTMLResponse(html, status_code=status, headers={"Cache-Control": "no-store"})

        def public_page(request: Request):
            name = PAGES[request.url.path.rstrip("/") or "/"]
            return document(name, f"{name} — projets, parcours et publications de Thibault Leveau.")

        for path in PAGES:
            app.add_api_route(path, public_page, methods=["GET", "HEAD"], include_in_schema=False)

        def public_redirect(request: Request):
            target = request.url.path.rstrip("/")
            if request.url.query:
                target += "?" + request.url.query
            return RedirectResponse(target, status_code=308)

        for path in PAGES:
            if path != "/":
                app.add_api_route(
                    path + "/", public_redirect, methods=["GET", "HEAD"], include_in_schema=False
                )

        def detail_handler(kind):
            def public_detail(entry_id: int, slug: str, request: Request):
                from personal_site.content.validation import ContentError

                try:
                    item = PublicContent(app.state.content_store).detail(kind, entry_id)
                except ContentError as exc:
                    if exc.status != 404:
                        raise
                    return document(
                        "Contenu introuvable", "Ce contenu n'est pas disponible.", status=404
                    )
                if request.url.path != address(item):
                    return RedirectResponse(
                        address(item), status_code=308, headers={"Cache-Control": "no-store"}
                    )
                data = item["entry"]
                return document(
                    data.get("seo_title") or item["title"],
                    data.get("seo_description") or item["summary"],
                )

            return public_detail

        for kind, prefix in PATHS.items():
            app.add_api_route(
                f"/{prefix}/{{entry_id:int}}/{{slug}}",
                detail_handler(kind),
                methods=["GET", "HEAD"],
                include_in_schema=False,
            )

        @app.api_route("/admin/", methods=["GET", "HEAD"], include_in_schema=False)
        async def admin_redirect():
            return RedirectResponse("/admin", status_code=308)

        @app.api_route("/admin", methods=["GET", "HEAD"], include_in_schema=False)
        async def admin_page():
            return FileResponse(web / "index.html", headers={"Cache-Control": "no-store"})

        app.mount("/", BuildFiles(web, hashed_assets=True), name="website")
