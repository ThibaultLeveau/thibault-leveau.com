"""Migrations additives, transactionnelles et vérifiées avant l'ouverture du studio."""

from pathlib import Path

SCHEMA_VERSION = 2


def migrate(store):
    with store.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("CREATE TABLE IF NOT EXISTS content_migrations (version INTEGER PRIMARY KEY)")
        versions = [
            r[0] for r in db.execute("SELECT version FROM content_migrations ORDER BY version")
        ]
        if versions != list(range(1, len(versions) + 1)) or any(
            v > SCHEMA_VERSION for v in versions
        ):
            raise ValueError(
                "Version du schéma de contenus inconnue ; utilisez une image compatible."
            )
        for version in range(len(versions) + 1, SCHEMA_VERSION + 1):
            sql = (Path(__file__).parent / "migrations" / f"{version:03}.sql").read_text()
            # execute(), unlike executescript(), preserves the surrounding transaction.
            for statement in sql.split(";"):
                if statement.strip():
                    db.execute(statement)
            db.execute("INSERT INTO content_migrations VALUES (?)", (version,))
