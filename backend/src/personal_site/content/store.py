"""Transactions de fiches et de leurs relations. Les noms SQL viennent du registre fermé."""

import sqlite3
from datetime import UTC, date, datetime

from personal_site.content.catalog import (
    COMMON,
    list_fields,
    relation,
    scalar_fields,
    table,
    target,
)
from personal_site.content.migrate import migrate
from personal_site.content.schemas import MODELS
from personal_site.content.validation import (
    ContentError,
    completeness,
    date_bounds,
    issue,
    normalize,
    slugify,
    validate,
)


def now():
    return datetime.now(UTC).isoformat(timespec="microseconds")


def insert(db, name, values):
    columns = ", ".join(f'"{key}"' for key in values)
    return db.execute(
        f'INSERT INTO "{name}" ({columns}) VALUES ({", ".join("?" for _ in values)})',
        list(values.values()),
    )


class ContentStore:
    def __init__(self, admin):
        self.admin = admin
        migrate(admin)

    def require(self, db, kind, entry_id):
        if kind not in MODELS:
            raise ContentError("Collection inconnue.", status=404)
        row = db.execute(
            "SELECT * FROM content_entries WHERE id = ? AND kind = ?", (entry_id, kind)
        ).fetchone()
        if not row:
            raise ContentError("Fiche introuvable.", status=404)
        return dict(row)

    def read(self, db, kind, entry_id):
        row = self.require(db, kind, entry_id)
        detail = dict(
            db.execute(f'SELECT * FROM "{table(kind)}" WHERE id = ?', (entry_id,)).fetchone()
        )
        data = {name: row[name] for name in COMMON}
        data.update({name: detail[name] for name in scalar_fields(kind)})
        for name, child in list_fields(kind).items():
            if target(kind, name):
                tab, source, ref, position = relation(kind, name)
                items = db.execute(
                    f'SELECT * FROM "{tab}" WHERE "{source}" = ? ORDER BY "{position}", "{ref}"',
                    (entry_id,),
                ).fetchall()
                data[name] = [
                    {**{n: r[n] for n in child.model_fields if n != "id"}, "id": r[ref]}
                    for r in items
                ]
            else:
                items = db.execute(
                    f'SELECT * FROM "entry_{name}" WHERE entry_id = ? ORDER BY position',
                    (entry_id,),
                ).fetchall()
                data[name] = [{n: r[n] for n in child.model_fields} for r in items]
        # SQLite booleans are integers; the typed model normalizes the wire format.
        data = MODELS[kind].model_validate(data).model_dump()
        media_natures = {
            r["id"]: r["nature"] for r in db.execute("SELECT id, nature FROM media_assets")
        }
        file = (
            db.execute(
                "SELECT original_name, mime, size, sha256, width, height FROM "
                "media_files WHERE entry_id = ?",
                (entry_id,),
            ).fetchone()
            if kind == "media"
            else None
        )
        return {
            "id": entry_id,
            "kind": kind,
            "entry": data,
            "status": row["status"],
            "version": row["version"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "errors": completeness(kind, data, media_natures),
            "derived": {
                "expired": bool(
                    kind == "certifications"
                    and data.get("state") == "earned"
                    and data.get("expiry_date")
                    and date_bounds(data["expiry_date"])[1] < date.today()
                ),
            },
            "file": dict(file) if file else None,
        }

    def usages(self, db, entry_id):
        ids = set()
        for kind in MODELS:
            for name in scalar_fields(kind):
                if target(kind, name):
                    ids.update(
                        r[0]
                        for r in db.execute(
                            f'SELECT id FROM "{table(kind)}" WHERE "{name}" = ?', (entry_id,)
                        )
                    )
            for name in list_fields(kind):
                if target(kind, name):
                    tab, source, ref, _ = relation(kind, name)
                    ids.update(
                        r[0]
                        for r in db.execute(
                            f'SELECT "{source}" FROM "{tab}" WHERE "{ref}" = ?', (entry_id,)
                        )
                    )
        return [
            dict(
                db.execute(
                    "SELECT id, kind, title, status, visibility FROM content_entries WHERE id = ?",
                    (i,),
                ).fetchone()
            )
            for i in sorted(ids)
            if i != entry_id
        ]

    def get(self, kind, entry_id):
        with self.admin.connect() as db:
            db.execute("BEGIN")
            result = self.read(db, kind, entry_id)
            result["usages"] = self.usages(db, entry_id)
            result["references"] = self.reference_labels(db, kind, result["entry"])
            return result

    def reference_labels(self, db, kind, data):
        ids = set()
        for name in MODELS[kind].model_fields:
            if target(kind, name):
                value = data[name]
                ids.update(r["id"] for r in value) if isinstance(value, list) else ids.update(
                    [value] if value else []
                )
        return {
            i: dict(
                db.execute(
                    "SELECT id, kind, title, status, visibility FROM content_entries WHERE id = ?",
                    (i,),
                ).fetchone()
            )
            for i in ids
        }

    def listing(
        self,
        kind,
        *,
        query="",
        status="",
        sort="updated",
        page=1,
        limit=30,
        nature="",
        related=None,
    ):
        table(kind)  # Closed registry check, including empty collections.
        where, args = ["kind = ?"], [kind]
        if query:
            # instr avoids wildcard semantics; search text is accent/case normalized on write.
            where.append("instr(search_text, ?) > 0")
            args.append(normalize(query))
        if status:
            where.append("status = ?")
            args.append(status)
        else:
            where.append("status != 'archived'")
        if nature and "nature" in scalar_fields(kind):
            where.append(f'id IN (SELECT id FROM "{table(kind)}" WHERE nature = ?)')
            args.append(nature)
        order = {
            "updated": "updated_at DESC, id DESC",
            "title": "title COLLATE NOCASE, id",
            "order": "sort_order, title, id",
            "chronology": "updated_at DESC, id DESC",
        }[sort]
        dated = next(
            (
                name
                for name in (
                    "start_date",
                    "issue_date",
                    "event_date",
                    "award_date",
                    "publication_date",
                    "first_used",
                )
                if name in scalar_fields(kind)
            ),
            None,
        )
        if sort == "chronology" and dated:
            order = (
                f'(SELECT "{dated}" FROM "{table(kind)}" '
                f'WHERE "{table(kind)}".id = content_entries.id) DESC, id DESC'
            )
        with self.admin.connect() as db:
            if related:
                used = [r["id"] for r in self.usages(db, related)]
                where.append("id IN (" + ",".join("?" for _ in used) + ")" if used else "0")
                args.extend(used)
            condition = " AND ".join(where)
            total = db.execute(
                f"SELECT count(*) FROM content_entries WHERE {condition}", args
            ).fetchone()[0]
            items = [
                dict(r)
                for r in db.execute(
                    "SELECT id, kind, title, slug, summary, language, status, version, "
                    "updated_at, visibility "
                    f"FROM content_entries WHERE {condition} ORDER BY {order} LIMIT ? OFFSET ?",
                    [*args, limit, (page - 1) * limit],
                )
            ]
            return {"items": items, "total": total, "page": page, "limit": limit}

    def check_relations(self, db, kind, data):
        errors = []
        for name in MODELS[kind].model_fields:
            dest = target(kind, name)
            if not dest:
                continue
            value = data[name]
            ids = (
                [r["id"] for r in value] if isinstance(value, list) else ([value] if value else [])
            )
            for index, ident in enumerate(ids):
                row = db.execute(
                    "SELECT kind FROM content_entries WHERE id = ?", (ident,)
                ).fetchone()
                path = f"{name}.{index}.id" if isinstance(value, list) else name
                if not row or row[0] != dest:
                    errors.append(
                        issue(path, "Choisissez une fiche existante du bon type.", "reference")
                    )
                    continue
                if dest == "media":
                    nature = db.execute(
                        "SELECT nature FROM media_assets WHERE id = ?", (ident,)
                    ).fetchone()[0]
                    role = value[index]["role"]
                    if (role in {"cover", "gallery", "share"} and nature != "image") or (
                        role == "video" and nature != "video"
                    ):
                        errors.append(
                            issue(
                                f"{name}.{index}.role",
                                "Choisissez un usage adapté au type de média.",
                                "media_role",
                            )
                        )
                if dest == "taxonomies":
                    scope = db.execute(
                        "SELECT scope FROM taxonomies WHERE id = ?", (ident,)
                    ).fetchone()[0]
                    allowed = {"tag"}
                    if name == "domain_id":
                        allowed = {"skill_domain"}
                    elif kind == "projects":
                        allowed.add("project_category")
                    elif kind == "posts":
                        allowed.add("post_category")
                    if scope not in allowed:
                        errors.append(
                            issue(
                                path,
                                "La portée de cette catégorie ne correspond pas à ce champ.",
                                "scope",
                            )
                        )
        if errors:
            raise ContentError("Vérifiez les associations.", errors=errors)

    def write(self, db, kind, data, *, entry_id=None, version=None, as_draft=False, uploaded=False):
        if kind == "media" and data["source"] == "file" and not uploaded:
            previous = self.read(db, kind, entry_id)["entry"] if entry_id else None
            if not previous or previous["source"] != "file" or previous["nature"] != data["nature"]:
                raise ContentError("Utilisez le téléversement pour ajouter un fichier.")
        if kind == "media" and entry_id:
            previous = self.read(db, kind, entry_id)["entry"]
            if previous["source"] != data["source"]:
                raise ContentError("La source d'un média existant ne peut pas changer.")
        self.check_relations(db, kind, data)
        if kind == "taxonomies" and entry_id:
            previous_scope = db.execute(
                "SELECT scope FROM taxonomies WHERE id = ?", (entry_id,)
            ).fetchone()
            if previous_scope and previous_scope[0] != data["scope"] and self.usages(db, entry_id):
                raise ContentError(
                    "Retirez les usages de cette catégorie avant de changer sa portée.", status=409
                )
        if (
            kind == "media"
            and entry_id
            and previous["nature"] != data["nature"]
            and self.usages(db, entry_id)
        ):
            raise ContentError(
                "Retirez les usages de ce média avant de changer sa nature.", status=409
            )
        old = self.require(db, kind, entry_id) if entry_id else None
        if old and old["version"] != version:
            raise ContentError(
                "Cette fiche a changé dans un autre onglet. Votre saisie est conservée "
                "; rechargez la version enregistrée avant de réessayer.",
                status=409,
            )
        if old and old["status"] == "archived":
            raise ContentError("Restaurez cette fiche avant de la modifier.", status=409)
        data["slug"] = data["slug"] or slugify(data["title"])
        status = "draft" if as_draft or not old else old["status"]
        if status == "ready":
            natures = {
                r["id"]: r["nature"] for r in db.execute("SELECT id, nature FROM media_assets")
            }
            errors = completeness(kind, data, natures)
            if errors:
                raise ContentError(
                    "La fiche n'est plus complète. Corrigez-la ou enregistrez en brouillon.",
                    errors=errors,
                )
        timestamp = now()
        common = {n: data[n] for n in COMMON}
        common.update(
            updated_at=timestamp,
            status=status,
            search_text=normalize(data["title"] + " " + data["summary"]),
        )
        if old:
            common["version"] = old["version"] + 1
            db.execute(
                "UPDATE content_entries SET "
                + ", ".join(f'"{n}" = ?' for n in common)
                + " WHERE id = ?",
                [*common.values(), entry_id],
            )
            details = {n: data[n] for n in scalar_fields(kind)}
            if details:
                db.execute(
                    f'UPDATE "{table(kind)}" SET '
                    + ", ".join(f'"{n}" = ?' for n in details)
                    + " WHERE id = ?",
                    [*details.values(), entry_id],
                )
        else:
            entry_id = insert(
                db, "content_entries", {**common, "kind": kind, "created_at": timestamp}
            ).lastrowid
            insert(db, table(kind), {"id": entry_id, **{n: data[n] for n in scalar_fields(kind)}})
        for name in list_fields(kind):
            if target(kind, name):
                tab, source, ref, pos = relation(kind, name)
                previous = {
                    r[ref]: dict(r)
                    for r in db.execute(f'SELECT * FROM "{tab}" WHERE "{source}" = ?', (entry_id,))
                }
                following = {r["id"] for r in data[name]}
                changed = set(previous) ^ following
                for index, row in enumerate(data[name]):
                    values = {n: v for n, v in row.items() if n != "id"}
                    old_ref = previous.get(row["id"])
                    if old_ref and (
                        any(old_ref[n] != v for n, v in values.items()) or old_ref[pos] != index
                    ):
                        changed.add(row["id"])
                db.execute(f'DELETE FROM "{tab}" WHERE "{source}" = ?', (entry_id,))
                for index, row in enumerate(data[name]):
                    other_pos = "position_b" if pos == "position_a" else "position_a"
                    insert(
                        db,
                        tab,
                        {
                            source: entry_id,
                            ref: row["id"],
                            pos: index,
                            other_pos: previous.get(row["id"], {}).get(other_pos, 0),
                            **{n: v for n, v in row.items() if n != "id"},
                        },
                    )
                # Reciprocal editors must detect stale associations as well as stale text.
                if tab in {"project_services", "project_testimonials", "service_testimonials"}:
                    for ident in changed:
                        db.execute(
                            "UPDATE content_entries SET version = version + 1, updated_at = ? "
                            "WHERE id = ?",
                            (timestamp, ident),
                        )
            else:
                db.execute(f'DELETE FROM "entry_{name}" WHERE entry_id = ?', (entry_id,))
                for index, row in enumerate(data[name]):
                    insert(db, f"entry_{name}", {"entry_id": entry_id, "position": index, **row})
        return entry_id

    def save(self, kind, payload, *, entry_id=None, version=None, as_draft=False):
        data = validate(kind, payload)
        try:
            with self.admin.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                entry_id = self.write(
                    db, kind, data, entry_id=entry_id, version=version, as_draft=as_draft
                )
        except sqlite3.IntegrityError:
            raise ContentError(
                "Cet identifiant existe déjà pour ce type et cette langue, ou le "
                "profil unique existe déjà.",
                status=409,
                errors=[issue("slug", "Choisissez un identifiant disponible.", "unique")],
            ) from None
        return self.get(kind, entry_id)

    def transition(self, kind, entry_id, version, status):
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            result = self.read(db, kind, entry_id)
            if version != result["version"]:
                raise ContentError(
                    "La fiche a changé. Rechargez sa version enregistrée.", status=409
                )
            if result["status"] == "archived" and status != "draft":
                raise ContentError("Une fiche archivée se restaure en brouillon.", status=409)
            if status == "ready" and result["errors"]:
                raise ContentError(
                    "Complétez la fiche avant de la marquer prête.", errors=result["errors"]
                )
            db.execute(
                "UPDATE content_entries SET status = ?, version = version + 1, "
                "updated_at = ? WHERE id = ?",
                (status, now(), entry_id),
            )
        return self.get(kind, entry_id)

    def delete(self, kind, entry_id, version):
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = self.require(db, kind, entry_id)
            if old["version"] != version or old["status"] != "archived":
                raise ContentError(
                    "Archivez la fiche et utilisez sa version actuelle avant de la supprimer.",
                    status=409,
                )
            usages = self.usages(db, entry_id)
            if usages:
                raise ContentError(
                    "Cette fiche est encore utilisée. Retirez ses associations avant suppression.",
                    status=409,
                    usages=usages,
                )
            file = db.execute(
                "SELECT storage_name FROM media_files WHERE entry_id = ?", (entry_id,)
            ).fetchone()
            db.execute("DELETE FROM content_entries WHERE id = ?", (entry_id,))
        return file[0] if file else None

    def duplicate(self, kind, entry_id, version):
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            saved = self.read(db, kind, entry_id)
            if saved["version"] != version:
                raise ContentError("La fiche a changé. Rechargez-la avant duplication.", status=409)
            if kind in {"media", "profiles"}:
                raise ContentError("Cette collection ne se duplique pas.")
            data = saved["entry"]
            data["title"] = data["title"][:150] + " — copie"
            base = slugify(data["slug"] + "-copie")
            suffix = 1
            while db.execute(
                "SELECT 1 FROM content_entries WHERE kind = ? AND language = ? AND slug = ?",
                (kind, data["language"], f"{base}-{suffix}"),
            ).fetchone():
                suffix += 1
            data["slug"] = f"{base}-{suffix}"
            ident = self.write(db, kind, data)
        return self.get(kind, ident)
