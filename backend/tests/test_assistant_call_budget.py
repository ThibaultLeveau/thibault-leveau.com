"""Direct turns reserve tool/repair calls before delegating or hand their plan to a job."""

import json

import pytest
from assistant_budget_fakes import EXPERIENCE, TECHNOLOGIES, ExperienceProvider
from assistant_fakes import tool_response
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_assistant import ROOT, apply
from test_assistant_jobs import BulkProvider, batches, configure, request_payload, wait_job


def test_experience_with_ten_technologies_hands_off_before_any_draft_and_keeps_links(admin_client):
    c = admin_client
    provider = ExperienceProvider()
    configure(c, provider)
    payload = request_payload(
        "Créer une expérience en équipe de 11 développeurs, "
        "de septembre 2016 à septembre 2019, et ses dix technologies."
    )
    response = c.post(f"{ROOT}/turn", json=payload)
    assert response.status_code == 200, response.text
    answer = response.json()
    assert answer["proposal"] is None
    assert answer["calls"] == 2
    assert answer["delegations"] == 0
    ident = answer["job"]["id"]
    ready = wait_job(c, ident)
    assert ready["status"] == "review", ready
    assert ready["planned"] == ready["prepared"] == 12
    assert ready["calls"] > 24
    assert provider.plans == 1
    assert len(provider.drafts) == len(set(provider.drafts)) == 12
    with c.app.state.admin_store.connect() as db:
        assert db.execute("SELECT count(*) FROM content_entries").fetchone()[0] == 0
    calls = provider.calls
    repeated = c.post(f"{ROOT}/turn", json=payload)
    assert repeated.json()["job"]["id"] == ident
    assert provider.calls == calls

    # Pending reference targets are applied first; a separate reviewed batch completes links.
    for _ in range(3):
        for proposal in batches(c, ident):
            if proposal["state"] == "pending":
                saved = apply(c, proposal)
                assert saved.status_code == 200, saved.text
        state = wait_job(c, ident)
        if state["status"] == "completed":
            break
    assert state["status"] == "completed", state
    experiences = c.get("/api/admin/content/experiences").json()
    assert experiences["total"] == 1
    record = c.get(f"/api/admin/content/experiences/{experiences['items'][0]['id']}").json()
    assert record["status"] == "draft"
    entry = record["entry"]
    for key in ("title", "summary", "body", "start_date", "end_date", "team"):
        assert entry[key] == EXPERIENCE[key]
    assert len(entry["technologies"]) == 10
    assert c.get("/api/admin/content/organizations").json()["total"] == 1
    technologies = c.get("/api/admin/content/technologies").json()
    assert technologies["total"] == 10
    assert {t["title"] for t in technologies["items"]} == set(TECHNOLOGIES)
    assert {t["id"] for t in entry["technologies"]} == {t["id"] for t in technologies["items"]}


@pytest.mark.parametrize("planning_calls,durable", [(4, False), (5, True)])
def test_reservation_accounts_for_calls_already_spent_by_planner(
    admin_client, planning_calls, durable
):
    c = admin_client
    base = BulkProvider(2)
    plan_calls = 0

    async def provider(request):
        nonlocal plan_calls
        body = json.loads(request.content)
        if body["tools"][-1]["name"] == "Plan":
            plan_calls += 1
            if plan_calls < planning_calls:
                return tool_response(body, "decrire_collection", {"kind": "skills"})
        return await base(request)

    configure(c, provider)
    response = c.post(f"{ROOT}/turn", json=request_payload())
    assert response.status_code == 200, response.text
    result = response.json()
    assert bool(result["job"]) is durable
    if durable:
        assert result["calls"] == planning_calls
        assert result["delegations"] == 0
        assert wait_job(c, result["job"]["id"])["prepared"] == 2
    else:
        assert result["delegations"] == 2
        assert len(result["proposal"]["items"]) == 2
    assert plan_calls == planning_calls
