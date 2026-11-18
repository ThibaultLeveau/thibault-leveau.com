"""References across pages, large cycles and conflict correction are never silently omitted."""

import json

import httpx
from assistant_fakes import ScriptedProvider
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_assistant import ROOT, apply
from test_assistant_jobs import batches, configure, request_payload, wait_job
from test_content import update

from personal_site.assistant.models import ModelFactory


def finish_reviews(client, ident):
    for _ in range(20):
        job = wait_job(client, ident)
        if job["status"] == "completed":
            return job
        assert job["status"] == "review", job
        pending = [
            proposal for proposal in batches(client, ident) if proposal["state"] == "pending"
        ]
        assert pending
        for proposal in pending:
            result = apply(client, proposal)
            assert result.status_code == 200, result.text
    raise AssertionError("Expected bounded fixture to finish its reviews")


def test_fourteen_entry_cycle_across_pages_is_drafts_then_reviewed_relationships(admin_client):
    c = admin_client
    tasks, drafts = [], {}
    for i in range(7):
        for kind, key, field, refs in [
            ("projects", f"project_{i}", "services", [f"service_{i}", f"service_{(i - 1) % 7}"]),
            ("services", f"service_{i}", "projects", [f"project_{i}", f"project_{(i + 1) % 7}"]),
        ]:
            tasks.append(
                {"key": key, "kind": kind, "fields": ["title", field], "brief": "Cycle demandé"}
            )
            drafts[key] = {"title": "Cycle " + key, field: [{"id": "@" + ref} for ref in refs]}

    def plan(data):
        start = data["job"]["planned"]
        end = min(start + 12, 14)
        return {
            "message": "Cycle complet",
            "tasks": tasks[start:end],
            "has_more": end < 14,
            "continuation": str(end),
            "total_tasks": 14,
        }

    provider = ScriptedProvider(plan, drafts)
    configure(c, provider)
    ident = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    ready = wait_job(c, ident)
    assert ready["status"] == "review", ready
    first = batches(c, ident)
    assert any(item["missing"] for proposal in first for item in proposal["items"])
    assert c.get("/api/admin/content/projects").json()["total"] == 0
    assert c.get("/api/admin/content/services").json()["total"] == 0
    calls = len(provider.requests)
    complete = finish_reviews(c, ident)
    assert complete["planned"] == complete["applied"] == 14
    assert len(provider.requests) == calls
    all_batches = batches(c, ident)
    assert len(all_batches) > len(first)
    mapping = {
        item["title"].removeprefix("Cycle "): item["id"]
        for proposal in all_batches
        for item in proposal["result"]
    }
    for task in tasks:
        record = c.get(f"/api/admin/content/{task['kind']}/{mapping[task['key']]}").json()
        field = task["fields"][1]
        expected = {mapping[row["id"][1:]] for row in drafts[task["key"]][field]}
        assert {row["id"] for row in record["entry"][field]} == expected
        assert record["status"] == "draft"
    assert all(proposal["state"] == "applied" for proposal in all_batches)
    assert apply(c, first[0]).status_code == 200
    assert c.get("/api/admin/content/projects").json()["total"] == 7


def test_missing_future_target_is_visible_and_input_can_complete_its_plan(admin_client):
    c = admin_client

    def plan(data):
        if data["job"]["planned"] == 0:
            return {
                "message": "Projet et compétence liée",
                "tasks": [
                    {
                        "key": "project",
                        "kind": "projects",
                        "fields": ["title", "skills"],
                        "brief": "Projet avec la compétence future",
                    }
                ],
                "total_tasks": 1,
            }
        return {
            "message": "Référence précisée",
            "tasks": [
                {
                    "key": "future",
                    "kind": "skills",
                    "fields": ["title"],
                    "brief": "Compétence nommée par la précision",
                }
            ],
            "total_tasks": 2,
        }

    provider = ScriptedProvider(
        plan,
        {
            "project": {"title": "Projet futur", "skills": [{"id": "@future"}]},
            "future": {"title": "Compétence future"},
        },
    )
    configure(c, provider)
    ident = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    blocked = wait_job(c, ident)
    assert blocked["status"] == "needs_input" and blocked["error"]
    assert blocked["applied"] == 0
    assert (
        c.post(
            f"{ROOT}/jobs/{ident}/input",
            json={"message": "La compétence future se nomme Compétence future."},
        ).status_code
        == 200
    )
    assert finish_reviews(c, ident)["applied"] == 2
    project = c.get("/api/admin/content/projects").json()["items"][0]
    assert len(c.get(f"/api/admin/content/projects/{project['id']}").json()["entry"]["skills"]) == 1


def test_relationship_conflict_after_saved_drafts_reconciles_with_new_input(admin_client):
    c = admin_client
    tasks = [
        {
            "key": "project",
            "kind": "projects",
            "fields": ["title", "skills"],
            "brief": "Projet lié",
        },
        {"key": "skill", "kind": "skills", "fields": ["title"], "brief": "Compétence"},
    ]

    def plan(data):
        start = data["job"]["planned"]
        return {
            "message": "Deux fiches",
            "tasks": tasks[start : start + 1],
            "has_more": start == 0,
            "continuation": str(start + 1),
            "total_tasks": 2,
        }

    provider = ScriptedProvider(
        plan,
        {
            "project": {"title": "Projet corrigé", "skills": [{"id": "@skill"}]},
            "skill": {"title": "Compétence conservée"},
        },
    )
    configure(c, provider)
    ident = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    assert wait_job(c, ident)["status"] == "review"
    initial = batches(c, ident)
    first = apply(c, initial[0]).json()
    project_id = first["result"][0]["id"]
    current = c.get(f"/api/admin/content/projects/{project_id}").json()
    update(c, current, summary="Modification manuelle à conserver")
    assert apply(c, initial[1]).status_code == 200
    conflict = wait_job(c, ident)
    assert conflict["status"] == "needs_input", conflict
    assert conflict["applied"] == 2

    def corrected(data):
        assert data["task"]["entry_id"] == project_id
        assert data["deferred_changes"] == {"skills": [{"id": "@skill"}]}
        assert "Retire" in data["latest_input"]["message"]
        return {"changes": {"skills": []}}

    replacement = ScriptedProvider(plan, {"project": corrected})
    c.app.state.assistant.models = ModelFactory(httpx.MockTransport(replacement))
    response = c.post(
        f"{ROOT}/jobs/{ident}/input",
        json={"message": "Retire ce lien de compétence et conserve mes autres modifications."},
    )
    assert response.status_code == 200, response.text
    ready = wait_job(c, ident)
    assert ready["status"] == "review", ready
    pending = [proposal for proposal in batches(c, ident) if proposal["state"] == "pending"]
    assert len(pending) == 1
    assert apply(c, pending[0]).status_code == 200
    assert wait_job(c, ident)["status"] == "completed"
    record = c.get(f"/api/admin/content/projects/{project_id}").json()
    assert record["entry"]["skills"] == []
    assert record["entry"]["summary"] == "Modification manuelle à conserver"
    assert apply(c, initial[0]).json() == first
    assert c.get("/api/admin/content/projects").json()["total"] == 1
    assert len(replacement.requests) == 1


def test_wrong_kind_and_duplicate_tasks_never_write_business_data(admin_client):
    c = admin_client
    tasks = [
        {"key": "project", "kind": "projects", "fields": ["title", "skills"], "brief": "Projet"},
        {"key": "wrong", "kind": "services", "fields": ["title"], "brief": "Autre collection"},
    ]
    provider = ScriptedProvider(
        {"message": "Lien invalide", "tasks": tasks},
        {
            "project": {"title": "Projet", "skills": [{"id": "@wrong"}]},
            "wrong": {"title": "Service"},
        },
    )
    configure(c, provider)
    ident = c.post(f"{ROOT}/jobs", json=request_payload()).json()["id"]
    assert wait_job(c, ident)["status"] == "needs_input"
    assert c.get("/api/admin/content/projects").json()["total"] == 0
    assert c.get("/api/admin/content/services").json()["total"] == 0
    assert batches(c, ident) == []
    with c.app.state.admin_store.connect() as db:
        payloads = [
            row[0]
            for row in db.execute(
                "SELECT result FROM assistant_job_sections WHERE result IS NOT NULL"
            )
        ]
        assert all(isinstance(json.loads(payload), dict) for payload in payloads)
