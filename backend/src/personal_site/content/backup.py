"""Export cohérent et restauration isolée. Ne remplace jamais un répertoire existant."""

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import tempfile
from pathlib import Path

from personal_site.config import Settings
from personal_site.content.migrate import SCHEMA_VERSION

FILE_NAME = re.compile(r"[0-9a-f]{48}\.(jpg|png|webp|pdf|mp4|webm)")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def readonly(path):
    return sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=60)


def integrity(db):
    if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise ValueError("L'intégrité de la base n'est pas vérifiée.")
    if db.execute("PRAGMA foreign_key_check").fetchall():
        raise ValueError("Des références de la base sont invalides.")
    versions = [r[0] for r in db.execute("SELECT version FROM content_migrations ORDER BY version")]
    if versions != list(range(1, SCHEMA_VERSION + 1)):
        raise ValueError("La version du schéma demande une image compatible.")


def copy_private(source, destination):
    if source.is_symlink() or not source.is_file():
        raise ValueError("Un fichier attendu est absent ou est un lien symbolique.")
    with source.open("rb") as src, destination.open("xb") as dst:
        os.chmod(destination, 0o600)
        shutil.copyfileobj(src, dst, 1024 * 1024)
        dst.flush()
        os.fsync(dst.fileno())


def export(database: Path, destination: Path, commit: str):
    if destination.exists():
        raise ValueError("Le répertoire de destination existe déjà ; choisissez un nouveau nom.")
    if not re.fullmatch(r"[0-9a-f]{7,40}|unknown", commit):
        raise ValueError("Le commit doit être un identifiant Git, ou unknown.")
    stage = Path(tempfile.mkdtemp(prefix=".studio-backup-", dir=destination.parent))
    try:
        (stage / "media").mkdir(mode=0o700)
        # A reserved SQLite write lock blocks content writes, uploads and purges. The
        # second connection performs the backup while the first keeps that lock.
        with sqlite3.connect(database, timeout=60) as lock:
            lock.execute("BEGIN IMMEDIATE")
            with readonly(database) as source, sqlite3.connect(stage / "admin.sqlite3") as target:
                integrity(source)
                source.backup(target)
                integrity(target)
                files = []
                for name, size, sha in source.execute(
                    "SELECT storage_name, size, sha256 FROM media_files ORDER BY storage_name"
                ):
                    if not FILE_NAME.fullmatch(name):
                        raise ValueError("Nom de stockage invalide.")
                    copied = stage / "media" / name
                    copy_private(database.parent / "media" / name, copied)
                    if copied.stat().st_size != size or digest(copied) != sha:
                        raise ValueError("L'empreinte d'un média ne correspond pas à la base.")
                    files.append({"storage_name": name, "size": size, "sha256": sha})
        os.chmod(stage / "admin.sqlite3", 0o600)
        manifest = {
            "format": 1,
            "schema_version": SCHEMA_VERSION,
            "commit": commit,
            "database": {
                "sha256": digest(stage / "admin.sqlite3"),
                "size": (stage / "admin.sqlite3").stat().st_size,
            },
            "files": files,
        }
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        os.chmod(stage / "manifest.json", 0o600)
        stage.rename(destination)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    return manifest


def verify(directory: Path):
    manifest_path = directory / "manifest.json"
    if manifest_path.is_symlink() or manifest_path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("Manifeste invalide.")
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("format") != 1 or manifest.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("Format ou version de sauvegarde incompatible.")
    database = directory / "admin.sqlite3"
    if (
        database.is_symlink()
        or database.stat().st_size != manifest["database"]["size"]
        or digest(database) != manifest["database"]["sha256"]
    ):
        raise ValueError("L'empreinte de la base ne correspond pas au manifeste.")
    with readonly(database) as db:
        integrity(db)
        expected = [
            {"storage_name": r[0], "size": r[1], "sha256": r[2]}
            for r in db.execute(
                "SELECT storage_name, size, sha256 FROM media_files ORDER BY storage_name"
            )
        ]
    if expected != manifest["files"]:
        raise ValueError("La liste des médias ne correspond pas à la base.")
    media = directory / "media"
    if media.is_symlink() or not media.is_dir():
        raise ValueError("Répertoire de médias invalide.")
    for file in expected:
        name = file["storage_name"]
        if not FILE_NAME.fullmatch(name):
            raise ValueError("Nom de stockage invalide.")
        path = media / name
        if (
            path.is_symlink()
            or not path.is_file()
            or path.stat().st_size != file["size"]
            or digest(path) != file["sha256"]
        ):
            raise ValueError("Un média manque ou son empreinte est incorrecte.")
    return manifest


def restore(source: Path, destination: Path):
    if destination.exists():
        raise ValueError(
            "La restauration exige un nouveau répertoire vide, sans écraser le service."
        )
    manifest = verify(source)
    stage = Path(tempfile.mkdtemp(prefix=".studio-restore-", dir=destination.parent))
    try:
        (stage / "media").mkdir(mode=0o700)
        copy_private(source / "admin.sqlite3", stage / "admin.sqlite3")
        for file in manifest["files"]:
            name = file["storage_name"]
            copy_private(source / "media" / name, stage / "media" / name)
        with sqlite3.connect(stage / "admin.sqlite3") as db:
            db.execute("PRAGMA foreign_keys = ON")
            db.execute("DELETE FROM sessions")
            integrity(db)
        stage.rename(destination)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    backup = commands.add_parser("export")
    backup.add_argument("destination", type=Path)
    backup.add_argument("--commit", required=True)
    check = commands.add_parser("verify")
    check.add_argument("source", type=Path)
    recover = commands.add_parser("restore")
    recover.add_argument("source", type=Path)
    recover.add_argument("destination", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "export":
            result = export(Settings().admin_db_path, args.destination, args.commit)
        elif args.command == "verify":
            result = verify(args.source)
        else:
            result = restore(args.source, args.destination)
    except (OSError, ValueError, KeyError, sqlite3.Error) as exc:
        parser.exit(1, f"Échec de la sauvegarde/restauration : {exc}\n")
    print(
        f"Opération vérifiée : schéma {result['schema_version']}, {len(result['files'])} média(s)."
    )


if __name__ == "__main__":
    main()
