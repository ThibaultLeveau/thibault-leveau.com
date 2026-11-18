"""Versions bilingues : migration, isolation, concurrence, publication et propositions."""

from copy import deepcopy

import httpx
import pytest
from assistant_fakes import request_data, tool_response
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_admin import save_provider, sign_in
from test_assistant import apply, turn
from test_content import ROOT, create, update

from personal_site.assistant.models import ModelFactory
from personal_site.content.localization import assign, fields, shared
from personal_site.content.schemas import MODELS


def variant(client, record, language="en"):
    response = client.get(f"{ROOT}/{record['kind']}/{record['id']}?language={language}")
    assert response.status_code == 200, response.text
    return response.json()


def save_variant(client, record, **overrides):
    return client.put(
        f"{ROOT}/{record['kind']}/{record['id']}",
        json={
            "entry": {**record["entry"], **overrides},
            "version": record["version"],
            "language": record["entry"]["language"],
        },
    )


@pytest.mark.parametrize("kind", MODELS)
def test_variants_share_identity_and_facts_without_overwriting_source(admin_client, kind):
    client = admin_client
    sign_in(client)
    original = create(
        client,
        kind,
        title="Texte d’origine",
        summary="Résumé français",
        links=[{"label": "Documentation", "url": "https://example.test"}],
        locations=[{"city": "Toulouse", "country": "France"}],
        **({"external_url": "https://example.test/image"} if kind == "media" else {}),
    )
    target = variant(client, original)
    assert target["localization"]["states"]["en"] == "missing"
    payload = deepcopy(target["entry"])
    for path, value, _, _ in fields(kind, payload):
        if value:
            assign(payload, path, "English: " + value)
    result = save_variant(client, target, **payload)
    assert result.status_code == 200, result.text
    saved = result.json()
    assert saved["id"] == original["id"]
    assert saved["localization"]["states"]["en"] == "ready"
    assert shared(kind, saved["entry"]) == shared(kind, original["entry"])
    assert client.get(f"{ROOT}/{kind}/{original['id']}").json()["entry"] == original["entry"]
    assert save_variant(client, target, **payload).status_code == 409
    assert update(client, original, title="Écrasement périmé").status_code == 409
    if kind not in {"profiles", "media"}:
        copy = client.post(
            f"{ROOT}/{kind}/{saved['id']}/duplicate", json={"version": saved["version"]}
        ).json()
        assert variant(client, copy)["entry"]["title"] == saved["entry"]["title"]
        assert variant(client, copy)["localization"]["states"]["en"] == "stale"


def test_shared_amounts_relations_and_row_changes_are_protected(admin_client):
    c = admin_client
    sign_in(c)
    record = create(
        c,
        "services",
        title="Offre",
        packages=[{"name": "Audit", "amount": "0.00", "pricing": "fixed"}],
        benefits=[{"text": "Conseil"}, {"text": "Livraison"}],
    )
    target = variant(c, record)
    wrong = deepcopy(target["entry"])
    wrong["packages"][0]["amount"] = "123.00"
    assert save_variant(c, target, **wrong).status_code == 409
    target["entry"]["benefits"] = [{"text": "Advice"}, {"text": "Delivery"}]
    saved = save_variant(c, target, title="Service").json()
    original = variant(c, saved, "fr")
    changed = update(c, original, benefits=[{"text": "Livraison"}, {"text": "Conseil"}]).json()
    stale = variant(c, changed)
    assert stale["localization"]["states"]["en"] == "stale"
    assert stale["entry"]["title"] == "Service"
    assert {v["value"] for v in stale["localization"]["unmatched_texts"]} == {"Advice", "Delivery"}
    assert stale["entry"]["benefits"][0]["text"] != "Advice"
    assert not next(f for f in stale["localization"]["fields"] if f["path"] == "benefits.0.text")[
        "translated"
    ]
    assert stale["entry"]["packages"][0]["amount"] == "0.00"


def test_public_language_routes_search_privacy_and_stale_fallback(admin_client):
    c = admin_client
    sign_in(c)
    original = create(
        c,
        "profiles",
        title="Thibault",
        summary="Ingénieur logiciel",
        profession="Ingénieur",
        body="Présentation",
        visibility="public",
        private_notes="NEVER EXPOSE",
    )
    ready = c.post(
        f"{ROOT}/profiles/{original['id']}/transition",
        json={"version": original["version"], "status": "ready"},
    )
    assert ready.status_code == 200, ready.text
    target = variant(c, ready.json())
    assert save_variant(c, target, profession="").status_code == 422
    saved = save_variant(
        c, target, summary="Software engineer", profession="Engineer", body="Presentation"
    ).json()
    en = c.get(f"/api/public/entries/profiles/{saved['id']}?language=en")
    assert en.status_code == 200, en.text
    assert en.headers["content-language"] == "en"
    item = en.json()
    assert item["language"] == "en" and item["entry"]["profession"] == "Engineer"
    assert item["translation_available"] and item["url"].startswith("/en/")
    assert "NEVER EXPOSE" not in en.text and "localization" not in en.text
    assert c.get("/api/public/entries?q=software&language=en").json()["total"] == 1
    assert c.get("/api/public/entries?q=software&language=fr").json()["total"] == 0
    html = c.get(item["url"])
    assert '<html lang="en"' in html.text
    assert 'hreflang="fr"' in html.text and 'hreflang="en"' in html.text
    assert 'rel="canonical"' in html.text
    assert c.get("/en/explorer?q=software").status_code == 200
    c.cookies.set("site_language", "en")
    assert c.get("/fr").headers["content-language"] == "fr"
    original = variant(c, saved, "fr")
    update(c, original, summary="Nouvelle présentation")
    fallback = c.get(f"/api/public/entries/profiles/{saved['id']}?language=en").json()
    assert not fallback["translation_available"]
    assert fallback["language"] == "fr"
    assert fallback["entry"]["summary"] == "Nouvelle présentation"
    assert 'hreflang="en"' not in c.get(item["url"]).text


def test_translation_is_reviewable_bounded_and_conflict_checked(admin_client):
    c = admin_client
    sign_in(c)
    save_provider(c)
    original = create(
        c,
        "services",
        title="Conseil",
        body="Description",
        private_notes="SECRET",
        packages=[{"name": "Conseil", "pricing": "fixed", "amount": "12.50"}],
    )
    requests = []

    def provider(request):
        import json

        body = json.loads(request.content)
        data = request_data(body)
        requests.append(data)
        assert data["existing_target"] == {}  # A missing version is not French target context.
        assert "SECRET" not in request.content.decode()
        assert "12.50" not in request.content.decode()
        assert len(body["tools"]) == 1  # Only the structured output; no context tools.
        return tool_response(
            body,
            "Translation",
            {"texts": {k: "English " + v if v else "" for k, v in data["texts"].items()}},
        )

    c.app.state.assistant.models = ModelFactory(httpx.MockTransport(provider))
    response = turn(
        c,
        language="en",
        translation={
            "kind": "services",
            "entry_id": original["id"],
            "version": original["version"],
            "source_language": "fr",
        },
    )
    assert response.status_code == 200, response.text
    proposal = response.json()["proposal"]
    assert proposal["translation"]
    assert variant(c, original)["localization"]["states"]["en"] == "missing"
    saved = apply(c, proposal)
    assert saved.status_code == 200, saved.text
    assert apply(c, proposal).json() == saved.json()
    target = variant(c, original)
    assert target["entry"]["title"] == "English Conseil"
    assert target["entry"]["packages"][0]["amount"] == "12.50"
    assert len(requests) == 1
    conflict = turn(
        c,
        language="en",
        translation={
            "kind": "services",
            "entry_id": original["id"],
            "version": original["version"],
            "source_language": "fr",
        },
    )
    assert conflict.status_code == 409
    assert len(requests) == 1


def test_assistant_search_finds_english_titles_without_losing_original(admin_client):
    c = admin_client
    sign_in(c)
    original = create(c, "skills", title="Conception de logiciels")
    saved = save_variant(c, variant(c, original), title="Software engineering").json()
    store = c.app.state.content_store
    assert store.listing("skills", query="software", language="en")["items"][0]["id"] == saved["id"]
    assert store.listing("skills", query="conception", language="en")["total"] == 1
    assert store.listing("skills", query="software", language="fr")["total"] == 0


def test_schema_three_upgrade_and_backup_preserve_variants(admin_client, admin_settings, tmp_path):
    from personal_site.content.backup import export, restore, verify
    from personal_site.main import create_app

    c = admin_client
    sign_in(c)
    save_provider(c)
    original = create(c, "skills", title="Avant migration", private_notes="Conservé")
    account = c.app.state.admin_store.account()
    with c.app.state.admin_store.connect() as db:
        from assistant_fakes import drop_job_schema

        drop_job_schema(db)
        db.execute("DROP TABLE content_localized_values")
        db.execute("DROP TABLE content_localizations")
        db.execute("DELETE FROM content_migrations WHERE version=4")
    migrated = create_app(admin_settings)
    assert migrated.state.content_store.get("skills", original["id"])["entry"] == original["entry"]
    assert migrated.state.admin_store.account() == account
    assert c.get("/api/admin/session").status_code == 200
    saved = save_variant(c, variant(c, original), title="Before migration").json()
    archive = tmp_path / "archive"
    export(admin_settings.admin_db_path, archive, "abc1234")
    from personal_site.content.migrate import SCHEMA_VERSION

    assert verify(archive)["schema_version"] == SCHEMA_VERSION
    destination = tmp_path / "restored"
    restore(archive, destination)
    restored = create_app(
        admin_settings.model_copy(update={"admin_db_path": destination / "admin.sqlite3"})
    )
    entry = restored.state.content_store.get("skills", original["id"], "en")
    assert entry["entry"] == saved["entry"]
    with restored.state.admin_store.connect() as db:
        assert db.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []


@pytest.mark.parametrize("existing_translation", [False, True])
def test_chat_edits_selected_language_and_leaves_partial_variants_draft(
    admin_client, existing_translation
):
    from test_assistant import configured

    c = admin_client
    sign_in(c)
    original = create(c, "profiles", title="Thibault", summary="Présentation française")
    if existing_translation:
        save_variant(c, variant(c, original), summary="English presentation")

    def draft(data):
        assert data["content_language"] == "en"
        assert data["preferences"]["language"] == "en"
        assert data["current"]["entry"]["summary"] == (
            "English presentation" if existing_translation else "Présentation française"
        )
        return {"changes": {"summary": "An improved English presentation"}}

    configured(
        c,
        {
            "message": "Version anglaise",
            "tasks": [
                {
                    "key": "profile",
                    "kind": "profiles",
                    "entry_id": original["id"],
                    "fields": ["summary"],
                    "brief": "Improve the English version",
                }
            ],
        },
        {"profile": draft},
    )
    response = turn(c, "Améliorer la version anglaise", language="en")
    assert response.status_code == 200, response.text
    proposal = response.json()["proposal"]
    assert proposal["items"][0]["language"] == "en"
    assert apply(c, proposal).status_code == 200
    translated = variant(c, original)
    assert translated["entry"]["summary"] == "An improved English presentation"
    assert translated["localization"]["states"]["en"] == (
        "ready" if existing_translation else "draft"
    )
    assert variant(c, original, "fr")["entry"]["summary"] == "Présentation française"


def test_publication_controls_do_not_invalidate_reviewed_translation(admin_client):
    c = admin_client
    sign_in(c)
    original = create(
        c,
        "profiles",
        title="Thibault",
        profession="Ingénieur",
        summary="Résumé",
        body="Présentation",
    )
    saved = save_variant(
        c, variant(c, original), profession="Engineer", summary="Summary", body="Presentation"
    ).json()
    source = variant(c, saved, "fr")
    changed = update(c, source, visibility="public", featured=True).json()
    ready = c.post(
        f"{ROOT}/profiles/{source['id']}/transition",
        json={"version": changed["version"], "status": "ready"},
    )
    assert ready.status_code == 200, ready.text
    assert variant(c, ready.json())["localization"]["states"]["en"] == "ready"
    assert (
        c.get(f"/api/public/entries/profiles/{source['id']}?language=en").json()["language"] == "en"
    )
    assert update(c, ready.json(), language="en").status_code == 422
