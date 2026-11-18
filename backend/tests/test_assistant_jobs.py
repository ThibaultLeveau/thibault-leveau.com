"""Durable jobs traverse real HTTP, SQLite, LangChain and LangGraph with fake providers."""

import asyncio
import json
import time
from uuid import uuid4

import httpx
import pytest
from assistant_fakes import request_data, tool_response
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_admin import save_provider, sign_in
from test_assistant import ROOT, apply, owner

from personal_site.assistant.models import ModelFactory


class BulkProvider:
    def __init__(self, total, page_size=12, delay=0.002):
        self.total, self.page_size, self.delay = total, page_size, delay
        self.active = self.peak = self.calls = 0
        self.plans = []
        self.drafts = []
        self.input_sizes = []

    async def __call__(self, request):
        body = json.loads(request.content)
        data = request_data(body)
        self.input_sizes.append(len(request.content))
        tool = body["tools"][-1].get("function", body["tools"][-1])["name"]
        self.active += 1
        self.peak = max(self.peak, self.active)
        self.calls += 1
        try:
            await asyncio.sleep(self.delay)
            if tool == "Plan":
                start = data.get("job", {}).get("planned", 0)
                self.plans.append(start)
                end = min(self.total, start + self.page_size)
                result = {
                    "message": "Préparation de toutes les fiches demandées.",
                    "tasks": [
                        {
                            "key": f"entry_{i}",
                            "kind": "skills",
                            "fields": ["title", "summary"],
                            "brief": f"Fiche synthétique {i} explicitement demandée.",
                        }
                        for i in range(start, end)
                    ],
                    "has_more": end < self.total,
                    "continuation": str(end),
                    "total_tasks": self.total,
                }
            else:
                key = data["task"]["key"]
                self.drafts.append(key)
                result = {
                    "changes": {"title": f"Compétence {key}", "summary": "Donnée synthétique"}
                }
            return tool_response(body, tool, result)
        finally:
            self.active -= 1


def configure(client, provider):
    sign_in(client)
    save_provider(client)
    client.app.state.assistant.models = ModelFactory(httpx.MockTransport(provider))


def request_payload(message="Créer toutes les fiches synthétiques demandées."):
    return {
        "language": "fr",
        "request_id": str(uuid4()),
        "thread_id": str(uuid4()),
        "messages": [{"role": "user", "content": message}],
    }


def wait_job(client, ident, statuses=("review", "completed", "needs_input", "failed", "paused")):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        response = client.get(f"{ROOT}/jobs/{ident}")
        assert response.status_code == 200, response.text
        job = response.json()
        if job["status"] in statuses:
            return job
        time.sleep(0.02)
    pytest.fail(f"Work did not reach {statuses}: {job}")


def batches(client, ident):
    page, result = 1, []
    while True:
        response = client.get(f"{ROOT}/jobs/{ident}/batches", params={"page": page, "limit": 20})
        assert response.status_code == 200, response.text
        data = response.json()
        result.extend(item["proposal"] for item in data["items"])
        if page * 20 >= data["total"]:
            return result
        page += 1


@pytest.mark.parametrize("total", [13, 100])
def test_incremental_job_uses_real_subagents_and_preserves_every_entry(admin_client, total):
    c = admin_client
    provider = BulkProvider(total)
    configure(c, provider)
    payload = request_payload(f"Créer exactement {total} compétences synthétiques distinctes.")
    response = c.post(f"{ROOT}/turn", json=payload)
    assert response.status_code == 200, response.text
    job = response.json()["job"]
    assert job and response.json()["proposal"] is None
    ready = wait_job(c, job["id"])
    assert ready["status"] == "review", ready
    assert ready["planned"] == ready["prepared"] == total
    assert ready["applied"] == 0
    assert ready["delegations"] == total
    # Short fake responses need not overlap on a fast runner. The barrier-based
    # concurrency test separately proves saturation at three and queues a fourth call.
    assert 1 <= provider.peak <= 3
    assert len(provider.drafts) == len(set(provider.drafts)) == total
    assert provider.plans == list(range(0, total, 12))
    assert max(provider.input_sizes) < 100000
    assert c.get("/api/admin/content/skills").json()["total"] == 0
    calls = provider.calls
    repeat = c.post(f"{ROOT}/turn", json=payload)
    assert repeat.json()["job"]["id"] == job["id"]
    assert provider.calls == calls
    proposals = batches(c, job["id"])
    assert sum(len(proposal["items"]) for proposal in proposals) == total
    for proposal in proposals:
        assert proposal["expires"] is None
        saved = apply(c, proposal)
        assert saved.status_code == 200, saved.text
    complete = wait_job(c, job["id"])
    assert complete["status"] == "completed", complete
    assert complete["applied"] == total
    assert c.get("/api/admin/content/skills").json()["total"] == total
    assert apply(c, proposals[0]).status_code == 200
    assert c.get("/api/admin/content/skills").json()["total"] == total
    assert provider.calls == calls


def test_more_than_fifty_batches_keep_receipts_and_bounded_pages(admin_client):
    c = admin_client
    provider = BulkProvider(52, page_size=1)
    configure(c, provider)
    payload = request_payload()
    response = c.post(f"{ROOT}/jobs", json=payload)
    assert response.status_code == 200, response.text
    ident = response.json()["id"]
    assert c.post(f"{ROOT}/jobs", json=payload).json()["id"] == ident
    ready = wait_job(c, ident)
    assert ready["status"] == "review", ready
    proposals = batches(c, ident)
    assert len(proposals) == 52
    first_receipt = apply(c, proposals[0]).json()
    for proposal in proposals[1:]:
        assert apply(c, proposal).status_code == 200
    assert c.get(f"{ROOT}/proposals/{proposals[0]['id']}").json() == first_receipt
    assert apply(c, proposals[0]).json() == first_receipt
    assert c.get("/api/admin/content/skills").json()["total"] == 52
    page = c.get(f"{ROOT}/jobs/{ident}/batches", params={"page": 11, "limit": 5}).json()
    assert len(page["items"]) == 2 and page["total"] == 52
    assert c.get(f"{ROOT}/jobs/{ident}/batches", params={"limit": 21}).status_code == 422
    assert wait_job(c, ident)["status"] == "completed"


def test_jobs_require_session_csrf_and_are_deleted_without_deleting_content(admin_client):
    c = admin_client
    assert c.get(f"{ROOT}/jobs").status_code == 401
    configure(c, BulkProvider(1))
    headers = dict(c.headers)
    c.headers.pop("X-CSRF-Token", None)
    assert c.post(f"{ROOT}/jobs", json=request_payload()).status_code == 403
    c.headers.update(headers)
    response = c.post(f"{ROOT}/jobs", json=request_payload())
    ident = response.json()["id"]
    assert wait_job(c, ident)["status"] == "review"
    proposal = batches(c, ident)[0]
    assert apply(c, proposal).status_code == 200
    assert c.delete(f"{ROOT}/jobs/{ident}").json() == {"deleted": True}
    assert c.get(f"{ROOT}/jobs/{ident}").status_code == 404
    assert c.get(f"{ROOT}/proposals/{proposal['id']}").status_code == 404
    assert c.get("/api/admin/content/skills").json()["total"] == 1
    with c.app.state.admin_store.connect() as db:
        assert not db.execute("SELECT 1 FROM assistant_job_sections").fetchone()
        assert not db.execute("SELECT 1 FROM assistant_job_inputs").fetchone()


def test_more_than_forty_fact_segments_and_idempotent_input(admin_client):
    c = admin_client
    seen = []

    def provider(request):
        body = json.loads(request.content)
        data = request_data(body)
        seen.append(data)
        tool = body["tools"][-1].get("function", body["tools"][-1])["name"]
        assert tool == "Plan"
        return tool_response(
            body, tool, {"message": "Précision", "questions": [{"question": "La suite ?"}]}
        )

    configure(c, provider)
    ident = c.post(f"{ROOT}/jobs", json=request_payload("Brief initial conservé")).json()["id"]
    assert wait_job(c, ident)["status"] == "needs_input"
    for i in range(42):
        payload = {"message": f"Fait {i}", "request_id": str(uuid4())}
        assert c.post(f"{ROOT}/jobs/{ident}/input", json=payload).status_code == 200
        assert wait_job(c, ident)["status"] == "needs_input"
        assert c.post(f"{ROOT}/jobs/{ident}/input", json=payload).status_code == 200
    assert len(seen) == 43
    assert all(len(data["messages"]) == 1 for data in seen)
    assert seen[-1]["latest_input"] == {"sequence": 43, "message": "Fait 41"}
    store = c.app.state.assistant.jobs.store
    assert store.facts(ident, 11) == {
        "page": 11,
        "total": 43,
        "items": [
            {"sequence": 41, "message": "Fait 39"},
            {"sequence": 42, "message": "Fait 40"},
            {"sequence": 43, "message": "Fait 41"},
        ],
    }
    assert store.get(owner(c), ident)["status"] == "needs_input"
