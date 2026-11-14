"""API du studio, privée même pour les contenus prêts ou destinés à une diffusion publique."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import Field
from starlette.responses import FileResponse

from personal_site.api.admin import Session, require_session
from personal_site.content.catalog import catalog
from personal_site.content.schemas import MODELS, Model, Save, Transition
from personal_site.content.validation import ContentError, completeness, validate

router = APIRouter(prefix="/api/admin/content", dependencies=[Depends(require_session)])


def store(request):
    return request.app.state.content_store


def collection(kind):
    if kind not in MODELS:
        raise ContentError("Collection inconnue.", status=404)
    return kind


class Version(Model):
    version: Annotated[int, Field(strict=True, ge=1)]


@router.get("/catalog")
def get_catalog():
    return catalog()


@router.get("/media/usage")
def media_usage(request: Request):
    return request.app.state.media_files.usage()


@router.post("/media/upload", status_code=201)
async def upload(
    request: Request,
    session: Session,
    filename: Annotated[str, Query(min_length=1, max_length=256)],
):
    # There is deliberately no parsed body parameter. Auth/CSRF precede stream consumption.
    async with request.app.state.upload_lock:
        return await request.app.state.media_files.upload(request, filename)


@router.get("/media/{entry_id}/file")
def media_file(entry_id: int, request: Request):
    files = request.app.state.media_files
    file = files.file(entry_id)
    path = files.directory / file["storage_name"]
    if not path.is_file():
        raise ContentError(
            "Le fichier n'est plus présent dans le stockage. Vérifiez la sauvegarde.", status=404
        )
    return FileResponse(
        path,
        media_type=file["mime"],
        filename=file["original_name"],
        content_disposition_type="attachment" if file["mime"] == "application/pdf" else "inline",
    )


@router.get("/{kind}")
def listing(
    kind: str,
    request: Request,
    q: Annotated[str, Query(max_length=160)] = "",
    status: Literal["", "draft", "ready", "archived"] = "",
    sort: Literal["updated", "title", "order", "chronology"] = "updated",
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    nature: Annotated[str, Query(max_length=50)] = "",
    related: Annotated[int | None, Query(gt=0)] = None,
):
    return store(request).listing(
        collection(kind),
        query=q,
        status=status,
        sort=sort,
        page=page,
        limit=limit,
        nature=nature,
        related=related,
    )


@router.post("/{kind}/validate")
def validate_draft(kind: str, payload: Save, request: Request):
    content = store(request)
    data = validate(collection(kind), payload.entry)
    with content.admin.connect() as db:
        content.check_relations(db, kind, data)
        natures = {r["id"]: r["nature"] for r in db.execute("SELECT id, nature FROM media_assets")}
    return {"errors": completeness(kind, data, natures)}


@router.post("/{kind}", status_code=201)
def create(kind: str, payload: Save, request: Request):
    return store(request).save(collection(kind), payload.entry)


@router.get("/{kind}/{entry_id}")
def detail(kind: str, entry_id: int, request: Request):
    return store(request).get(collection(kind), entry_id)


@router.put("/{kind}/{entry_id}")
def update(kind: str, entry_id: int, payload: Save, request: Request):
    return store(request).save(
        collection(kind),
        payload.entry,
        entry_id=entry_id,
        version=payload.version,
        as_draft=payload.as_draft,
    )


@router.post("/{kind}/{entry_id}/check")
def check(kind: str, entry_id: int, request: Request):
    return {"errors": store(request).get(collection(kind), entry_id)["errors"]}


@router.post("/{kind}/{entry_id}/transition")
def transition(kind: str, entry_id: int, payload: Transition, request: Request):
    return store(request).transition(collection(kind), entry_id, payload.version, payload.status)


@router.post("/{kind}/{entry_id}/duplicate", status_code=201)
def duplicate(kind: str, entry_id: int, payload: Version, request: Request):
    return store(request).duplicate(collection(kind), entry_id, payload.version)


@router.delete("/{kind}/{entry_id}", status_code=204)
def delete(kind: str, entry_id: int, request: Request, version: Annotated[int, Query(ge=1)]):
    filename = store(request).delete(collection(kind), entry_id, version)
    if filename:
        (request.app.state.media_files.directory / filename).unlink(missing_ok=True)
    return Response(status_code=204)
