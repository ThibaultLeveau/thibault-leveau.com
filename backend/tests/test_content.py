import io
import sqlite3

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError
from test_admin import ORIGIN, sign_in
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings

from personal_site.admin.store import AdminStore
from personal_site.config import Settings
from personal_site.content import backup
from personal_site.content.schemas import MODELS
from personal_site.main import create_app

ROOT = "/api/admin/content"


def create(client, kind, **values):
    response = client.post(f"{ROOT}/{kind}", json={"entry": {"title": kind, **values}})
    assert response.status_code == 201, response.text
    return response.json()


def update(client, record, **values):
    return client.put(
        f"{ROOT}/{record['kind']}/{record['id']}",
        json={"entry": {**record["entry"], **values}, "version": record["version"]},
    )


def transition(client, record, status):
    return client.post(
        f"{ROOT}/{record['kind']}/{record['id']}/transition",
        json={"version": record["version"], "status": status},
    )


@pytest.mark.parametrize("kind", MODELS)
def test_all_typed_collections_roundtrip_archive_restore_and_delete(admin_client, kind):
    client = admin_client
    sign_in(client)
    extra = {"external_url": "https://example.test/video"} if kind == "media" else {}
    record = create(client, kind, **extra)
    assert record["status"] == "draft"
    assert record["entry"]["visibility"] == "private"
    changed = update(
        client,
        record,
        title="Évolution du contenu",
        private_notes="Privé",
        links=[{"label": "Source", "url": "https://example.test"}],
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["entry"]["links"][0]["label"] == "Source"
    assert client.get(f"{ROOT}/{kind}?q=evolution").json()["total"] == 1
    assert "Privé" not in client.get(f"{ROOT}/{kind}").text
    if kind not in {"profiles", "media"}:
        copy = client.post(f"{ROOT}/{kind}/{record['id']}/duplicate", json={"version": 2})
        assert copy.status_code == 201, copy.text
        assert copy.json()["entry"]["slug"] != record["entry"]["slug"]
        assert copy.json()["status"] == "draft"
    archived = transition(client, changed.json(), "archived")
    assert archived.status_code == 200, archived.text
    assert update(client, archived.json(), summary="Change").status_code == 409
    assert client.get(f"{ROOT}/{kind}?status=archived").json()["total"] == 1
    restored = transition(client, archived.json(), "draft").json()
    assert restored["status"] == "draft"
    archived = transition(client, restored, "archived").json()
    removed = client.delete(f"{ROOT}/{kind}/{record['id']}?version={archived['version']}")
    assert removed.status_code == 204, removed.text


def test_projects_relationships_concurrency_and_atomicity(admin_client, admin_settings):
    client = admin_client
    sign_in(client)
    org = create(client, "organizations", title="Organisation", roles=[{"role": "client"}])
    experience = create(client, "experiences", organization_id=org["id"])
    skill = create(client, "skills", title="Conception API")
    tech = create(client, "technologies", title="FastAPI")
    service = create(client, "services")
    project = create(
        client,
        "projects",
        title="Projet pro",
        nature="professional",
        start_date="2024",
        end_date="2024-02",
        role="Développeur",
        responsibilities=[{"text": "Concevoir"}],
        outcomes=[{"text": "Livré"}],
        skills=[{"id": skill["id"], "context": "API"}],
        technologies=[{"id": tech["id"], "release": "1.0"}],
        experiences=[{"id": experience["id"], "context": "Mission"}],
        services=[{"id": service["id"]}],
        locations=[{"city": "Paris", "mode": "remote"}],
    )
    personal = create(client, "projects", title="Projet perso", nature="personal")
    assert personal["entry"]["experiences"] == []
    linked = client.get(f"{ROOT}/services/{service['id']}").json()
    assert linked["entry"]["projects"][0]["id"] == project["id"]
    assert update(client, service, summary="Édition périmée").status_code == 409
    invalid = update(
        client, project, title="Ne doit pas être enregistré", experiences=[{"id": skill["id"]}]
    )
    assert invalid.status_code == 422
    assert client.get(f"{ROOT}/projects/{project['id']}").json()["entry"]["title"] == "Projet pro"
    archived = transition(client, skill, "archived").json()
    delete = client.delete(f"{ROOT}/skills/{skill['id']}?version={archived['version']}")
    assert delete.status_code == 409 and delete.json()["usages"][0]["id"] == project["id"]
    changed = update(client, project, skills=[])
    assert changed.status_code == 200, changed.text
    assert client.get(f"{ROOT}/skills/{skill['id']}").status_code == 200
    assert update(client, project, summary="Conflit").status_code == 409
    with TestClient(create_app(admin_settings), base_url=ORIGIN) as restarted:
        restarted.headers["Origin"] = ORIGIN
        sign_in(restarted)
        saved = restarted.get(f"{ROOT}/projects/{project['id']}").json()["entry"]
        assert saved["start_date"] == "2024" and saved["technologies"][0]["release"] == "1.0"
        assert saved["locations"][0]["city"] == "Paris"


def test_structural_rules_and_ready_gate(admin_client):
    c = admin_client
    sign_in(c)
    project = create(c, "projects", title="Brouillon")
    assert transition(c, project, "ready").status_code == 422
    for value in (
        {"start_date": "2023-02-29"},
        {"start_date": "2025", "end_date": "2024"},
        {"end_date": "2024", "ongoing": True},
        {"links": [{"url": "javascript:alert(1)"}]},
        {"links": [{"url": "https://user:secret@example.test"}]},
        {"invented": "secret-value"},
        {"metrics": [{"label": "Temps", "result": "pas un nombre"}]},
    ):
        result = update(c, project, **value)
        assert result.status_code == 422, result.text
        assert "secret-value" not in result.text and "alert(1)" not in result.text
        assert result.json()["errors"]
    ready = update(
        c,
        project,
        nature="personal",
        summary="Résumé",
        body="Récit",
        phase="completed",
        role="Concepteur",
        start_date="2024",
        responsibilities=[{"text": "Concevoir"}],
        outcome_note="Aucune mesure disponible",
        metrics=[{"label": "Délai", "baseline": "10.50", "result": "3.00", "unit": "s"}],
    ).json()
    assert ready["entry"]["metrics"][0]["result"] == "3.00"
    ready = transition(c, ready, "ready").json()
    assert ready["status"] == "ready"
    assert update(c, ready, role="").status_code == 422
    result = c.put(
        f"{ROOT}/projects/{ready['id']}",
        json={
            "entry": {**ready["entry"], "role": ""},
            "version": ready["version"],
            "as_draft": True,
        },
    )
    assert result.status_code == 200 and result.json()["status"] == "draft"
    service = create(
        c, "services", packages=[{"name": "Gratuit", "pricing": "fixed", "amount": "0.00"}]
    )
    assert service["entry"]["packages"][0]["amount"] == "0.00"
    assert update(c, service, packages=[{"pricing": "quote", "amount": "0"}]).status_code == 422
    cert = create(c, "certifications", state="preparing")
    assert update(c, cert, issue_date="2024").status_code == 422
    assert (
        update(
            c, cert, state="earned", issue_date="2024-06", validity="dated", expiry_date="2023"
        ).status_code
        == 422
    )
    testimonial = create(
        c,
        "testimonials",
        quote="Citation",
        anonymous=True,
        relationship="Mission",
        visibility="public",
    )
    assert transition(c, testimonial, "ready").status_code == 422


def test_taxonomy_scope_and_single_profile(admin_client):
    c = admin_client
    sign_in(c)
    category = create(c, "taxonomies", scope="post_category")
    bad = c.post(
        f"{ROOT}/projects", json={"entry": {"title": "Wrong", "tags": [{"id": category["id"]}]}}
    )
    assert bad.status_code == 422
    create(c, "profiles")
    assert c.post(f"{ROOT}/profiles", json={"entry": {"title": "Second"}}).status_code == 409
    domain = create(c, "taxonomies", title="Domaine", scope="skill_domain")
    create(c, "skills", domain_id=domain["id"])
    assert update(c, domain, scope="tag").status_code == 409


def png():
    stream = io.BytesIO()
    Image.new("RGB", (12, 8), "blue").save(stream, format="PNG")
    return stream.getvalue()


def upload(c, blob=None, mime="image/png", filename="capture.png"):
    return c.post(
        f"{ROOT}/media/upload",
        params={"filename": filename},
        content=png() if blob is None else blob,
        headers={"Content-Type": mime},
    )


def test_private_upload_limits_type_csrf_and_reuse(admin_client):
    c = admin_client
    assert upload(c).status_code == 401
    sign_in(c)
    csrf = c.headers.pop("X-CSRF-Token")
    assert upload(c).status_code == 403
    c.headers["X-CSRF-Token"] = csrf
    assert upload(c, b"<svg/>", "image/svg+xml").status_code == 415
    assert upload(c, b"<script>alert(1)</script>").status_code == 422
    assert upload(c, b"a" * (10 * 1024 * 1024 + 1)).status_code == 413
    media = upload(c, filename="../../capture.png")
    assert media.status_code == 201, media.text
    media = media.json()
    assert media["file"]["width"] == 12 and media["file"]["original_name"] == "capture.png"
    file = c.get(f"{ROOT}/media/{media['id']}/file")
    assert file.content == png() and file.headers["cache-control"] == "no-store"
    project = create(c, "projects", media=[{"id": media["id"], "role": "cover"}])
    assert any(e["code"] == "alternative" for e in project["errors"])
    assert not list(c.app.state.media_files.directory.glob(".upload-*"))
    c.cookies.clear()
    assert c.get(f"{ROOT}/media/{media['id']}/file").status_code == 401


def test_api_is_private_and_json_limit_remains(admin_client):
    c = admin_client
    for path in ("/catalog", "/projects", "/profiles", "/media/usage", "/projects/1"):
        assert c.get(ROOT + path).status_code == 401
    sign_in(c)
    assert c.get(ROOT + "/unknown").status_code == 404
    assert c.post(ROOT + "/projects", content=b"a" * (256 * 1024 + 1)).status_code == 413
    assert c.get(ROOT + "/projects?sort=title;DROP").status_code == 422


def test_future_migration_fails_closed(admin_settings):
    app = create_app(admin_settings)
    with app.state.admin_store.connect() as db:
        db.execute("INSERT INTO content_migrations VALUES (2)")
    with pytest.raises(ValueError, match="Version du schéma"):
        create_app(admin_settings)
    with sqlite3.connect(admin_settings.admin_db_path) as db:
        assert db.execute("SELECT username FROM account").fetchone()[0] == "thibault"


@pytest.mark.parametrize("quota", [0, -1, 1024**4 + 1])
def test_media_quota_configuration_is_bounded(quota):
    with pytest.raises(ValidationError):
        Settings(media_quota_bytes=quota, _env_file=None)


def test_chronology_expiry_and_stable_identifiers(admin_client):
    c = admin_client
    sign_in(c)
    first = create(c, "projects", title="Ancien", start_date="2020")
    newer = create(c, "projects", title="Récent", start_date="2024-06")
    listed = c.get(f"{ROOT}/projects?sort=chronology").json()["items"]
    assert [r["id"] for r in listed] == [newer["id"], first["id"]]
    archived = transition(c, newer, "archived").json()
    assert (
        c.delete(f"{ROOT}/projects/{newer['id']}?version={archived['version']}").status_code == 204
    )
    assert create(c, "projects", title="Nouveau")["id"] > newer["id"]
    expired = create(
        c, "certifications", state="earned", issue_date="2020", validity="dated", expiry_date="2021"
    )
    assert expired["derived"]["expired"] is True
    preparing = create(c, "certifications", title="En préparation", state="preparing")
    assert preparing["derived"]["expired"] is False


def test_migration_preserves_populated_legacy_database(admin_settings):
    legacy = AdminStore(admin_settings)
    legacy.save_provider("openai", "existing-model", "encrypted-test-key", False)
    token, csrf = legacy.new_session("", legacy.account())
    before = legacy.account()
    app = create_app(admin_settings)
    assert app.state.admin_store.account() == before
    assert app.state.admin_store.provider(decrypt=True)["api_key"] == "encrypted-test-key"
    assert app.state.admin_store.session(token)["csrf"] == csrf
    with app.state.admin_store.connect() as db:
        assert db.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
        assert db.execute("SELECT version FROM content_migrations").fetchone()[0] == 1


def test_media_quota_delete_and_external_video(admin_client):
    c = admin_client
    sign_in(c)
    c.app.state.media_files.quota = len(png()) + 1
    saved = upload(c).json()
    assert upload(c).status_code == 413
    assert not list(c.app.state.media_files.directory.glob(".upload-*"))
    external = create(c, "media", nature="video", external_url="https://example.test/video")
    project = create(
        c,
        "projects",
        media=[{"id": external["id"], "role": "video", "transcript": "Transcription"}],
    )
    assert project["entry"]["media"][0]["transcript"] == "Transcription"
    assert c.get(f"{ROOT}/media/{external['id']}/file").status_code == 404
    archived = transition(c, saved, "archived").json()
    assert c.delete(f"{ROOT}/media/{saved['id']}?version={archived['version']}").status_code == 204
    assert not list(c.app.state.media_files.directory.glob("*.png"))


def test_backup_restore_database_files_manifest_and_revoked_sessions(
    admin_client, admin_settings, tmp_path
):
    c = admin_client
    sign_in(c)
    media = upload(c).json()
    project = create(
        c, "projects", title="À restaurer", media=[{"id": media["id"], "alt": "Preuve"}]
    )
    directory = tmp_path / "backup"
    manifest = backup.export(admin_settings.admin_db_path, directory, "abcdef123456")
    assert manifest["schema_version"] == 1 and len(manifest["files"]) == 1
    assert backup.verify(directory) == manifest
    restored = tmp_path / "restored"
    backup.restore(directory, restored)
    with sqlite3.connect(restored / "admin.sqlite3") as db:
        assert db.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
        assert (
            db.execute(
                "SELECT title FROM content_entries WHERE id = ?", (project["id"],)
            ).fetchone()[0]
            == "À restaurer"
        )
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert next((restored / "media").iterdir()).read_bytes() == png()
    settings = admin_settings.model_copy(update={"admin_db_path": restored / "admin.sqlite3"})
    app = create_app(settings)
    assert (
        app.state.content_store.get("projects", project["id"])["entry"]["media"][0]["alt"]
        == "Preuve"
    )
    with pytest.raises(ValueError, match="existe déjà"):
        backup.export(admin_settings.admin_db_path, directory, "abcdef123456")
    with pytest.raises(ValueError, match="nouveau répertoire"):
        backup.restore(directory, restored)
    next((directory / "media").iterdir()).write_bytes(b"tampered")
    with pytest.raises(ValueError, match="empreinte"):
        backup.verify(directory)
