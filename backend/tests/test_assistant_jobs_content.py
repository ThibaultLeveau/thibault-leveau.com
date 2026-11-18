"""Durable specialists obey the same language and private-context boundaries as direct turns."""

import json

import pytest
from assistant_fakes import ScriptedProvider, request_data, tool_response
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_assistant import ROOT, apply
from test_assistant_jobs import batches, configure, request_payload, wait_job
from test_content import create
from test_localizations import variant


@pytest.mark.parametrize("include_private", [False, True])
def test_job_tools_and_attached_media_respect_explicit_private_consent(
    admin_client, include_private
):
    c = admin_client
    requests = []
    record = media = None

    def provider(request):
        body = json.loads(request.content)
        requests.append(body)
        tool = body["tools"][-1]["name"]
        if tool == "Plan":
            if not any(item.get("type") == "function_call_output" for item in body["input"]):
                return tool_response(
                    body, "lire_fiche", {"kind": "skills", "entry_id": record["id"]}
                )
            return tool_response(
                body,
                tool,
                {
                    "message": "Modifier uniquement le résumé demandé.",
                    "tasks": [
                        {
                            "key": "skill",
                            "kind": "skills",
                            "entry_id": record["id"],
                            "fields": ["summary"],
                            "brief": "Résumé fourni explicitement par l’utilisateur.",
                        }
                    ],
                },
            )
        return tool_response(body, tool, {"changes": {"summary": "Résumé demandé"}})

    configure(c, provider)
    record = create(c, "skills", title="Compétence", private_notes="TARGET_PRIVATE_MARKER")
    media = create(
        c,
        "media",
        external_url="https://example.test/reference",
        private_notes="MEDIA_PRIVATE_MARKER",
    )
    payload = {
        **request_payload("Remplacer le résumé par Résumé demandé."),
        "include_private_notes": include_private,
        "media_ids": [media["id"]],
    }
    response = c.post(f"{ROOT}/jobs", json=payload)
    assert response.status_code == 200, response.text
    ident = response.json()["id"]
    job = wait_job(c, ident)
    assert job["status"] == "review", job
    assert job["include_private_notes"] is include_private
    transmitted = json.dumps(requests)
    for marker in ("TARGET_PRIVATE_MARKER", "MEDIA_PRIVATE_MARKER"):
        assert (marker in transmitted) is include_private
    tool_results = [
        item["output"]
        for body in requests
        for item in body["input"]
        if item.get("type") == "function_call_output"
    ]
    assert tool_results
    assert ("TARGET_PRIVATE_MARKER" in json.dumps(tool_results)) is include_private
    assert {tool["name"] for tool in requests[0]["tools"]} == {
        "rechercher_fiches",
        "lire_fiche",
        "decrire_collection",
        "lire_precisions",
        "rechercher_taches",
        "Plan",
    }
    proposal = batches(c, ident)[0]
    assert apply(c, proposal).status_code == 200
    saved = c.get(f"/api/admin/content/skills/{record['id']}").json()
    assert saved["entry"]["summary"] == "Résumé demandé"
    assert saved["entry"]["private_notes"] == "TARGET_PRIVATE_MARKER"


def test_durable_english_edit_preserves_french_source_and_shared_facts(admin_client):
    c = admin_client
    plan = {"message": "Prepare the English version.", "tasks": []}
    provider = ScriptedProvider(
        plan, {"english_skill": {"title": "API design", "summary": "Supplied English summary"}}
    )
    configure(c, provider)
    record = create(
        c,
        "skills",
        title="Conception API",
        summary="Résumé français à conserver",
        private_notes="PRIVATE_SOURCE_MARKER",
    )
    plan["tasks"] = [
        {
            "key": "english_skill",
            "kind": "skills",
            "entry_id": record["id"],
            "fields": ["title", "summary"],
            "brief": "Use the explicitly supplied English title and summary.",
        }
    ]
    payload = {
        **request_payload("Prepare this skill in English from the supplied facts."),
        "language": "en",
    }
    response = c.post(f"{ROOT}/jobs", json=payload)
    assert response.status_code == 200, response.text
    ident = response.json()["id"]
    job = wait_job(c, ident)
    assert job["status"] == "review", job
    assert job["language"] == "en"
    assert all(request_data(body)["content_language"] == "en" for body in provider.requests)
    assert all(request_data(body)["preferences"]["language"] == "en" for body in provider.requests)
    assert "PRIVATE_SOURCE_MARKER" not in json.dumps(provider.requests)
    proposal = batches(c, ident)[0]
    assert all(item["language"] == "en" for item in proposal["items"])
    assert apply(c, proposal).status_code == 200
    french = c.get(f"/api/admin/content/skills/{record['id']}").json()
    english = variant(c, record)
    assert french["entry"] == record["entry"]
    assert english["entry"]["title"] == "API design"
    assert english["entry"]["summary"] == "Supplied English summary"
    for name in ("slug", "visibility", "locations", "links"):
        assert english["entry"][name] == french["entry"][name]
    assert c.get("/api/admin/content/skills").json()["total"] == 1
