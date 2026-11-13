"""Distribution des artefacts construits, sans réécriture SPA."""

import re
from pathlib import Path

from fastapi import FastAPI
from starlette.responses import RedirectResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from personal_site.config import Settings

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
        app.mount("/", BuildFiles(web, hashed_assets=True), name="website")
