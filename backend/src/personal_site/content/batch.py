"""Lots atomiques réutilisables par l'assistant ; aucun code LangChain dans le métier."""

from copy import deepcopy

from personal_site.content.catalog import list_fields, target
from personal_site.content.schemas import MODELS
from personal_site.content.validation import ContentError, slugify, validate


def reference_ids(kind, data):
    for name, value in data.items():
        if target(kind, name):
            for ident in [row["id"] for row in value] if isinstance(value, list) else [value]:
                if ident is not None:
                    yield ident


def check_versions(db, versions):
    for ident, version in versions.items():
        row = db.execute(
            "SELECT version FROM content_entries WHERE id = ?", (int(ident),)
        ).fetchone()
        if not row or row[0] != version:
            raise ContentError(
                "Une fiche ou une référence a changé. Demandez une nouvelle proposition.",
                status=409,
            )


def write_batch(store, db, operations, versions):
    """Caller owns BEGIN IMMEDIATE and commit/rollback (including dry-run savepoints)."""
    check_versions(db, versions)
    keys = [op["key"] for op in operations]
    ids = [op["entry_id"] for op in operations if op["entry_id"] is not None]
    if len(set(keys)) != len(keys) or len(set(ids)) != len(ids):
        raise ContentError("Le lot contient des fiches répétées.")
    mapping, entries = {}, {}
    for op in operations:
        kind, ident = op["kind"], op["entry_id"]
        if kind not in MODELS:
            raise ContentError("Collection inconnue.")
        if ident is not None:
            previous = store.read(db, kind, ident)
            if previous["version"] != op["version"]:
                raise ContentError(
                    "La fiche a changé. Demandez une nouvelle proposition.", status=409
                )
            if previous["status"] == "archived":
                raise ContentError("Restaurez la fiche avant de la modifier.", status=409)
            entries[op["key"]] = {**previous["entry"], **deepcopy(op["changes"])}
            mapping[op["key"]] = ident
        else:
            entries[op["key"]] = deepcopy(op["changes"])

    # Reserve real rows for new references before filling associations. Skeletons are never
    # committed or exposed; this also supports cycles between newly created entries.
    for op in operations:
        if op["entry_id"] is not None:
            continue
        kind, data = op["kind"], entries[op["key"]]
        skeleton = {k: v for k, v in data.items() if not target(kind, k)}
        if kind == "media" and skeleton.get("source") == "file":
            raise ContentError("Téléversez le fichier avant de demander ses métadonnées.")
        normalized = validate(kind, skeleton)
        normalized["slug"] = normalized["slug"] or slugify(normalized["title"])
        mapping[op["key"]] = store.write(db, kind, normalized)

    normalized_entries = {}
    for op in operations:
        kind, data = op["kind"], entries[op["key"]]
        for name in list(data):
            if not target(kind, name):
                continue

            def resolve(value):
                if isinstance(value, str) and value.startswith("@") and value[1:] in mapping:
                    return mapping[value[1:]]
                return value

            if name in list_fields(kind):
                data[name] = [{**row, "id": resolve(row["id"])} for row in data[name]]
            else:
                data[name] = resolve(data[name])
        normalized_entries[op["key"]] = validate(kind, data)

    # Both sides of a reciprocal relation must agree; a later write cannot silently undo
    # an earlier specialist's change. Write validation below still enforces every FK/type.
    for op in operations:
        ident = mapping[op["key"]]
        current = store.read(db, op["kind"], ident)
        # Earlier operations may have changed the inverse side of an association.
        # Rebase only the explicitly requested fields onto that transaction-local state.
        data = validate(
            op["kind"],
            {
                **current["entry"],
                **{name: normalized_entries[op["key"]][name] for name in op["changes"]},
            },
        )
        store.write(
            db,
            op["kind"],
            data,
            entry_id=ident,
            version=current["version"],
            as_draft=op["as_draft"],
        )
    for op in operations:
        actual = store.read(db, op["kind"], mapping[op["key"]])["entry"]
        expected = normalized_entries[op["key"]]
        for name in op["changes"]:
            if name == "slug" and not expected[name]:
                continue
            if actual[name] != expected[name]:
                raise ContentError(
                    "Les associations proposées se contredisent. Précisez la demande."
                )
    return [store.read(db, op["kind"], mapping[op["key"]]) for op in operations]
