"""Migration and private backups preserve durable work across revoked sessions."""

import sqlite3

import pytest
from assistant_fakes import drop_job_schema
from fastapi.testclient import TestClient
from test_admin import API_KEY, ORIGIN, save_provider, sign_in
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_assistant import ROOT, apply
from test_assistant_jobs import BulkProvider, batches, configure, request_payload, wait_job
from test_content import create, png, upload
from test_localizations import save_variant, variant

from personal_site.admin.security import COOKIE_NAME
from personal_site.content import backup
from personal_site.content.migrate import migrate
from personal_site.main import create_app


def test_migration_five_preserves_populated_bilingual_database(admin_client):
    c = admin_client
    sign_in(c)
    save_provider(c)
    media = upload(c).json()
    record = create(
        c,
        "skills",
        title="Avant les travaux",
        private_notes="Faits privés conservés",
        media=[{"id": media["id"], "alt": "Illustration"}],
    )
    translated = save_variant(c, variant(c, record), title="Before saved work").json()
    original = c.get(f"/api/admin/content/skills/{record['id']}").json()
    store = c.app.state.admin_store
    account = store.account()
    with store.connect() as db:
        drop_job_schema(db)
        before = {
            name: db.execute(f"SELECT * FROM {name}").fetchall()
            for name in (
                "sessions",
                "provider",
                "content_entries",
                "media_files",
                "site_languages",
                "content_localizations",
                "content_localized_values",
            )
        }
        assert db.execute("SELECT max(version) FROM content_migrations").fetchone()[0] == 4
    migrate(store)
    migrate(store)
    with store.connect() as db:
        assert [r[0] for r in db.execute("SELECT version FROM content_migrations")] == [
            1,
            2,
            3,
            4,
            5,
        ]
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
        for name, rows in before.items():
            assert db.execute(f"SELECT * FROM {name}").fetchall() == rows
        assert db.execute("SELECT count(*) FROM assistant_jobs").fetchone()[0] == 0
    assert store.account() == account
    assert store.provider(decrypt=True)["api_key"] == API_KEY
    assert c.get("/api/admin/session").status_code == 200
    assert c.get(f"/api/admin/content/skills/{record['id']}").json() == original
    assert variant(c, record) == translated
    assert c.get(f"/api/admin/content/media/{media['id']}/file").content == png()


def test_migration_five_rolls_back_all_tables_on_schema_error(admin_client):
    store = admin_client.app.state.admin_store
    with store.connect() as db:
        drop_job_schema(db)
        db.execute("CREATE TABLE assistant_job_tasks (conflicting_name TEXT)")
    with pytest.raises(sqlite3.OperationalError, match="already exists"):
        migrate(store)
    with store.connect() as db:
        assert db.execute("SELECT max(version) FROM content_migrations").fetchone()[0] == 4
        assert not db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='assistant_jobs'"
        ).fetchone()
        assert not db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='assistant_job_inputs'"
        ).fetchone()
        db.execute("DROP TABLE assistant_job_tasks")
    migrate(store)


def test_backup_restores_durable_receipts_and_pending_batches_after_relogin(
    admin_client, admin_settings, tmp_path
):
    c = admin_client
    provider = BulkProvider(4)
    configure(c, provider)
    media = upload(c).json()
    payload = request_payload("Faits utilisateur à conserver pour la reprise.")
    payload["messages"] = [
        {"role": "user", "content": "Premier fait utilisateur."},
        {"role": "assistant", "content": "Ne pas conserver cet historique de conversation."},
        *payload["messages"],
    ]
    response = c.post(f"{ROOT}/jobs", json=payload)
    assert response.status_code == 200, response.text
    ident = response.json()["id"]
    assert wait_job(c, ident)["status"] == "review"
    proposals = batches(c, ident)
    assert len(proposals) == 2
    receipt = apply(c, proposals[0]).json()
    assert receipt["state"] == "applied"
    assert wait_job(c, ident)["status"] == "review"
    old_token = c.cookies.get(COOKIE_NAME)
    archive = tmp_path / "jobs-backup"
    manifest = backup.export(admin_settings.admin_db_path, archive, "abcdef123456")
    assert manifest["schema_version"] == 5
    assert backup.verify(archive) == manifest
    restored = tmp_path / "jobs-restored"
    backup.restore(archive, restored)
    with sqlite3.connect(restored / "admin.sqlite3") as db:
        assert db.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM assistant_jobs").fetchone()[0] == 1
        assert db.execute("SELECT count(*) FROM assistant_job_tasks").fetchone()[0] == 4
        assert db.execute("SELECT count(*) FROM assistant_job_batches").fetchone()[0] == 2
        assert [r[0] for r in db.execute("SELECT message FROM assistant_job_inputs")] == [
            "Premier fait utilisateur.",
            "Faits utilisateur à conserver pour la reprise.",
        ]
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
    settings = admin_settings.model_copy(update={"admin_db_path": restored / "admin.sqlite3"})
    with TestClient(create_app(settings), base_url=ORIGIN) as recovery:
        recovery.headers["Origin"] = ORIGIN
        recovery.cookies.set(COOKIE_NAME, old_token)
        assert recovery.get(f"{ROOT}/jobs/{ident}").status_code == 401
        recovery.cookies.clear()
        sign_in(recovery)
        jobs = recovery.get(f"{ROOT}/jobs").json()
        assert jobs["total"] == 1 and jobs["items"][0]["id"] == ident
        assert jobs["items"][0]["status"] == "review"
        assert not recovery.app.state.assistant.jobs.running
        assert recovery.get(f"{ROOT}/proposals/{proposals[0]['id']}").json() == receipt
        assert apply(recovery, proposals[0]).json() == receipt
        assert recovery.get("/api/admin/content/skills").json()["total"] == 3
        assert apply(recovery, proposals[1]).status_code == 200
        assert recovery.get("/api/admin/content/skills").json()["total"] == 4
        assert recovery.get(f"{ROOT}/jobs/{ident}").json()["status"] == "completed"
        assert recovery.get(f"/api/admin/content/media/{media['id']}/file").content == png()
    assert c.get("/api/admin/content/skills").json()["total"] == 3
