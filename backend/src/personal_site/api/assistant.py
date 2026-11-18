"""API privée de l'assistant. Les agents ne peuvent pas appeler l'application des lots."""

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from personal_site.admin.llm import ProviderError
from personal_site.api.admin import Session, limit, require_session
from personal_site.assistant.contracts import JobInput, PreferencesUpdate, ProposalRequest, Turn
from personal_site.i18n import tr

router = APIRouter(prefix="/api/admin/assistant", dependencies=[Depends(require_session)])


def service(request):
    return request.app.state.assistant


async def run_request(payload, request, owner, operation):
    """Keep both entry points cancellable throughout setup and durable handoff."""
    runs = request.app.state.assistant_runs
    ident = str(payload.request_id)
    if ident in runs:
        raise HTTPException(429, tr("errors.generationPending"))
    task = asyncio.create_task(operation())
    entry = (owner, task)
    runs[ident] = entry
    try:
        while not task.done():
            await asyncio.wait({task}, timeout=0.25)
            if await request.is_disconnected():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
                raise HTTPException(499, tr("errors.connectionInterrupted"))
        return task.result()
    except asyncio.CancelledError:
        raise HTTPException(409, tr("errors.generationCancelled")) from None
    except ProviderError as exc:
        raise HTTPException(exc.status, exc.message) from None
    finally:
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if task.cancelled():
            await service(request).jobs.interrupt_handoff(owner, payload.request_id)
        if runs.get(ident) is entry:
            runs.pop(ident, None)


@router.get("/preferences")
def preferences(request: Request):
    return service(request).store.preferences()


@router.put("/preferences")
def update_preferences(payload: PreferencesUpdate, request: Request):
    return service(request).store.save_preferences(payload)


@router.get("/proposals/{ident}")
def proposal(ident: str, request: Request, session: Session):
    if ident.startswith("job_"):
        return service(request).jobs.store.proposal(session["token_hash"], ident)
    return service(request).store.get(session["token_hash"], ident)


@router.post("/proposals/{ident}/apply")
async def apply_proposal(ident: str, payload: ProposalRequest, request: Request, session: Session):
    if ident.startswith("job_"):
        return await service(request).jobs.apply(session["token_hash"], ident, payload.revision)
    return await run_in_threadpool(
        service(request).store.apply, session["token_hash"], ident, payload.revision
    )


@router.post("/proposals/{ident}/cancel")
async def cancel_proposal(ident: str, payload: ProposalRequest, request: Request, session: Session):
    if ident.startswith("job_"):
        return await service(request).jobs.cancel_proposal(
            session["token_hash"], ident, payload.revision
        )
    return await run_in_threadpool(
        service(request).store.cancel, session["token_hash"], ident, payload.revision
    )


@router.get("/jobs")
def jobs(
    request: Request,
    session: Session,
    page: int = Query(1, ge=1, le=92233720368547758),
    limit: int = Query(10, ge=1, le=20),
):
    return service(request).jobs.store.listing(session["token_hash"], page, limit)


@router.post("/jobs")
async def create_job(payload: Turn, request: Request, session: Session):
    owner = session["token_hash"]
    return await run_request(
        payload, request, owner, lambda: create_job_result(payload, service(request), owner)
    )


async def create_job_result(payload, assistant, owner):
    existing = await run_in_threadpool(assistant.jobs.store.find, owner, payload.request_id)
    if existing:
        if existing["status"] in {"queued", "running"}:
            assistant.jobs.start(existing["id"])
        return existing
    await run_in_threadpool(limit, assistant.store.admin, "assistant:global", 10, 60)
    config = await run_in_threadpool(assistant.store.admin.provider, decrypt=True)
    if not config["has_api_key"]:
        raise HTTPException(409, tr("errors.configureProvider"))
    return await assistant.jobs.create(payload, owner, config)


@router.get("/jobs/{ident}")
async def job(ident: str, request: Request, session: Session):
    manager = service(request).jobs
    result = await run_in_threadpool(manager.store.get, session["token_hash"], ident)
    if result["status"] in {"queued", "running"}:
        manager.start(ident)
    return result


@router.get("/jobs/{ident}/batches")
def job_batches(
    ident: str,
    request: Request,
    session: Session,
    page: int = Query(1, ge=1, le=92233720368547758),
    limit: int = Query(10, ge=1, le=20),
):
    return service(request).jobs.store.batches(session["token_hash"], ident, page, limit)


@router.post("/jobs/{ident}/pause")
async def pause_job(ident: str, request: Request, session: Session):
    return await service(request).jobs.change(session["token_hash"], ident, "pause")


@router.post("/jobs/{ident}/resume")
async def resume_job(ident: str, request: Request, session: Session):
    return await service(request).jobs.change(session["token_hash"], ident, "resume")


@router.post("/jobs/{ident}/cancel")
async def cancel_job(ident: str, request: Request, session: Session):
    return await service(request).jobs.change(session["token_hash"], ident, "cancel")


@router.post("/jobs/{ident}/input")
async def job_input(ident: str, payload: JobInput, request: Request, session: Session):
    return await service(request).jobs.input(
        session["token_hash"], ident, payload.message, payload.request_id
    )


@router.delete("/jobs/{ident}")
async def delete_job(ident: str, request: Request, session: Session):
    return await service(request).jobs.delete(session["token_hash"], ident)


@router.post("/runs/{ident}/cancel")
async def cancel_run(ident: UUID, request: Request, session: Session):
    run = request.app.state.assistant_runs.get(str(ident))
    if run and run[0] == session["token_hash"]:
        run[1].cancel()
        await asyncio.gather(run[1], return_exceptions=True)
    # The response may have left the registry before the browser receives it.
    # Its request id still identifies the newly persisted work in that interval.
    await service(request).jobs.interrupt_handoff(session["token_hash"], ident)
    return {"cancelled": True}


@router.post("/turn")
async def turn(payload: Turn, request: Request, session: Session):
    owner = session["token_hash"]
    return await run_request(payload, request, owner, lambda: turn_result(payload, request, owner))


async def turn_result(payload, request, owner):
    assistant = service(request)
    existing = await run_in_threadpool(assistant.jobs.store.find, owner, payload.request_id)
    if existing:
        if existing["status"] in {"queued", "running"}:
            assistant.jobs.start(existing["id"])
        return {
            "message": existing["message"],
            "questions": existing["questions"],
            "proposal": None,
            "job": existing,
            "provider": existing["provider"],
            "model": existing["model"],
            "calls": existing["calls"],
            "delegations": existing["delegations"],
        }
    await run_in_threadpool(limit, assistant.store.admin, "assistant:global", 10, 60)
    config = await run_in_threadpool(assistant.store.admin.provider, decrypt=True)
    if not config["has_api_key"]:
        raise HTTPException(409, tr("errors.configureProvider"))
    lock = request.app.state.chat_lock
    if lock.locked():
        raise HTTPException(429, tr("errors.generationPending"))
    async with lock:
        return await assistant.reply(payload, owner, config)
