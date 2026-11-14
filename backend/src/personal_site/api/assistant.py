"""API privée de l'assistant. Les agents ne peuvent pas appeler l'application des lots."""

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from personal_site.admin.llm import ProviderError
from personal_site.api.admin import Session, limit, require_session
from personal_site.assistant.contracts import PreferencesUpdate, ProposalRequest, Turn

router = APIRouter(prefix="/api/admin/assistant", dependencies=[Depends(require_session)])


def service(request):
    return request.app.state.assistant


@router.get("/preferences")
def preferences(request: Request):
    return service(request).store.preferences()


@router.put("/preferences")
def update_preferences(payload: PreferencesUpdate, request: Request):
    return service(request).store.save_preferences(payload)


@router.get("/proposals/{ident}")
def proposal(ident: str, request: Request, session: Session):
    return service(request).store.get(session["token_hash"], ident)


@router.post("/proposals/{ident}/apply")
def apply_proposal(ident: str, payload: ProposalRequest, request: Request, session: Session):
    return service(request).store.apply(session["token_hash"], ident, payload.revision)


@router.post("/proposals/{ident}/cancel")
def cancel_proposal(ident: str, payload: ProposalRequest, request: Request, session: Session):
    return service(request).store.cancel(session["token_hash"], ident, payload.revision)


@router.post("/runs/{ident}/cancel")
async def cancel_run(ident: UUID, request: Request, session: Session):
    run = request.app.state.assistant_runs.get(str(ident))
    if run and run[0] == session["token_hash"]:
        run[1].cancel()
        await asyncio.gather(run[1], return_exceptions=True)
    return {"cancelled": True}


@router.post("/turn")
async def turn(payload: Turn, request: Request, session: Session):
    assistant = service(request)
    await run_in_threadpool(limit, assistant.store.admin, "assistant:global", 10, 60)
    config = await run_in_threadpool(assistant.store.admin.provider, decrypt=True)
    if not config["has_api_key"]:
        raise HTTPException(409, "Configurez une clé API dans les réglages AI provider.")
    lock = request.app.state.chat_lock
    if lock.locked():
        raise HTTPException(429, "Une génération est déjà en cours. Patientez ou annulez-la.")
    async with lock:
        task = asyncio.create_task(assistant.reply(payload, session["token_hash"], config))
        request.app.state.assistant_runs[str(payload.request_id)] = (session["token_hash"], task)
        try:
            while not task.done():
                await asyncio.wait({task}, timeout=0.25)
                if await request.is_disconnected():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                    raise HTTPException(499, "La connexion a été interrompue.")
            return task.result()
        except asyncio.CancelledError:
            raise HTTPException(
                409, "La génération a été annulée. Aucun contenu n'a été enregistré."
            ) from None
        except ProviderError as exc:
            raise HTTPException(exc.status, exc.message) from None
        finally:
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
            request.app.state.assistant_runs.pop(str(payload.request_id), None)
