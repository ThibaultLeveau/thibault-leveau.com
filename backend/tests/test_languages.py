import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from string import Formatter

import httpx
import pytest
from assistant_fakes import ScriptedProvider, request_data
from fastapi.testclient import TestClient
from public_fixtures import seed_public
from test_admin import ORIGIN, save_provider, sign_in
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_assistant import propose, turn

from personal_site.assistant.contracts import Operation
from personal_site.assistant.models import ModelFactory
from personal_site.content.backup import export, restore
from personal_site.content.catalog import catalog
from personal_site.content.schemas import LABELS, MODELS
from personal_site.i18n import CATALOGS, SCHEMA_KEYS, current_language, schema_text
from personal_site.main import create_app

ROOT = "/api/admin/languages"
DEFAULTS = {"public_language": "fr", "admin_language": "fr", "version": 1}


def save(client, public, admin):
    version = client.get(ROOT).json()["version"]
    response = client.put(
        ROOT,
        json={
            "public_language": public,
            "admin_language": admin,
            "version": version,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_disabled_languages_and_defaults(client, admin_client):
    for area in ("public", "admin"):
        response = client.get(f"/api/public/language?area={area}")
        assert response.json() == {"language": "fr"}
        assert response.headers["cache-control"] == "no-store"
    assert client.get(ROOT).status_code == 503
    assert admin_client.get(ROOT).status_code == 401
    assert admin_client.put(ROOT, json=DEFAULTS).status_code == 401
    sign_in(admin_client)
    assert admin_client.get(ROOT).json() == DEFAULTS


def test_language_auth_validation_and_concurrency(admin_client):
    c = admin_client
    sign_in(c)
    for headers in ({"X-CSRF-Token": "bad"}, {"Origin": "https://evil.test"}):
        assert c.put(ROOT, json=DEFAULTS, headers=headers).status_code == 403
    for invalid in (
        {"public_language": "de"},
        {"admin_language": "<script>"},
        {"version": True},
        {"version": 0},
        {"version": 9223372036854775808},
        {"username": "leak"},
    ):
        response = c.put(ROOT, json={**DEFAULTS, **invalid})
        assert response.status_code == 422
        assert "<script>" not in response.text and "leak" not in response.text
    updated = save(c, "fr", "en")
    assert updated == {**DEFAULTS, "admin_language": "en", "version": 2}
    conflict = c.put(ROOT, json=DEFAULTS)
    assert conflict.status_code == 409
    assert (
        conflict.json()["detail"] == "These settings have changed. Reload them before trying again."
    )
    assert c.get(ROOT).json() == updated
    assert c.get("/api/public/language?area=all").status_code == 422


@pytest.mark.parametrize("public,admin", [("en", "fr"), ("fr", "en"), ("en", "en")])
def test_independent_html_api_schema_and_content(admin_client, public, admin):
    c = admin_client
    sign_in(c)
    entry = c.post(
        "/api/admin/content/projects",
        json={
            "entry": {
                "title": "Mon projet français",
                "summary": "Ce texte doit rester intact.",
                "body": "active",
                "language": "fr",
            }
        },
    ).json()
    save(c, public, admin)
    for path, language in (("/", public), ("/admin", admin), ("/projets", public)):
        response = c.get(path)
        assert f'<html lang="{language}" data-interface-language="{language}">' in response.text
        assert response.headers["content-language"] == language
        assert response.headers["cache-control"] == "no-store"
    assert ("Projects" if public == "en" else "Projets") in c.get("/projets").text
    for area, language in (("public", public), ("admin", admin)):
        # The anonymous bootstrap exposes precisely one code, no private settings.
        assert c.get(f"/api/public/language?area={area}").json() == {"language": language}
    definition = c.get("/api/admin/content/catalog").json()["projects"]
    assert definition["label"] == ("Projects" if admin == "en" else "Projets")
    assert definition["schema"]["properties"]["title"]["title"] == (
        "Title / name" if admin == "en" else "Titre / nom"
    )
    record = c.get(f"/api/admin/content/projects/{entry['id']}").json()
    assert record["entry"] == entry["entry"]
    assert record["errors"]
    required = next(e for e in record["errors"] if e["path"] == "nature")
    assert required["message"] == (
        "Complete “Type”." if admin == "en" else "Renseignez « Nature »."
    )
    assert c.get("/api/admin/assistant/preferences").json()["defaults"]["language"] == "fr"

    # Request-scoped language must not bleed between concurrent public/admin responses.
    def check(path):
        return c.get(path).headers["content-language"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        assert list(pool.map(check, ["/", "/admin"] * 8)) == [public, admin] * 8
    assert current_language.get() == "fr"
    c.post("/api/admin/logout")
    denied = c.get(ROOT)
    assert denied.status_code == 401
    assert denied.json()["detail"] == (
        "Sign in to access administration."
        if admin == "en"
        else "Connectez-vous pour accéder à l’administration."
    )


def test_migration_restart_backup_and_restore(admin_client, admin_settings, tmp_path):
    c = admin_client
    sign_in(c)
    account = c.app.state.admin_store.account()
    # Reconstruct the populated schema-2 predecessor, preserving the existing account/session.
    with c.app.state.admin_store.connect() as db:
        from assistant_fakes import drop_job_schema

        drop_job_schema(db)
        db.execute("DROP TABLE content_localized_values")
        db.execute("DROP TABLE content_localizations")
        db.execute("DROP TABLE site_languages")
        db.execute("DELETE FROM content_migrations WHERE version >= 3")
    app = create_app(admin_settings)
    assert app.state.admin_store.languages() == DEFAULTS
    assert app.state.admin_store.account() == account
    with TestClient(app, base_url=ORIGIN) as restarted:
        restarted.cookies.update(c.cookies)
        restarted.headers.update(c.headers)
        assert restarted.get("/api/admin/session").status_code == 200
        expected = save(restarted, "en", "fr")
    assert create_app(admin_settings).state.admin_store.languages() == expected
    archive = tmp_path / "backup"
    export(admin_settings.admin_db_path, archive, "abc1234")
    restored = tmp_path / "restored"
    restore(archive, restored)
    restored_settings = admin_settings.model_copy(
        update={"admin_db_path": restored / "admin.sqlite3"}
    )
    with TestClient(create_app(restored_settings), base_url=ORIGIN) as restored_client:
        assert restored_client.app.state.admin_store.languages() == expected
        restored_client.cookies.update(c.cookies)
        assert restored_client.get(ROOT).status_code == 401


def test_persisted_proposal_metadata_follows_language_without_changing_content(admin_client):
    c = admin_client
    sign_in(c)
    proposal = propose(
        c,
        [
            Operation(
                key="project",
                kind="projects",
                changes={"title": "Mon projet", "body": "active", "private_notes": "Texte intact"},
            )
        ],
    )
    original = proposal["items"][0]
    assert any("Renseignez" in error["message"] for error in original["errors"])
    save(c, "fr", "en")
    translated = c.get(f"/api/admin/assistant/proposals/{proposal['id']}").json()["items"][0]
    assert translated["title"] == original["title"]
    assert [(v["before"], v["after"]) for v in translated["changes"]] == [
        (v["before"], v["after"]) for v in original["changes"]
    ]
    assert any("Complete" in error["message"] for error in translated["errors"])
    assert all("Renseignez" not in error["message"] for error in translated["errors"])
    assert translated["changes"][0]["label"] == "Title / name"


@pytest.mark.parametrize("admin,expected", [("fr", "français"), ("en", "anglais")])
def test_conversation_language_is_distinct_from_editorial_preferences(
    admin_client, admin, expected
):
    c = admin_client
    sign_in(c)
    save_provider(c)
    save(c, "fr", admin)
    provider = ScriptedProvider({"message": "A response from the simulated provider."})
    c.app.state.assistant.models = ModelFactory(httpx.MockTransport(provider))
    response = turn(c, "Bonjour")
    assert response.status_code == 200
    assert len(provider.requests) == 1
    request = provider.requests[0]
    assert f"clarification : {expected}" in json.dumps(request, ensure_ascii=False)
    assert request_data(request)["preferences"]["language"] == "fr"


def test_public_anonymity_and_new_copy_label_without_rewriting_content(admin_client):
    c = admin_client
    sign_in(c)
    records = seed_public(c.app)
    testimonial = records["testimonials"]
    updated = c.put(
        f"/api/admin/content/testimonials/{testimonial['id']}",
        json={
            "entry": {**testimonial["entry"], "anonymous": True},
            "version": testimonial["version"],
        },
    )
    assert updated.status_code == 200
    save(c, "en", "en")
    listing = c.get("/api/public/entries?kind=testimonials").json()
    assert listing["items"][0]["title"] == "Anonymous testimonial"
    public = c.get(f"/api/public/entries/testimonials/{testimonial['id']}").json()
    assert public["entry"]["quote"] == testimonial["entry"]["quote"]
    project = c.get(f"/api/admin/content/projects/{records['projects']['id']}").json()
    copied = c.post(
        f"/api/admin/content/projects/{project['id']}/duplicate",
        json={"version": project["version"]},
    )
    assert copied.status_code == 201, copied.text
    assert copied.json()["entry"]["title"] == project["entry"]["title"] + " — copy"
    original = c.get(f"/api/admin/content/projects/{project['id']}").json()
    assert original["entry"] == project["entry"]


def test_catalogs_cover_all_form_metadata_and_interpolations():
    assert CATALOGS["fr"].keys() == CATALOGS["en"].keys()
    formatter = Formatter()
    for key, french in CATALOGS["fr"].items():
        assert CATALOGS["en"][key].strip(), key

        def fields(text):
            return {field for _, field, _, _ in formatter.parse(text) if field}

        assert fields(french) == fields(CATALOGS["en"][key]), key
    token = current_language.set("en")
    try:
        definitions = catalog()

        def walk(schema):
            for field in schema.get("properties", {}).values():
                if field.get("title"):
                    # Generated ID and model titles are machine metadata; all explicit UI titles
                    # must be present in the closed schema translation map.
                    if field["title"] != "Id":
                        assert field["title"] in SCHEMA_KEYS, field["title"]
                        assert schema_text(field["title"]) in CATALOGS["en"].values()
            for definition in schema.get("$defs", {}).values():
                walk(definition)

        for kind, model in MODELS.items():
            walk(model.model_json_schema())
            assert definitions[kind]["label"] == schema_text(LABELS[kind][0])
    finally:
        current_language.reset(token)
    frontend = Path(__file__).resolve().parents[2] / "frontend/src/i18n/locales"
    fr, en = (json.loads((frontend / f"{lang}.json").read_text()) for lang in ("fr", "en"))
    assert {key for key in fr if not key.endswith("_many")} == en.keys()
    for key, value in en.items():
        assert sorted(re.findall(r"{{(.*?)}}", value)) == sorted(
            re.findall(r"{{(.*?)}}", fr[key])
        ), key
