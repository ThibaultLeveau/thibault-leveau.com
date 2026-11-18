"""Interrupted, failed and revised work keeps successful durable stages."""

import asyncio
import json
import threading
import time

import httpx
from assistant_fakes import ScriptedProvider, request_data, tool_response
from test_admin import API_KEY, save_provider
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_assistant import ROOT, apply
from test_assistant_jobs import BulkProvider, batches, configure, request_payload, wait_job
from test_content import create, update

from personal_site.assistant.models import ModelFactory
from personal_site.assistant.registry import PRIVATE_FIELDS
from personal_site.content.schemas import MODELS


def test_pause_cancel_guard_before_every_new_call_and_confirm_worker_stop(admin_client):
    c = admin_client
    base = BulkProvider(13)
    started = threading.Event()
    hold = True
    calls = []

    async def provider(request):
        data = request_data(json.loads(request.content))
        calls.append(data.get("task", {}).get("key", "plan"))
        if "task" in data and hold:
            started.set()
            await asyncio.sleep(30)
        return await base(request)

    configure(c, provider)
    ident = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    assert started.wait(10)
    paused = c.post(f"{ROOT}/jobs/{ident}/pause")
    assert paused.status_code == 200 and paused.json()["status"] == "paused"
    count = len(calls)
    time.sleep(0.05)
    assert len(calls) == count
    assert ident not in c.app.state.assistant.jobs.running
    hold = False
    assert c.post(f"{ROOT}/jobs/{ident}/resume").status_code == 200
    assert wait_job(c, ident)["prepared"] == 13
    proposal = batches(c, ident)[0]
    assert apply(c, proposal).status_code == 200
    saved = c.get("/api/admin/content/skills").json()["total"]
    response = c.post(f"{ROOT}/jobs/{ident}/cancel")
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    count = len(calls)
    assert apply(c, proposal).status_code == 200
    for pending in batches(c, ident)[1:]:
        assert apply(c, pending).status_code == 409
    time.sleep(0.05)
    assert len(calls) == count
    assert c.get("/api/admin/content/skills").json()["total"] == saved


def test_provider_quota_resume_keeps_completed_specialists_and_errors_private(admin_client):
    c = admin_client
    base = BulkProvider(6)
    fail = True
    attempts = []

    async def provider(request):
        body = json.loads(request.content)
        data = request_data(body)
        key = data.get("task", {}).get("key")
        if key:
            attempts.append(key)
        if fail and key == "entry_1":
            await asyncio.sleep(0.2)
            return httpx.Response(429, json={"error": API_KEY + " raw private provider error"})
        if fail and key == "entry_2":
            await asyncio.sleep(1)
        return await base(request)

    configure(c, provider)
    ident = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    failed = wait_job(c, ident)
    assert failed["status"] == "failed", failed
    assert API_KEY not in json.dumps(failed)
    assert "quota" in failed["error"].lower()
    with c.app.state.admin_store.connect() as db:
        assert (
            db.execute(
                "SELECT state FROM assistant_job_sections WHERE job_id=? AND task_key='entry_0'",
                (ident,),
            ).fetchone()[0]
            == "done"
        )
    fail = False
    assert c.post(f"{ROOT}/jobs/{ident}/resume").status_code == 200
    ready = wait_job(c, ident)
    assert ready["status"] == "review" and ready["prepared"] == 6
    assert attempts.count("entry_0") == 1
    assert attempts.count("entry_1") == 2
    assert c.get("/api/admin/content/skills").json()["total"] == 0


def test_provider_change_freezes_work_and_refuses_implicit_switch(admin_client):
    c = admin_client
    provider = BulkProvider(13, delay=0.025)
    configure(c, provider)
    ident = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    c.post(f"{ROOT}/jobs/{ident}/pause")
    save_provider(c, model="another-model")
    assert c.post(f"{ROOT}/jobs/{ident}/resume").status_code == 409
    assert c.post(f"{ROOT}/jobs/{ident}/input", json={"message": "Suite"}).status_code == 409
    save_provider(c)
    assert c.post(f"{ROOT}/jobs/{ident}/resume").status_code == 200
    ready = wait_job(c, ident)
    assert ready["status"] == "review" and ready["model"] == "test-model"


def test_cancelled_batch_replay_cannot_reopen_completed_or_cancelled_work(admin_client):
    c = admin_client
    configure(c, BulkProvider(1))
    ident = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    assert wait_job(c, ident)["status"] == "review"
    old = batches(c, ident)[0]
    cancel_url = f"{ROOT}/proposals/{old['id']}/cancel"
    cancelled = c.post(cancel_url, json={"revision": old["revision"]})
    assert cancelled.status_code == 200
    assert c.post(f"{ROOT}/jobs/{ident}/resume").status_code == 200
    assert wait_job(c, ident)["status"] == "review"
    replacement = [p for p in batches(c, ident) if p["state"] == "pending"][0]
    assert apply(c, replacement).status_code == 200
    completed = wait_job(c, ident)
    assert completed["status"] == "completed"
    assert c.post(cancel_url, json={"revision": old["revision"]}).json() == cancelled.json()
    assert c.get(f"{ROOT}/jobs/{ident}").json() == completed
    assert c.get("/api/admin/content/skills").json()["total"] == 1

    second_provider = ScriptedProvider(
        {
            "message": "Autre fiche",
            "tasks": [
                {"key": "other", "kind": "skills", "fields": ["title"], "brief": "Autre fiche"}
            ],
        },
        {"other": {"title": "Autre compétence"}},
    )
    c.app.state.assistant.models = ModelFactory(httpx.MockTransport(second_provider))
    second = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    assert wait_job(c, second)["status"] == "review"
    proposal = batches(c, second)[0]
    assert c.post(f"{ROOT}/jobs/{second}/cancel").status_code == 200
    assert (
        c.post(f"{ROOT}/proposals/{proposal['id']}/cancel", json={"revision": 1}).status_code == 200
    )
    assert c.get(f"{ROOT}/jobs/{second}").json()["status"] == "cancelled"


def test_correction_after_pause_replaces_only_unapplied_batches(admin_client):
    c = admin_client
    initial = BulkProvider(6)
    configure(c, initial)
    ident = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    assert wait_job(c, ident)["status"] == "review"
    old = batches(c, ident)
    receipt = apply(c, old[0]).json()
    wait_job(c, ident)
    c.post(f"{ROOT}/jobs/{ident}/pause")

    async def corrected(request):
        body = json.loads(request.content)
        data = request_data(body)
        tool = body["tools"][-1]["name"]
        return tool_response(
            body,
            tool,
            {"changes": {"title": "Corrigé " + data["task"]["key"], "summary": "Corrigé"}},
        )

    c.app.state.assistant.models = ModelFactory(httpx.MockTransport(corrected))
    response = c.post(
        f"{ROOT}/jobs/{ident}/input", json={"message": "Corrige les fiches restantes"}
    )
    assert response.status_code == 200
    ready = wait_job(c, ident)
    assert ready["status"] == "review", ready
    assert apply(c, old[0]).json() == receipt
    assert apply(c, old[-1]).status_code == 409
    pending = [proposal for proposal in batches(c, ident) if proposal["state"] == "pending"]
    assert sum(len(proposal["items"]) for proposal in pending) == 3
    assert all(
        item["title"].startswith("Corrigé") for proposal in pending for item in proposal["items"]
    )


def test_more_than_sixteen_sections_continue_and_private_fields_stay_excluded(admin_client):
    c = admin_client
    tasks = [
        {
            "key": f"project_{index}",
            "kind": "projects",
            "fields": [
                name for name in MODELS["projects"].model_fields if name not in PRIVATE_FIELDS
            ],
            "brief": "Créer le projet synthétique décrit.",
        }
        for index in range(4)
    ]
    provider = ScriptedProvider(
        {"message": "Quatre projets détaillés", "tasks": tasks},
        {task["key"]: {"title": "Projet " + task["key"]} for task in tasks},
    )
    configure(c, provider)
    response = c.post(f"{ROOT}/turn", json=request_payload())
    assert response.status_code == 200, response.text
    ident = response.json()["job"]["id"]
    ready = wait_job(c, ident)
    assert ready["status"] == "review", ready
    assert ready["prepared"] == 4 and ready["delegations"] > 16
    for body in provider.requests:
        data = request_data(body)
        assert "private_notes" not in data.get("allowed_fields", [])
        assert "consent_note" not in data.get("allowed_fields", [])
    assert c.get("/api/admin/content/projects").json()["total"] == 0


def test_total_tasks_inconsistent_with_has_more_escalates_instead_of_truncating(admin_client):
    c = admin_client
    base = BulkProvider(13)

    async def provider(request):
        result = await base(request)
        body = json.loads(result.content)
        call = body["output"][0]
        data = json.loads(call["arguments"])
        if "has_more" in data:
            data["has_more"] = False
            call["arguments"] = json.dumps(data)
        return httpx.Response(200, json=body)

    configure(c, provider)
    response = c.post(f"{ROOT}/turn", json=request_payload())
    assert response.status_code == 200, response.text
    job = response.json()["job"]
    assert job
    ready = wait_job(c, job["id"])
    assert ready["status"] == "review" and ready["prepared"] == 13


def test_concurrent_edit_conflicts_atomically_then_input_produces_new_review(admin_client):
    c = admin_client
    configure(c, BulkProvider(1))
    original = create(c, "skills", title="Titre initial", summary="Version initiale")
    plan = {
        "message": "Modifier le résumé",
        "tasks": [
            {
                "key": "edit",
                "kind": "skills",
                "entry_id": original["id"],
                "fields": ["summary"],
                "brief": "Nouveau résumé",
            }
        ],
    }
    c.app.state.assistant.models = ModelFactory(
        httpx.MockTransport(ScriptedProvider(plan, {"edit": {"summary": "Proposition"}}))
    )
    ident = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    assert wait_job(c, ident)["status"] == "review"
    old = batches(c, ident)[0]
    update(c, original, summary="Modification manuelle")
    assert apply(c, old).status_code == 409
    assert (
        c.get(f"/api/admin/content/skills/{original['id']}").json()["entry"]["summary"]
        == "Modification manuelle"
    )
    assert (
        c.post(
            f"{ROOT}/jobs/{ident}/input", json={"message": "Repropose sur la version actuelle."}
        ).status_code
        == 200
    )
    assert wait_job(c, ident)["status"] == "review"
    new = [proposal for proposal in batches(c, ident) if proposal["state"] == "pending"][0]
    change = new["items"][0]["changes"][0]
    assert change["before"] == "Modification manuelle" and change["after"] == "Proposition"
    assert apply(c, new).status_code == 200
