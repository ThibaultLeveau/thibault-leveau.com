"""The durable and conversational graphs share one provider concurrency limit."""

import asyncio
import json
import threading
from collections import Counter

import httpx
import pytest
from assistant_fakes import request_data
from test_admin import ORIGIN
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_assistant import ROOT
from test_assistant_jobs import BulkProvider, configure, request_payload


def test_multiple_jobs_and_classic_turn_share_three_provider_slots(admin_client):
    c = admin_client
    bulk = BulkProvider(3, delay=0.01)
    classic = BulkProvider(2, delay=0.01)

    async def run():
        release = asyncio.Event()
        turn_entered = asyncio.Event()
        saturated = asyncio.Event()
        active = Counter()
        sources = Counter()
        peak = 0

        async def provider(request):
            nonlocal peak
            data = request_data(json.loads(request.content))
            source = data.get("job", {}).get("id", "turn")
            active[source] += 1
            sources[source] += 1
            concurrent = active.total()
            peak = max(peak, concurrent)
            if source == "turn":
                turn_entered.set()
            if concurrent == 3:
                saturated.set()
            try:
                await release.wait()
                return await (classic if source == "turn" else bulk)(request)
            finally:
                active[source] -= 1

        configure(c, provider)
        assistant = c.app.state.assistant
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=c.app),
            base_url=ORIGIN,
            cookies=dict(c.cookies),
            headers=dict(c.headers),
        ) as ac:
            turn = asyncio.create_task(ac.post(f"{ROOT}/turn", json=request_payload()))
            jobs = []
            try:
                await asyncio.wait_for(turn_entered.wait(), timeout=10)
                for _ in range(2):
                    response = await ac.post(f"{ROOT}/jobs", json=request_payload())
                    assert response.status_code == 200, response.text
                    jobs.append(response.json()["id"])
                await asyncio.wait_for(saturated.wait(), timeout=10)
                assert set(sources) == {"turn", *jobs}
                assert all(active[source] == 1 for source in sources)

                response = await ac.post(f"{ROOT}/jobs", json=request_payload())
                assert response.status_code == 200, response.text
                jobs.append(response.json()["id"])
                # Wait for the fourth invocation at the real semaphore, not an elapsed
                # delay, before releasing the three held provider responses.
                async with asyncio.timeout(10):
                    while not any(
                        not waiter.done() for waiter in assistant.semaphore._waiters or ()
                    ):
                        assert peak == 3, "A fourth provider call bypassed the global limit"
                        await asyncio.sleep(0.005)
                assert jobs[-1] not in sources
                assert active.total() == peak == 3
                release.set()

                response = await asyncio.wait_for(turn, timeout=30)
                assert response.status_code == 200, response.text
                reply = response.json()
                assert reply["job"] is None
                assert len(reply["proposal"]["items"]) == 2

                async with asyncio.timeout(30):
                    for ident in jobs:
                        while True:
                            response = await ac.get(f"{ROOT}/jobs/{ident}")
                            assert response.status_code == 200, response.text
                            job = response.json()
                            if job["status"] not in {"queued", "running"}:
                                break
                            await asyncio.sleep(0.01)
                        assert job["status"] == "review", job
                        assert job["prepared"] == job["planned"] == 3
                        assert job["delegations"] == 3
                        assert job["applied"] == 0

                assert peak == 3
                assert active.total() == 0
                assert sources == Counter({"turn": 3, **dict.fromkeys(jobs, 4)})
                assert classic.calls == 3 and bulk.calls == 12
                assert (await ac.get("/api/admin/content/skills")).json()["total"] == 0
            finally:
                release.set()
                if not turn.done():
                    turn.cancel()
                await asyncio.gather(turn, return_exceptions=True)
                for ident in jobs:
                    await assistant.jobs.stop(ident)

    asyncio.run(run())


@pytest.mark.parametrize("endpoint", ["turn", "jobs"])
@pytest.mark.parametrize("after_commit", [False, True])
def test_cancel_during_durable_handoff_leaves_paused_work_and_no_orphan_runner(
    admin_client, monkeypatch, endpoint, after_commit
):
    c = admin_client
    provider = BulkProvider(13)
    configure(c, provider)
    manager = c.app.state.assistant.jobs
    original_create = manager.store.create
    entered = threading.Event()
    release = threading.Event()
    saved = []

    def hold_committed_job(*args, **kwargs):
        if after_commit:
            job = original_create(*args, **kwargs)
            saved.append(job["id"])
        entered.set()
        assert release.wait(15), "The test must release the pending creation"
        if not after_commit:
            job = original_create(*args, **kwargs)
            saved.append(job["id"])
        return job

    monkeypatch.setattr(manager.store, "create", hold_committed_job)

    async def run():
        payload = request_payload()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=c.app),
            base_url=ORIGIN,
            cookies=dict(c.cookies),
            headers=dict(c.headers),
        ) as ac:
            turn = asyncio.create_task(ac.post(f"{ROOT}/{endpoint}", json=payload))
            cancellation = None
            try:
                async with asyncio.timeout(10):
                    while not entered.is_set():
                        await asyncio.sleep(0.005)
                runner = c.app.state.assistant_runs[payload["request_id"]][1]
                cancellation = asyncio.create_task(
                    ac.post(f"{ROOT}/runs/{payload['request_id']}/cancel")
                )
                async with asyncio.timeout(5):
                    while not runner.cancelling():
                        await asyncio.sleep(0.005)
                assert not cancellation.done(), "Stop must await the persisted pause"
                release.set()
                response = await asyncio.wait_for(cancellation, timeout=10)
                assert response.status_code == 200, response.text
                assert (await turn).status_code == 409
                expected_calls = int(endpoint == "turn")
                assert provider.calls == expected_calls
                assert not manager.running

                ident = saved[0]
                response = await ac.get(f"{ROOT}/jobs/{ident}")
                assert response.status_code == 200, response.text
                assert response.json()["status"] == "paused"
                retry = await ac.post(f"{ROOT}/{endpoint}", json=payload)
                assert retry.status_code == 200, retry.text
                job = retry.json()["job"] if endpoint == "turn" else retry.json()
                assert job["id"] == ident
                assert job["status"] == "paused"
                assert (await ac.get(f"{ROOT}/jobs")).json()["total"] == 1
                assert provider.calls == expected_calls
                assert not manager.running
                assert (await ac.get("/api/admin/content/skills")).json()["total"] == 0
            finally:
                release.set()
                if not turn.done():
                    turn.cancel()
                await asyncio.gather(
                    *([turn, cancellation] if cancellation else [turn]), return_exceptions=True
                )
                for ident in saved:
                    await manager.stop(ident)

    asyncio.run(run())


def test_cancel_explicit_job_after_creation_response_stops_its_background_work(admin_client):
    c = admin_client

    async def run():
        entered = asyncio.Event()
        release = asyncio.Event()
        calls = 0

        async def provider(request):
            nonlocal calls
            calls += 1
            entered.set()
            await release.wait()
            raise AssertionError("The pending model request should be cancelled")

        configure(c, provider)
        manager = c.app.state.assistant.jobs
        payload = request_payload()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=c.app),
            base_url=ORIGIN,
            cookies=dict(c.cookies),
            headers=dict(c.headers),
        ) as ac:
            response = await ac.post(f"{ROOT}/jobs", json=payload)
            assert response.status_code == 200, response.text
            ident = response.json()["id"]
            try:
                await asyncio.wait_for(entered.wait(), timeout=10)
                assert payload["request_id"] not in c.app.state.assistant_runs
                response = await ac.post(f"{ROOT}/runs/{payload['request_id']}/cancel")
                assert response.status_code == 200, response.text
                assert ident not in manager.running
                assert calls == 1
                assert (await ac.get(f"{ROOT}/jobs/{ident}")).json()["status"] == "paused"
                retry = await ac.post(f"{ROOT}/jobs", json=payload)
                assert retry.status_code == 200, retry.text
                assert retry.json()["id"] == ident
                assert retry.json()["status"] == "paused"
                assert calls == 1
                assert ident not in manager.running
                assert (await ac.get("/api/admin/content/skills")).json()["total"] == 0
            finally:
                release.set()
                await manager.stop(ident)

    asyncio.run(run())


def test_replaying_cancelled_batch_does_not_stop_resumed_work(admin_client):
    c = admin_client
    bulk = BulkProvider(6)

    async def run():
        entered = asyncio.Event()
        release = asyncio.Event()
        held = 0

        async def provider(request):
            nonlocal held
            data = request_data(json.loads(request.content))
            if data.get("task", {}).get("key") in {"entry_3", "entry_4", "entry_5"}:
                held += 1
                if held == 3:
                    entered.set()
                try:
                    await release.wait()
                finally:
                    held -= 1
            return await bulk(request)

        configure(c, provider)
        manager = c.app.state.assistant.jobs
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=c.app),
            base_url=ORIGIN,
            cookies=dict(c.cookies),
            headers=dict(c.headers),
        ) as ac:
            response = await ac.post(f"{ROOT}/jobs", json=request_payload())
            assert response.status_code == 200, response.text
            ident = response.json()["id"]
            try:
                await asyncio.wait_for(entered.wait(), timeout=10)
                response = await ac.get(f"{ROOT}/jobs/{ident}/batches")
                old = response.json()["items"][0]["proposal"]
                cancel_url = f"{ROOT}/proposals/{old['id']}/cancel"
                cancelled = await ac.post(cancel_url, json={"revision": old["revision"]})
                assert cancelled.status_code == 200, cancelled.text
                assert (await ac.get(f"{ROOT}/jobs/{ident}")).json()["status"] == "paused"
                assert ident not in manager.running

                entered.clear()
                response = await ac.post(f"{ROOT}/jobs/{ident}/resume")
                assert response.status_code == 200, response.text
                await asyncio.wait_for(entered.wait(), timeout=10)
                runner = manager.running[ident]
                assert not runner.done()
                before = (await ac.get(f"{ROOT}/jobs/{ident}")).json()
                assert before["status"] == "running"

                replay = await ac.post(cancel_url, json={"revision": old["revision"]})
                assert replay.status_code == 200, replay.text
                assert replay.json() == cancelled.json()
                assert manager.running.get(ident) is runner
                assert not runner.done()
                assert (await ac.get(f"{ROOT}/jobs/{ident}")).json() == before

                release.set()
                async with asyncio.timeout(20):
                    while True:
                        job = (await ac.get(f"{ROOT}/jobs/{ident}")).json()
                        if job["status"] not in {"queued", "running"}:
                            break
                        await asyncio.sleep(0.01)
                assert job["status"] == "review", job
                assert job["prepared"] == 6
                assert job["applied"] == 0
                assert (await ac.get("/api/admin/content/skills")).json()["total"] == 0
            finally:
                release.set()
                await manager.stop(ident)

    asyncio.run(run())
