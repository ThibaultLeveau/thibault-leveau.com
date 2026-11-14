"""Prévisualisation par simulation transactionnelle des mêmes écritures que l'application."""

import sqlite3

from personal_site.content.batch import reference_ids, write_batch
from personal_site.content.catalog import PAIRS, target
from personal_site.content.schemas import MODELS
from personal_site.content.validation import ContentError


def preview(content, db, record, old, *, key, names, missing, related=False):
    changes = []
    for name in names:
        left = old["entry"][name] if old else None
        right = record["entry"][name]
        if left != right:
            changes.append(
                {
                    "field": name,
                    "label": MODELS[record["kind"]].model_fields[name].title,
                    "before": left,
                    "after": right,
                }
            )
    refs = content.reference_labels(db, record["kind"], record["entry"])
    if old:
        refs.update(content.reference_labels(db, old["kind"], old["entry"]))
    return {
        "key": key,
        "kind": record["kind"],
        "id": old["id"] if old else None,
        "title": record["entry"]["title"],
        "changes": changes,
        "status_before": old["status"] if old else None,
        "status_after": record["status"],
        "references": refs,
        "missing": missing,
        "errors": record["errors"],
        "related": related,
    }


def prepare(content, operations, versions, missing):
    versions = dict(versions)
    ops = [op.model_dump() for op in operations]
    try:
        with content.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            before, related = {}, {}
            explicit = {op["entry_id"] for op in ops}
            for op in ops:
                ident = op["entry_id"]
                old = None
                if ident is not None:
                    old = content.read(db, op["kind"], ident)
                    before[op["key"]] = old
                    versions.setdefault(str(ident), old["version"])
                references = list(reference_ids(op["kind"], op["changes"]))
                if old:
                    references.extend(reference_ids(op["kind"], old["entry"]))
                for ref in references:
                    if isinstance(ref, int):
                        row = db.execute(
                            "SELECT version FROM content_entries WHERE id=?", (ref,)
                        ).fetchone()
                        if row:
                            versions.setdefault(str(ref), row[0])
                for name in op["changes"]:
                    if (op["kind"], name) not in PAIRS and (name, op["kind"]) not in PAIRS:
                        continue
                    rows = op["changes"][name] + (old["entry"][name] if old else [])
                    for ref in rows:
                        if isinstance(ref["id"], int) and ref["id"] not in explicit:
                            related[ref["id"]] = content.read(
                                db, target(op["kind"], name), ref["id"]
                            )
            db.execute("SAVEPOINT proposal_preview")
            try:
                records = write_batch(content, db, ops, versions)
                previews = []
                for op, record in zip(ops, records, strict=True):
                    old = before.get(op["key"])
                    previews.append(
                        preview(
                            content,
                            db,
                            record,
                            old,
                            key=op["key"],
                            names=MODELS[op["kind"]].model_fields if old else op["changes"],
                            missing=missing.get(op["key"], []),
                        )
                    )
                for ident, old in related.items():
                    record = content.read(db, old["kind"], ident)
                    item = preview(
                        content,
                        db,
                        record,
                        old,
                        key=f"related_{ident}",
                        names=MODELS[old["kind"]].model_fields,
                        missing=[],
                        related=True,
                    )
                    if item["changes"]:
                        previews.append(item)
            finally:
                db.execute("ROLLBACK TO proposal_preview")
                db.execute("RELEASE proposal_preview")
        return {"operations": ops, "versions": versions, "preview": previews}
    except sqlite3.IntegrityError:
        raise ContentError(
            "Une fiche du même identifiant ou le profil unique existe déjà. Précisez la cible.",
            status=409,
        ) from None
