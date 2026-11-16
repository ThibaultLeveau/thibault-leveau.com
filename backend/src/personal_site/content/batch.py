"""Lots atomiques réutilisables par l'assistant ; aucun code LangChain dans le métier."""

from copy import deepcopy

from personal_site.content.catalog import list_fields, target
from personal_site.content.localization import localize
from personal_site.content.schemas import MODELS
from personal_site.content.validation import ContentError, slugify, validate
from personal_site.i18n import tr


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
                tr("errors.batchConflict"),
                status=409,
            )


def write_batch(store, db, operations, versions):
    """Caller owns BEGIN IMMEDIATE and commit/rollback (including dry-run savepoints)."""
    check_versions(db, versions)
    keys = [op["key"] for op in operations]
    ids = [op["entry_id"] for op in operations if op["entry_id"] is not None]
    if len(set(keys)) != len(keys) or len(set(ids)) != len(ids):
        raise ContentError(tr("errors.batchDuplicate"))
    mapping, entries = {}, {}
    for op in operations:
        kind, ident = op["kind"], op["entry_id"]
        if kind not in MODELS:
            raise ContentError(tr("errors.unknownCollection"))
        if ident is not None:
            previous = localize(db, store.read(db, kind, ident), op.get("language"))
            if previous["version"] != op["version"]:
                raise ContentError(tr("errors.proposalEntryConflict"), status=409)
            if previous["status"] == "archived":
                raise ContentError(tr("errors.restoreEntry"), status=409)
            entries[op["key"]] = {**previous["entry"], **deepcopy(op["changes"])}
            mapping[op["key"]] = ident
        else:
            entries[op["key"]] = {
                **deepcopy(op["changes"]),
                **({"language": op["language"]} if op.get("language") else {}),
            }

    # Reserve real rows for new references before filling associations. Skeletons are never
    # committed or exposed; this also supports cycles between newly created entries.
    for op in operations:
        if op["entry_id"] is not None:
            continue
        kind, data = op["kind"], entries[op["key"]]
        skeleton = {k: v for k, v in data.items() if not target(kind, k)}
        if kind == "media" and skeleton.get("source") == "file":
            raise ContentError(tr("errors.uploadBeforeMetadata"))
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
        current = localize(db, store.read(db, op["kind"], ident), op.get("language"))
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
            language=op.get("language"),
        )
    for op in operations:
        actual = localize(db, store.read(db, op["kind"], mapping[op["key"]]), op.get("language"))[
            "entry"
        ]
        expected = normalized_entries[op["key"]]
        for name in op["changes"]:
            if name == "slug" and not expected[name]:
                continue
            if actual[name] != expected[name]:
                raise ContentError(tr("errors.batchRelationships"))
    return [
        localize(db, store.read(db, op["kind"], mapping[op["key"]]), op.get("language"))
        for op in operations
    ]
