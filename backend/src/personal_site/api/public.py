"""Lecture publique uniquement ; sélection et confidentialité appartiennent au domaine."""

from functools import lru_cache
from io import BytesIO
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request
from PIL import Image, ImageOps
from starlette.responses import FileResponse, Response

from personal_site.content.public import PublicContent, missing

router = APIRouter(prefix="/api/public")


@lru_cache(maxsize=24)
def image_bytes(path, digest, width):
    # Bounded, ephemeral derivatives; no new durable storage. Authorization precedes cache use.
    with Image.open(path) as original:
        image = ImageOps.exif_transpose(original)
        image.thumbnail((width, width))
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGB")
        output = BytesIO()
        image.save(output, "WEBP", quality=82)
        return output.getvalue()


@router.api_route("/media/{entry_id}/image", methods=["GET", "HEAD"])
def image_file(entry_id: int, request: Request, width: Literal["480", "960", "1600"] = "960"):
    public = store(request)
    public.public_filename("media", entry_id)
    files = request.app.state.media_files
    file = files.file(entry_id)
    if not file["mime"].startswith("image/"):
        missing()
    path = files.directory / file["storage_name"]
    if not path.is_file():
        missing()
    return Response(
        image_bytes(path, file["sha256"], int(width)),
        media_type="image/webp",
        headers={"Cache-Control": "no-store"},
    )


def store(request):
    return PublicContent(request.app.state.content_store)


@router.get("/home")
def home(request: Request):
    return store(request).home()


@router.get("/entries")
def listing(
    request: Request,
    kind: Annotated[str, Query(max_length=30)] = "",
    q: Annotated[str, Query(max_length=160)] = "",
    page: Annotated[int, Query(ge=1, le=100000)] = 1,
    limit: Annotated[int, Query(ge=1, le=48)] = 12,
    sort: Literal["selection", "title", "recent"] = "selection",
    related: Annotated[int | None, Query(gt=0)] = None,
):
    return store(request).listing(
        kind=kind, query=q, page=page, limit=limit, sort=sort, related=related
    )


@router.get("/entries/{kind}/{entry_id}")
def detail(kind: str, entry_id: int, request: Request):
    return store(request).detail(kind, entry_id)


@router.api_route("/media/{entry_id}/file", methods=["GET", "HEAD"])
def media_file(entry_id: int, request: Request):
    public = store(request)
    name = public.public_filename("media", entry_id)
    files = request.app.state.media_files
    file = files.file(entry_id)
    path = files.directory / file["storage_name"]
    if not path.is_file():
        missing()
    return FileResponse(
        path,
        media_type=file["mime"],
        filename=name + path.suffix,
        content_disposition_type="attachment" if file["mime"] == "application/pdf" else "inline",
        headers={"Cache-Control": "no-store"},
    )
