"""In-process lifecycle for durable assistant work, independent of HTTP connections."""

import asyncio
import logging

import httpx
import httpx2
from langsmith import tracing_context
from starlette.concurrency import run_in_threadpool

from personal_site.admin.llm import ProviderError
from personal_site.assistant.job_steps import JobSteps
from personal_site.assistant.job_store import ACTIVE, JobStore
from personal_site.content.validation import ContentError
from personal_site.i18n import current_language, tr

logger = logging.getLogger(__name__)


class JobManager:
    def __init__(self, assistant):
        self.assistant = assistant
        self.store = JobStore(assistant.store)
        self.steps = JobSteps(self)
        self.running = {}
        self.commands = asyncio.Lock()
        self.closing = False
        self.store.recover()

    def start(self, ident):
        if not self.closing and (ident not in self.running or self.running[ident].done()):
            self.running[ident] = asyncio.create_task(self._run(ident))

    async def stop(self, ident):
        task = self.running.get(ident)
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        self.running.pop(ident, None)

    async def close(self):
        self.closing = True
        for ident in list(self.running):
            await self.stop(ident)
        await run_in_threadpool(self.store.recover)

    async def create(self, turn, owner, config, plan=None, calls=0):
        if turn.translation:
            raise ContentError(tr("jobs.translationDirect"), status=422)
        # Cancelling an await cannot stop SQLite's worker thread. Keep its result reachable
        # until the durable handoff has either started or been explicitly paused.
        transfer = asyncio.create_task(
            run_in_threadpool(self.store.create, turn, owner, config, plan, calls)
        )
        try:
            job = await asyncio.shield(transfer)
        except asyncio.CancelledError:
            # A second cancel (HTTP disconnect plus explicit stop) must not interrupt this
            # short ownership transfer. Cancellation is acknowledged only after persistence.
            cleanup = asyncio.create_task(self._pause_transfer(transfer))
            while not cleanup.done():
                try:
                    await asyncio.shield(cleanup)
                except asyncio.CancelledError:
                    continue
            cleanup.result()
            raise
        if job["status"] in ACTIVE:
            self.start(job["id"])
        return job

    async def _pause_transfer(self, transfer):
        try:
            job = await transfer
        except Exception:
            # A rejected/rolled-back creation owns no runnable work. The original request
            # is already cancelled, so do not replace it with a provider or storage error.
            return
        async with self.commands:
            await run_in_threadpool(self.store.transition, job["id"], "paused", "jobs.interrupted")
            await self.stop(job["id"])

    async def interrupt_handoff(self, owner, request_id):
        """A cancellation arriving just after create() returned still pauses its new job."""
        async with self.commands:
            with self.store.admin.connect() as db:
                row = db.execute(
                    "SELECT id,status FROM assistant_jobs WHERE request_id=? AND owner=?",
                    (str(request_id), owner),
                ).fetchone()
            if row and row["status"] in ACTIVE:
                await run_in_threadpool(
                    self.store.transition, row["id"], "paused", "jobs.interrupted"
                )
                await self.stop(row["id"])

    async def change(self, owner, ident, action):
        # Persist the stop before cancelling workers so the transport guard rejects all
        # queued model/tool retries. A successful response follows worker cancellation.
        async with self.commands:
            await run_in_threadpool(self.store.change, owner, ident, action)
            if action == "resume":
                self.start(ident)
            else:
                await self.stop(ident)
            return await run_in_threadpool(self.store.get, owner, ident)

    async def input(self, owner, ident, message, request_id=None):
        async with self.commands:
            job = await run_in_threadpool(self.store.add_input, owner, ident, message, request_id)
            if job["status"] in ACTIVE:
                self.start(ident)
            return job

    async def delete(self, owner, ident):
        async with self.commands:
            job = await run_in_threadpool(self.store.get, owner, ident)
            if job["status"] not in {"completed", "cancelled"}:
                await run_in_threadpool(self.store.change, owner, ident, "cancel")
            await self.stop(ident)
            return await run_in_threadpool(self.store.delete, owner, ident)

    async def apply(self, owner, ident, revision):
        async with self.commands:
            return await self._apply(owner, ident, revision)

    async def _apply(self, owner, ident, revision):
        proposal = await run_in_threadpool(self.store.apply, owner, ident, revision)
        with self.store.admin.connect() as db:
            row = db.execute(
                "SELECT j.id,j.status FROM assistant_jobs j JOIN assistant_job_batches b "
                "ON b.job_id=j.id WHERE b.id=?",
                (ident,),
            ).fetchone()
        if row and row["status"] == "review":
            # Applying a reviewed batch permits preparation of its deferred links, but a
            # paused/stopped job stays paused. No business write is performed by the worker.
            if await run_in_threadpool(self.store.continue_links, owner, row["id"]):
                self.start(row["id"])
        return proposal

    async def cancel_proposal(self, owner, ident, revision):
        async with self.commands:
            return await self._cancel_proposal(owner, ident, revision)

    async def _cancel_proposal(self, owner, ident, revision):
        proposal = await run_in_threadpool(self.store.cancel_proposal, owner, ident, revision)
        with self.store.admin.connect() as db:
            row = db.execute(
                "SELECT b.job_id,j.status,j.error_key FROM assistant_job_batches b "
                "JOIN assistant_jobs j ON j.id=b.job_id WHERE b.id=?",
                (ident,),
            ).fetchone()
        if row and row["status"] == "paused" and row["error_key"] == "jobs.batchCancelled":
            await self.stop(row["job_id"])
        return proposal

    async def _run(self, ident):
        token = None
        try:
            job = await run_in_threadpool(self.store.raw, ident)
            if job["status"] not in ACTIVE:
                return
            token = current_language.set(job["interface_language"])
            config = await run_in_threadpool(self.store.guard, ident)
            await run_in_threadpool(self.store.transition, ident, "running")
            with tracing_context(enabled=False):
                while True:
                    await run_in_threadpool(self.store.guard, ident)
                    job = await run_in_threadpool(self.store.raw, ident)
                    questions = await run_in_threadpool(self.steps.questions, ident)
                    if questions:
                        await run_in_threadpool(
                            self.store.transition, ident, "needs_input", None, questions
                        )
                        return
                    await run_in_threadpool(self.steps.consolidate, ident)
                    await run_in_threadpool(self.steps.consolidate_links, ident)
                    if await run_in_threadpool(self.steps.prepare_content, ident):
                        continue
                    work = await run_in_threadpool(self.steps.claim, ident)
                    if work:
                        await self.steps.sections(job, config, work)
                        continue
                    if not job["plan_done"]:
                        await self.steps.plan(job, config)
                        continue
                    if await run_in_threadpool(self.steps.prepare_links, ident):
                        continue
                    if await run_in_threadpool(self.steps.missing_dependencies, ident):
                        await run_in_threadpool(
                            self.store.transition,
                            ident,
                            "needs_input",
                            "jobs.missingDependency",
                            [
                                {
                                    "question": tr("jobs.missingDependency"),
                                    "reason": "",
                                    "fields": [],
                                }
                            ],
                        )
                        return
                    await run_in_threadpool(self.store.transition, ident, "review")
                    with self.store.admin.connect() as db:
                        db.execute("BEGIN IMMEDIATE")
                        self.store.finish_if_ready(db, ident)
                    return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Never persist raw SDK exceptions, prompts, credentials or provider responses.
            key, status = self._failure(exc)
            try:
                job = await run_in_threadpool(self.store.raw, ident)
                if job["status"] in ACTIVE:
                    questions = []
                    if isinstance(exc, ContentError) and status == "needs_input":
                        questions = [
                            {
                                "question": exc.message,
                                "reason": " ".join(error["message"] for error in exc.errors[:5]),
                                "fields": [],
                            }
                        ]
                    await run_in_threadpool(self.store.transition, ident, status, key, questions)
            except ContentError:
                pass
            logger.warning("assistant_job_failure id=%s category=%s", ident, type(exc).__name__)
        finally:
            if token is not None:
                current_language.reset(token)
            if self.running.get(ident) is asyncio.current_task():
                self.running.pop(ident, None)
            # An apply/input may enqueue work while the previous runner is just returning.
            # Its persisted queued state is the wake-up signal; do not lose that edge.
            if not self.closing:
                try:
                    job = await run_in_threadpool(self.store.raw, ident)
                except ContentError:
                    pass
                else:
                    if job["status"] == "queued":
                        self.start(ident)

    @staticmethod
    def _failure(exc):
        cause, seen = exc, set()
        while cause and id(cause) not in seen:
            seen.add(id(cause))
            if isinstance(cause, ContentError):
                if cause.status == 401:
                    return "jobs.sessionExpired", "paused"
                if cause.message == tr("jobs.providerChanged"):
                    return "jobs.providerChanged", "paused"
                if cause.message == tr("jobs.notRunning"):
                    return "jobs.interrupted", "paused"
                return "jobs.validationFailed", "needs_input"
            if isinstance(cause, ProviderError):
                if cause.message == tr("errors.providerQuota"):
                    return "errors.providerQuota", "failed"
                if cause.status == 504:
                    return "errors.providerTimeout", "failed"
                return "errors.generationFailed", "failed"
            if isinstance(cause, (TimeoutError, httpx.TimeoutException, httpx2.TimeoutException)):
                return "errors.providerTimeout", "failed"
            cause = cause.__cause__ or cause.__context__
        return "errors.generationFailed", "failed"
