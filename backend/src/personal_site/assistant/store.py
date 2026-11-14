"""Persistance bornée ; aucune conversation ni clé fournisseur dans ces tables."""

import json
import secrets
import sqlite3
import time

from personal_site.assistant.contracts import Preferences
from personal_site.content.batch import write_batch
from personal_site.content.validation import ContentError

PROPOSAL_SECONDS = 3600
RECEIPT_SECONDS = 86400
MAX_PROPOSALS = 50


class AssistantStore:
    def __init__(self, content):
        self.content = content
        self.admin = content.admin

    def preferences(self):
        with self.admin.connect() as db:
            row = db.execute(
                "SELECT payload, version FROM assistant_preferences WHERE id = 1"
            ).fetchone()
            return (
                Preferences.model_validate({**json.loads(row[0]), "version": row[1]})
                if row
                else Preferences()
            )

    def save_preferences(self, preferences):
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT version FROM assistant_preferences WHERE id = 1").fetchone()
            version = row[0] if row else 1
            if version != preferences.version:
                raise ContentError(
                    "Ces réglages ont changé. Rechargez-les avant de réessayer.", status=409
                )
            value = preferences.model_copy(update={"version": version + 1})
            db.execute(
                "INSERT INTO assistant_preferences VALUES (1, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET version=excluded.version, payload=excluded.payload",
                (value.version, value.model_dump_json()),
            )
        return value

    def purge(self, db):
        db.execute("DELETE FROM assistant_proposals WHERE expires <= ?", (time.time(),))
        db.execute(
            "DELETE FROM assistant_proposals WHERE id IN (SELECT id FROM assistant_proposals "
            "ORDER BY created DESC LIMIT -1 OFFSET ?)",
            (MAX_PROPOSALS - 1,),
        )

    def require_session(self, db, owner):
        if not db.execute(
            "SELECT 1 FROM sessions WHERE token_hash=? AND expires>?", (owner, time.time())
        ).fetchone():
            raise ContentError("Votre session a expiré. Reconnectez-vous.", status=401)

    def latest(self, owner, thread_id):
        with self.admin.connect() as db:
            row = db.execute(
                "SELECT payload FROM assistant_proposals WHERE owner=? AND thread_id=? "
                "AND state IN ('pending','superseded') AND expires>? ORDER BY created DESC LIMIT 1",
                (owner, str(thread_id), time.time()),
            ).fetchone()
            return json.loads(row[0]) if row else None

    def supersede(self, owner, thread_id):
        with self.admin.connect() as db:
            db.execute(
                "UPDATE assistant_proposals SET state='superseded' WHERE owner=? AND thread_id=? "
                "AND state='pending'",
                (owner, str(thread_id)),
            )

    def create(self, owner, thread_id, payload):
        ident, timestamp = secrets.token_urlsafe(24), time.time()
        encoded = json.dumps(payload, ensure_ascii=False)
        if len(encoded.encode()) > 2 * 1024 * 1024:
            raise ContentError(
                "La proposition est trop volumineuse. Traitez moins de fiches à la fois."
            )
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.require_session(db, owner)
            self.purge(db)
            db.execute(
                "UPDATE assistant_proposals SET state='cancelled' WHERE owner=? AND thread_id=? "
                "AND state IN ('pending','superseded')",
                (owner, str(thread_id)),
            )
            db.execute(
                "INSERT INTO assistant_proposals "
                "(id,owner,thread_id,state,created,expires,payload) VALUES (?,?,?,'pending',?,?,?)",
                (ident, owner, str(thread_id), timestamp, timestamp + PROPOSAL_SECONDS, encoded),
            )
        return self.get(owner, ident)

    def _row(self, db, owner, ident):
        self.require_session(db, owner)
        row = db.execute(
            "SELECT * FROM assistant_proposals WHERE id=? AND owner=?", (ident, owner)
        ).fetchone()
        if not row:
            raise ContentError("Proposition introuvable.", status=404)
        if row["expires"] <= time.time():
            raise ContentError(
                "Cette proposition a expiré. Demandez une nouvelle version.", status=410
            )
        return row

    def _public(self, row):
        payload = json.loads(row["payload"])
        return {
            "id": row["id"],
            "revision": row["revision"],
            "state": row["state"],
            "expires": row["expires"],
            "items": payload["preview"],
            "result": json.loads(row["result"]) if row["result"] else None,
        }

    def get(self, owner, ident):
        with self.admin.connect() as db:
            return self._public(self._row(db, owner, ident))

    def cancel(self, owner, ident, revision):
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self._row(db, owner, ident)
            if row["revision"] != revision or row["state"] == "applied":
                raise ContentError("Cette proposition a déjà changé ou été appliquée.", status=409)
            db.execute("UPDATE assistant_proposals SET state='cancelled' WHERE id=?", (ident,))
        return self.get(owner, ident)

    def apply(self, owner, ident, revision):
        try:
            with self.admin.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                row = self._row(db, owner, ident)
                if row["revision"] != revision or row["state"] not in {"pending", "applied"}:
                    raise ContentError("Cette proposition n'est plus applicable.", status=409)
                if row["state"] == "applied":
                    return self._public(row)
                payload = json.loads(row["payload"])
                records = write_batch(self.content, db, payload["operations"], payload["versions"])
                records.extend(
                    self.content.read(db, item["kind"], item["id"])
                    for item in payload["preview"]
                    if item.get("related")
                )
                result = [
                    {
                        "id": r["id"],
                        "kind": r["kind"],
                        "title": r["entry"]["title"],
                        "version": r["version"],
                        "status": r["status"],
                    }
                    for r in records
                ]
                db.execute(
                    "UPDATE assistant_proposals SET state='applied', result=?, expires=? "
                    "WHERE id=?",
                    (json.dumps(result), time.time() + RECEIPT_SECONDS, ident),
                )
        except sqlite3.IntegrityError:
            raise ContentError(
                "Un identifiant ou le profil unique existe déjà. Précisez la demande.", status=409
            ) from None
        return self.get(owner, ident)
