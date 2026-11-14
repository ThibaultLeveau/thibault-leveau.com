import asyncio
import json
import sqlite3
import time
from uuid import uuid4

import httpx
import httpx2
import pytest
from assistant_fakes import ScriptedProvider, request_data, tool_response
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, ValidationError
from test_admin import API_KEY, save_provider, sign_in
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_content import create, update

from personal_site.admin.llm import ProviderError
from personal_site.admin.security import COOKIE_NAME, token_hash
from personal_site.assistant.contracts import Operation, Preferences
from personal_site.assistant.models import Budget, ModelFactory
from personal_site.assistant.proposals import prepare
from personal_site.assistant.registry import PRIVATE_FIELDS, output_model
from personal_site.assistant.tools import Context
from personal_site.content import backup
from personal_site.content.schemas import MODELS
from personal_site.content.validation import ContentError

ROOT = "/api/admin/assistant"


def owner(client):
    return token_hash(client.cookies.get(COOKIE_NAME))


def propose(client, operations, versions=None):
    assistant = client.app.state.assistant
    payload = prepare(assistant.store.content, operations, versions or {}, {})
    return assistant.store.create(owner(client), uuid4(), payload)


def apply(client, proposal):
    return client.post(
        f"{ROOT}/proposals/{proposal['id']}/apply", json={"revision": proposal["revision"]}
    )


def turn(client, message="Créer une fiche", messages=None, thread=None, **kwargs):
    return client.post(
        f"{ROOT}/turn",
        json={
            "messages": messages or [{"role": "user", "content": message}],
            "request_id": str(uuid4()),
            "thread_id": str(thread or uuid4()),
            **kwargs,
        },
    )


def configured(client, plan, drafts=None):
    sign_in(client)
    save_provider(client)
    provider = ScriptedProvider(plan, drafts)
    client.app.state.assistant.models = ModelFactory(httpx.MockTransport(provider))
    return provider


@pytest.mark.parametrize("kind", MODELS)
def test_every_collection_create_then_targeted_edit_is_atomic_and_idempotent(admin_client, kind):
    c = admin_client
    sign_in(c)
    data = {
        "title": f"Fiche {kind}",
        "body": "Texte conservé",
        "private_notes": "Confidentiel",
        "links": [{"label": "Source", "url": "https://example.test"}],
    }
    if kind == "media":
        data["external_url"] = "https://example.test/media"
    proposal = propose(c, [Operation(key="fiche", kind=kind, changes=data)])
    assert c.get(f"/api/admin/content/{kind}").json()["total"] == 0
    saved = apply(c, proposal)
    assert saved.status_code == 200, saved.text
    ident = saved.json()["result"][0]["id"]
    assert apply(c, proposal).json() == saved.json()
    record = c.get(f"/api/admin/content/{kind}/{ident}").json()
    change = propose(
        c,
        [
            Operation(
                key="fiche",
                kind=kind,
                entry_id=ident,
                version=record["version"],
                changes={"summary": "Nouveau résumé"},
            )
        ],
    )
    assert apply(c, change).status_code == 200
    result = c.get(f"/api/admin/content/{kind}/{ident}").json()["entry"]
    assert result["summary"] == "Nouveau résumé"
    for name in ("body", "private_notes", "links"):
        assert result[name] == record["entry"][name]


def test_catalog_contract_covers_all_fields_and_nested_references():
    for kind, model in MODELS.items():
        schema = output_model(kind, list(model.model_fields), True)
        patch = schema.model_fields["changes"].annotation
        assert set(patch.model_fields) == set(model.model_fields)
        for name in model.model_fields:
            assert name in patch.model_json_schema()["properties"]
        assert schema.model_validate({"changes": {"title": "A"}}).changes.model_dump(
            exclude_unset=True
        ) == {"title": "A"}
        with pytest.raises(ValidationError):
            schema.model_validate({"changes": {"invented": "no"}})
    schema = output_model("projects", ["skills", "technologies", "organization_id"], False)
    result = schema.model_validate(
        {
            "changes": {
                "skills": [{"id": "@skill", "context": "API"}],
                "technologies": [{"id": 8, "release": "2"}],
                "organization_id": None,
            }
        }
    )
    assert result.changes.skills[0].id == "@skill"
    with pytest.raises(ContentError):
        output_model("profiles", ["private_notes"], False)


def test_batch_creates_references_cycles_and_preserves_inverse_updates(admin_client):
    c = admin_client
    sign_in(c)
    service = create(c, "services", title="Offre existante")
    ops = [
        Operation(key="skill", kind="skills", changes={"title": "Concevoir une API"}),
        Operation(
            key="project",
            kind="projects",
            changes={
                "title": "Projet lié",
                "skills": [{"id": "@skill"}],
                "services": [{"id": service["id"], "context": "Preuve"}],
                "testimonials": [{"id": "@quote"}],
            },
        ),
        Operation(
            key="service",
            kind="services",
            entry_id=service["id"],
            version=service["version"],
            changes={"summary": "Résumé amélioré"},
        ),
        Operation(
            key="quote",
            kind="testimonials",
            changes={
                "title": "Avis fourni",
                "quote": "Texte exact",
                "projects": [{"id": "@project"}],
            },
        ),
    ]
    proposal = propose(c, ops)
    result = apply(c, proposal)
    assert result.status_code == 200, result.text
    ids = {r["kind"]: r["id"] for r in result.json()["result"]}
    project = c.get(f"/api/admin/content/projects/{ids['projects']}").json()["entry"]
    saved_service = c.get(f"/api/admin/content/services/{service['id']}").json()["entry"]
    assert project["skills"][0]["id"] == ids["skills"]
    assert saved_service["projects"] == [{"id": ids["projects"], "context": "Preuve"}]


def test_conflicts_rollback_whole_batch_including_new_reference(admin_client):
    c = admin_client
    sign_in(c)
    record = create(c, "projects", title="Source")
    proposal = propose(
        c,
        [
            Operation(key="skill", kind="skills", changes={"title": "Nouvelle compétence"}),
            Operation(
                key="project",
                kind="projects",
                entry_id=record["id"],
                version=record["version"],
                changes={"skills": [{"id": "@skill"}]},
            ),
        ],
    )
    assert update(c, record, summary="Autre onglet").status_code == 200
    assert apply(c, proposal).status_code == 409
    assert c.get("/api/admin/content/skills").json()["total"] == 0
    assert (
        c.get(f"/api/admin/content/projects/{record['id']}").json()["entry"]["summary"]
        == "Autre onglet"
    )


def test_invalid_batch_rolls_back_dry_run_and_references(admin_client):
    c = admin_client
    sign_in(c)
    with pytest.raises(ContentError):
        propose(
            c,
            [
                Operation(key="org", kind="organizations", changes={"title": "Société"}),
                Operation(
                    key="project",
                    kind="projects",
                    changes={"title": "Projet", "skills": [{"id": "@org"}]},
                ),
            ],
        )
    assert c.get("/api/admin/content/organizations").json()["total"] == 0
    with pytest.raises(ContentError):
        propose(
            c,
            [
                Operation(
                    key="a", kind="projects", changes={"title": "A", "services": [{"id": "@b"}]}
                ),
                Operation(key="b", kind="services", changes={"title": "B", "projects": []}),
            ],
        )
    assert c.get("/api/admin/content/projects").json()["total"] == 0


def test_preferences_security_persistence_versions_and_session_revocation(
    admin_client, admin_settings
):
    c = admin_client
    assert c.get(f"{ROOT}/preferences").status_code == 401
    sign_in(c)
    default = c.get(f"{ROOT}/preferences").json()
    changed = {
        **default,
        "overrides": {"profile": {**default["defaults"], "tone": "warm", "technicality": "expert"}},
    }
    assert (
        c.put(f"{ROOT}/preferences", json=changed, headers={"X-CSRF-Token": "bad"}).status_code
        == 403
    )
    saved = c.put(f"{ROOT}/preferences", json=changed)
    assert saved.status_code == 200
    assert c.put(f"{ROOT}/preferences", json=changed).status_code == 409
    assert Preferences.model_validate(saved.json()).for_family("profile").tone == "warm"
    assert Preferences.model_validate(saved.json()).for_family("career").tone == "neutral"
    from personal_site.main import create_app

    assert (
        create_app(admin_settings).state.assistant.store.preferences().model_dump() == saved.json()
    )
    proposal = propose(c, [Operation(key="a", kind="skills", changes={"title": "A"})])
    c.post("/api/admin/logout")
    sign_in(c)
    assert apply(c, proposal).status_code == 404


def test_expiration_cancellation_and_client_cannot_supply_arbitrary_changes(admin_client):
    c = admin_client
    sign_in(c)
    p = propose(c, [Operation(key="a", kind="skills", changes={"title": "A"})])
    assert (
        c.post(
            f"{ROOT}/proposals/{p['id']}/apply", json={"revision": 1, "changes": {"title": "hack"}}
        ).status_code
        == 422
    )
    assert c.post(f"{ROOT}/proposals/{p['id']}/cancel", json={"revision": 1}).status_code == 200
    assert apply(c, p).status_code == 409
    with c.app.state.admin_store.connect() as db:
        db.execute("UPDATE assistant_proposals SET expires=?", (time.time() - 1,))
    assert apply(c, p).status_code == 410


def test_real_langchain_graph_clarifies_then_delegates_profile_and_applies(admin_client):
    c = admin_client
    fields = [
        "title",
        "profession",
        "summary",
        "tagline",
        "body",
        "public_location",
        "availability",
        "languages",
        "interests",
        "seo_title",
        "links",
    ]
    values = {
        "title": "Alex",
        "profession": "Ingénieur",
        "summary": "Je conçois des API.",
        "tagline": "Des API fiables",
        "body": "Je travaille sur des API Python.",
        "public_location": "Paris",
        "availability": "À préciser",
        "languages": [{"name": "Français", "level": "Courant"}],
        "interests": [{"text": "Photographie"}],
        "seo_title": "Alex — API",
        "links": [],
    }

    def plan(data):
        if len(data["messages"]) == 1:
            return {
                "message": "Je peux préparer votre profil.",
                "questions": [{"question": "Quel est votre métier ?", "fields": ["profession"]}],
            }
        return {
            "message": "Voici le profil proposé.",
            "tasks": [
                {
                    "key": "profil",
                    "kind": "profiles",
                    "fields": fields,
                    "brief": "Créer le profil fourni",
                }
            ],
        }

    provider = configured(c, plan, {"profil": values})
    thread = uuid4()
    response = turn(c, "Compléter mon profil", thread=thread)
    assert response.status_code == 200, response.text
    assert response.json()["questions"][0]["question"] == "Quel est votre métier ?"
    history = [
        {"role": "user", "content": "Compléter mon profil"},
        {"role": "assistant", "content": "Quel est votre métier ?"},
        {"role": "user", "content": json.dumps(values)},
    ]
    response = turn(c, messages=history, thread=thread)
    assert response.status_code == 200, response.text
    assert response.json()["delegations"] >= 3
    assert c.get("/api/admin/content/profiles").json()["total"] == 0
    result = apply(c, response.json()["proposal"])
    assert result.status_code == 200, result.text
    assert len(provider.requests) >= 5
    assert API_KEY not in response.text


def test_graph_styles_partial_lists_and_private_context(admin_client):
    c = admin_client
    plan = {"message": "Modification ciblée", "tasks": []}
    provider = configured(c, plan)
    record = create(
        c,
        "projects",
        title="Cible",
        private_notes="NE PAS TRANSMETTRE",
        responsibilities=[{"text": "Conserver"}],
    )
    plan["tasks"] = [
        {
            "key": "projet",
            "kind": "projects",
            "entry_id": record["id"],
            "fields": ["responsibilities", "summary"],
            "brief": "Ajouter une responsabilité",
        }
    ]
    provider.drafts["projet"] = {
        "responsibilities": [{"text": "Conserver"}, {"text": "Ajouter"}],
        "summary": "Résumé",
    }
    pref = c.get(f"{ROOT}/preferences").json()
    pref["overrides"]["expertise"] = {
        **pref["defaults"],
        "technicality": "expert",
        "tone": "direct",
    }
    c.put(f"{ROOT}/preferences", json=pref)
    response = turn(c, "Ajoute Ajouter à mes responsabilités et un résumé")
    assert response.status_code == 200, response.text
    assert "NE PAS TRANSMETTRE" not in json.dumps(provider.requests)
    worker = request_data(provider.requests[-1])
    assert worker["preferences"]["technicality"] == "expert"
    assert apply(c, response.json()["proposal"]).status_code == 200
    assert (
        c.get(f"/api/admin/content/projects/{record['id']}").json()["entry"]["private_notes"]
        == "NE PAS TRANSMETTRE"
    )


def test_backup_restores_preferences_but_revokes_proposals(admin_client, admin_settings, tmp_path):
    c = admin_client
    sign_in(c)
    preferences = c.get(f"{ROOT}/preferences").json()
    preferences["defaults"]["tone"] = "warm"
    c.put(f"{ROOT}/preferences", json=preferences)
    propose(c, [Operation(key="a", kind="skills", changes={"title": "À relire"})])
    backup.export(admin_settings.admin_db_path, tmp_path / "backup", "abcdef123456")
    backup.restore(tmp_path / "backup", tmp_path / "restored")
    with sqlite3.connect(tmp_path / "restored/admin.sqlite3") as db:
        assert db.execute("SELECT count(*) FROM assistant_proposals").fetchone()[0] == 0
        assert (
            json.loads(db.execute("SELECT payload FROM assistant_preferences").fetchone()[0])[
                "defaults"
            ]["tone"]
            == "warm"
        )


class NativeOutput(BaseModel):
    message: str


@pytest.mark.parametrize("provider", ["openai", "anthropic", "mistral"])
def test_each_provider_runs_the_actual_graph_and_structured_proposal(admin_client, provider):
    c = admin_client
    sign_in(c)
    save_provider(c, name=provider)
    fake = ScriptedProvider(
        {
            "message": "Proposition",
            "tasks": [
                {
                    "key": "s",
                    "kind": "skills",
                    "fields": ["title", "body"],
                    "brief": "Créer la fiche",
                }
            ],
        },
        {"s": {"title": "Conception API", "body": "Je conçois des API."}},
    )
    c.app.state.assistant.models = ModelFactory(
        httpx.MockTransport(fake), httpx2.MockTransport(fake)
    )
    response = turn(c, "Crée Conception API, description : Je conçois des API.")
    assert response.status_code == 200, response.text
    assert response.json()["provider"] == provider
    assert c.get("/api/admin/content/skills").json()["total"] == 0
    assert apply(c, response.json()["proposal"]).status_code == 200


@pytest.mark.parametrize("provider", ["openai", "anthropic", "mistral"])
def test_native_model_adapters_fixed_destination_and_structured_tools(provider):
    requests = []

    def handle(request):
        requests.append(request)
        if provider == "openai":
            return tool_response(json.loads(request.content), "NativeOutput", {"message": "ok"})
        if provider == "anthropic":
            return httpx2.Response(
                200,
                json={
                    "id": "msg_test",
                    "type": "message",
                    "role": "assistant",
                    "model": "test",
                    "stop_reason": "tool_use",
                    "usage": {"input_tokens": 1, "output_tokens": 1},
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "test",
                            "name": "NativeOutput",
                            "input": {"message": "ok"},
                        }
                    ],
                },
            )
        return httpx.Response(
            200,
            json={
                "id": "test",
                "object": "chat.completion",
                "created": 0,
                "model": "test",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "tool_calls",
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "abc123456",
                                    "type": "function",
                                    "function": {
                                        "name": "NativeOutput",
                                        "arguments": '{"message":"ok"}',
                                    },
                                }
                            ],
                        },
                    }
                ],
            },
        )

    async def call():
        factory = ModelFactory(httpx.MockTransport(handle), httpx2.MockTransport(handle))
        budget = Budget()
        async with factory.open(
            {"provider": provider, "model": "test-model", "api_key": API_KEY}, budget
        ) as model:
            result = await model.bind_tools([NativeOutput]).ainvoke([HumanMessage("Test")])
            assert result.tool_calls[0]["args"] == {"message": "ok"}
        assert budget.calls == 1

    asyncio.run(call())
    assert len(requests) == 1
    payload = json.loads(requests[0].content)
    assert payload["tools"]
    if provider == "openai":
        assert payload["store"] is False
        assert requests[0].url.path == "/v1/responses"
        assert payload["include"] == ["reasoning.encrypted_content"]
        assert "previous_response_id" not in payload


def test_budgets_and_context_redaction(admin_client):
    c = admin_client
    sign_in(c)
    record = create(c, "testimonials", title="Avis", private_notes="Secret", consent_note="Privé")
    context = Context(c.app.state.content_store, Budget(), False)
    result = context.read("testimonials", record["id"])
    assert not PRIVATE_FIELDS.intersection(result["entry"])
    budget = Budget(calls=24)
    with pytest.raises(ProviderError):
        budget.use_model()
    with pytest.raises(ProviderError):
        Budget().use_tool(250001)
