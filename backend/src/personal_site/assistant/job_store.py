"""Durable, paginated technical work; business writes remain explicit and transactional."""

import hashlib
import json
import secrets
import sqlite3
import time

from personal_site.assistant.contracts import Preferences
from personal_site.assistant.registry import output_model
from personal_site.content.batch import write_batch
from personal_site.content.schemas import MODELS
from personal_site.content.validation import ContentError
from personal_site.i18n import current_language, tr

ACTIVE = {"queued", "running"}
TERMINAL = {"completed", "cancelled"}


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def provider_stamp(config):
    """An internal fingerprint detects key rotation without retaining the key itself."""
    return hashlib.sha256(
        encoded([config["provider"], config["model"], config.get("api_key", "")]).encode()
    ).hexdigest()


class JobStore:
    def __init__(self, assistant_store):
        self.proposals = assistant_store
        self.content = assistant_store.content
        self.admin = assistant_store.admin

    def recover(self):
        # Startup never performs billable calls. Explicit resume binds the new session.
        with self.admin.connect() as db:
            db.execute(
                "UPDATE assistant_jobs SET status='paused',error_key='jobs.interrupted',updated=? "
                "WHERE status IN ('queued','running')",
                (time.time(),),
            )
            db.execute("UPDATE assistant_job_sections SET state='queued' WHERE state='running'")

    def _row(self, db, ident):
        row = db.execute("SELECT * FROM assistant_jobs WHERE id=?", (ident,)).fetchone()
        if not row:
            raise ContentError(tr("jobs.missing"), status=404)
        return row

    def raw(self, ident):
        with self.admin.connect() as db:
            return dict(self._row(db, ident))

    def _public(self, db, row):
        counts = dict(
            db.execute(
                "SELECT state,count(*) FROM assistant_job_tasks WHERE job_id=? GROUP BY state",
                (row["id"],),
            ).fetchall()
        )
        return {
            "id": row["id"],
            "status": row["status"],
            "language": row["language"],
            "message": row["message"],
            "created": row["created"],
            "updated": row["updated"],
            "planned": sum(counts.values()),
            "prepared": counts.get("prepared", 0) + counts.get("applied", 0),
            "applied": counts.get("applied", 0),
            "pending_batches": db.execute(
                "SELECT count(*) FROM assistant_job_batches WHERE job_id=? AND state='pending'",
                (row["id"],),
            ).fetchone()[0],
            "total_tasks": row["total_tasks"],
            "calls": row["calls"],
            "delegations": row["delegations"],
            "questions": json.loads(row["questions"]),
            "error": tr(row["error_key"]) if row["error_key"] else None,
            "provider": row["provider"],
            "model": row["model"],
            "include_private_notes": bool(row["include_private"]),
        }

    def get(self, owner, ident):
        with self.admin.connect() as db:
            self.proposals.require_session(db, owner)
            return self._public(db, self._row(db, ident))

    def find(self, owner, request_id):
        with self.admin.connect() as db:
            self.proposals.require_session(db, owner)
            row = db.execute(
                "SELECT * FROM assistant_jobs WHERE request_id=?", (str(request_id),)
            ).fetchone()
            return self._public(db, row) if row else None

    def listing(self, owner, page, limit):
        with self.admin.connect() as db:
            self.proposals.require_session(db, owner)
            rows = db.execute(
                "SELECT * FROM assistant_jobs ORDER BY created DESC,id LIMIT ? OFFSET ?",
                (limit, (page - 1) * limit),
            ).fetchall()
            return {
                "items": [self._public(db, row) for row in rows],
                "page": page,
                "limit": limit,
                "total": db.execute("SELECT count(*) FROM assistant_jobs").fetchone()[0],
            }

    def create(self, turn, owner, config, plan=None, calls=0):
        ident, timestamp = secrets.token_urlsafe(24), time.time()
        preferences = self.proposals.preferences()
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.proposals.require_session(db, owner)
            previous = db.execute(
                "SELECT * FROM assistant_jobs WHERE request_id=?", (str(turn.request_id),)
            ).fetchone()
            if previous:
                return self._public(db, previous)
            db.execute(
                "INSERT INTO assistant_jobs "
                "(id,request_id,thread_id,owner,status,language,interface_language,include_private,"
                "media_ids,provider,model,provider_stamp,preferences,created,updated,calls) "
                "VALUES (?,?,?,?,'queued',?,?,?,?,?,?,?,?,?,?,?)",
                (
                    ident,
                    str(turn.request_id),
                    str(turn.thread_id),
                    owner,
                    turn.language,
                    current_language.get(),
                    int(turn.include_private_notes),
                    encoded(turn.media_ids),
                    config["provider"],
                    config["model"],
                    provider_stamp(config),
                    preferences.model_dump_json(),
                    timestamp,
                    timestamp,
                    calls,
                ),
            )
            # User-supplied brief/facts only; assistant messages and reasoning are not retained.
            for index, message in enumerate(m for m in turn.messages if m.role == "user"):
                db.execute(
                    "INSERT INTO assistant_job_inputs (job_id,sequence,message,created) "
                    "VALUES (?,?,?,?)",
                    (ident, index + 1, message.content, timestamp),
                )
            if plan:
                self._save_plan(db, ident, plan)
            return self._public(db, self._row(db, ident))

    def _save_plan(self, db, ident, plan):
        job = self._row(db, ident)
        if plan.questions:
            db.execute(
                "UPDATE assistant_jobs SET status='needs_input',message=?,questions=?,updated=? "
                "WHERE id=?",
                (
                    plan.message,
                    encoded([q.model_dump() for q in plan.questions]),
                    time.time(),
                    ident,
                ),
            )
            return
        keys = [task.key for task in plan.tasks]
        if len(set(keys)) != len(keys):
            raise ContentError(tr("errors.planTaskDuplicate"))
        if plan.has_more and (not plan.tasks or not plan.continuation.strip()):
            raise ContentError(tr("jobs.planStalled"))
        count = db.execute(
            "SELECT count(*) FROM assistant_job_tasks WHERE job_id=?", (ident,)
        ).fetchone()[0]
        expected = plan.total_tasks or job["total_tasks"]
        incomplete = bool(expected and count + len(plan.tasks) < expected)
        if incomplete and not plan.tasks:
            raise ContentError(tr("jobs.planStalled"))
        for index, task in enumerate(plan.tasks):
            output_model(task.kind, task.fields, bool(job["include_private"]))
            if task.kind == "profiles" and task.entry_id is None:
                if db.execute("SELECT 1 FROM content_entries WHERE kind='profiles'").fetchone():
                    raise ContentError(tr("assistant.profileExists"))
                if db.execute(
                    "SELECT 1 FROM assistant_job_tasks WHERE job_id=? AND kind='profiles'",
                    (ident,),
                ).fetchone():
                    raise ContentError(tr("errors.planEntryDuplicate"))
            if db.execute(
                "SELECT 1 FROM assistant_job_tasks WHERE job_id=? AND "
                "(key=? OR (entry_id IS NOT NULL AND entry_id=?))",
                (ident, task.key, task.entry_id),
            ).fetchone():
                raise ContentError(tr("errors.planTaskDuplicate"))
            db.execute(
                "INSERT INTO assistant_job_tasks "
                "(job_id,key,ordinal,plan_page,kind,entry_id,task,state) "
                "VALUES (?,?,?,?,?,?,?,'queued')",
                (
                    ident,
                    task.key,
                    count + index + 1,
                    job["plan_page"] + 1,
                    task.kind,
                    task.entry_id,
                    task.model_dump_json(),
                ),
            )
            sections = {}
            for name in task.fields:
                section = (MODELS[task.kind].model_fields[name].json_schema_extra or {}).get(
                    "section", "essential"
                )
                sections.setdefault(section if len(task.fields) > 8 else "fiche", []).append(name)
            for section, fields in sections.items():
                db.execute(
                    "INSERT INTO assistant_job_sections "
                    "(job_id,task_key,section,fields,state) VALUES (?,?,?,?,'queued')",
                    (ident, task.key, section, encoded(fields)),
                )
        db.execute(
            "UPDATE assistant_jobs SET message=?,questions='[]',continuation=?,plan_done=?,"
            "plan_page=plan_page+1,total_tasks=coalesce(?,total_tasks),updated=? WHERE id=?",
            (
                plan.message,
                plan.continuation
                or (f"{count + len(plan.tasks)} / {expected}" if incomplete else ""),
                int(not (plan.has_more or incomplete)),
                plan.total_tasks,
                time.time(),
                ident,
            ),
        )

    def save_plan(self, ident, plan):
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self._assert_running(db, ident)
            self._save_plan(db, ident, plan)

    def _assert_running(self, db, ident):
        row = self._row(db, ident)
        if row["status"] not in ACTIVE:
            raise ContentError(tr("jobs.notRunning"), status=409)
        self.proposals.require_session(db, row["owner"])
        return row

    def guard(self, ident, *, count=False):
        config = self.admin.provider(decrypt=True)
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self._assert_running(db, ident)
            if provider_stamp(config) != row["provider_stamp"]:
                raise ContentError(tr("jobs.providerChanged"), status=409)
            if count:
                db.execute(
                    "UPDATE assistant_jobs SET calls=calls+1,updated=? WHERE id=?",
                    (time.time(), ident),
                )
        return config

    def transition(self, ident, status, error_key=None, questions=None):
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            changed = db.execute(
                "UPDATE assistant_jobs SET status=?,error_key=?,questions=?,updated=? "
                "WHERE id=? AND status IN ('queued','running')",
                (status, error_key, encoded(questions or []), time.time(), ident),
            ).rowcount
            if changed and status not in ACTIVE:
                db.execute(
                    "UPDATE assistant_job_sections SET state='queued' "
                    "WHERE job_id=? AND state='running'",
                    (ident,),
                )

    def continue_links(self, owner, ident):
        config = self.admin.provider(decrypt=True)
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.proposals.require_session(db, owner)
            row = self._row(db, ident)
            if row["status"] != "review" or provider_stamp(config) != row["provider_stamp"]:
                return False
            db.execute(
                "UPDATE assistant_jobs SET owner=?,status='queued',updated=? WHERE id=?",
                (owner, time.time(), ident),
            )
            return True

    def change(self, owner, ident, action):
        config = self.admin.provider(decrypt=True) if action == "resume" else None
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.proposals.require_session(db, owner)
            row = self._row(db, ident)
            if row["status"] in TERMINAL:
                if action == "cancel" and row["status"] == "cancelled":
                    return self._public(db, row)
                raise ContentError(tr("jobs.finished"), status=409)
            if action == "resume":
                if provider_stamp(config) != row["provider_stamp"]:
                    raise ContentError(tr("jobs.providerChanged"), status=409)
                state, error = "queued", None
                db.execute(
                    "UPDATE assistant_job_sections SET state='queued' "
                    "WHERE job_id=? AND state='running'",
                    (ident,),
                )
            else:
                state, error = ("paused", None) if action == "pause" else ("cancelled", None)
                if action == "cancel":
                    db.execute(
                        "UPDATE assistant_job_batches SET state='cancelled' "
                        "WHERE job_id=? AND state='pending'",
                        (ident,),
                    )
            db.execute(
                "UPDATE assistant_jobs SET owner=?,status=?,error_key=?,updated=? WHERE id=?",
                (owner, state, error, time.time(), ident),
            )
            return self._public(db, self._row(db, ident))

    def add_input(self, owner, ident, message, request_id=None):
        config = self.admin.provider(decrypt=True)
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.proposals.require_session(db, owner)
            row = self._row(db, ident)
            if (
                request_id
                and db.execute(
                    "SELECT 1 FROM assistant_job_inputs WHERE job_id=? AND request_id=?",
                    (ident, str(request_id)),
                ).fetchone()
            ):
                return self._public(db, row)
            if row["status"] == "cancelled":
                raise ContentError(tr("jobs.finished"), status=409)
            if row["status"] in ACTIVE:
                raise ContentError(tr("jobs.pauseFirst"), status=409)
            if provider_stamp(config) != row["provider_stamp"]:
                raise ContentError(tr("jobs.providerChanged"), status=409)
            sequence = db.execute(
                "SELECT coalesce(max(sequence),0)+1 FROM assistant_job_inputs WHERE job_id=?",
                (ident,),
            ).fetchone()[0]
            db.execute(
                "INSERT INTO assistant_job_inputs VALUES (?,?,?,?,?)",
                (ident, sequence, message, time.time(), str(request_id) if request_id else None),
            )
            # A clarification retries blocked sections only. A requested correction to review
            # invalidates unapplied results, never receipts or already recorded content.
            if row["status"] in {"review", "completed", "paused", "failed"}:
                db.execute(
                    "UPDATE assistant_job_batches SET state='cancelled' "
                    "WHERE job_id=? AND state='pending'",
                    (ident,),
                )
                db.execute(
                    "UPDATE assistant_job_sections SET state='queued',result=NULL,versions='{}' "
                    "WHERE job_id=? AND task_key IN (SELECT key FROM assistant_job_tasks "
                    "WHERE job_id=? AND state!='applied')",
                    (ident, ident),
                )
                db.execute(
                    "DELETE FROM assistant_job_dependencies WHERE job_id=? AND task_key IN "
                    "(SELECT key FROM assistant_job_tasks WHERE job_id=? AND state!='applied')",
                    (ident, ident),
                )
                db.execute(
                    "UPDATE assistant_job_tasks SET state='queued',operation=NULL,versions='{}' "
                    "WHERE job_id=? AND state!='applied'",
                    (ident,),
                )
                db.execute(
                    "UPDATE assistant_job_dependencies SET state='waiting' "
                    "WHERE job_id=? AND state='prepared'",
                    (ident,),
                )
                if row["status"] == "completed":
                    db.execute("UPDATE assistant_jobs SET plan_done=0 WHERE id=?", (ident,))
            db.execute(
                "UPDATE assistant_job_sections SET state='queued',result=NULL "
                "WHERE job_id=? AND state='needs_input'",
                (ident,),
            )
            if row["error_key"] == "jobs.validationFailed":
                db.execute(
                    "UPDATE assistant_job_sections SET state='queued',result=NULL,versions='{}' "
                    "WHERE job_id=? AND task_key IN (SELECT key FROM assistant_job_tasks "
                    "WHERE job_id=? AND state IN ('queued','generated'))",
                    (ident, ident),
                )
                db.execute(
                    "UPDATE assistant_job_tasks SET state='queued',operation=NULL,versions='{}' "
                    "WHERE job_id=? AND state='generated'",
                    (ident,),
                )
            if row["error_key"] == "jobs.missingDependency":
                db.execute("UPDATE assistant_jobs SET plan_done=0 WHERE id=?", (ident,))
            # A correction concerning already created entries only regenerates their
            # outstanding relationship fields, against current data and the new input.
            # Their creation receipts and original specialist results remain untouched.
            if row["status"] in {"review", "paused", "failed"} or row["error_key"] in {
                "jobs.validationFailed",
                "jobs.missingDependency",
            }:
                link_tasks = db.execute(
                    "SELECT DISTINCT t.key FROM assistant_job_tasks t "
                    "JOIN assistant_job_dependencies d ON d.job_id=t.job_id AND d.task_key=t.key "
                    "WHERE t.job_id=? AND t.state='applied' AND d.state!='applied'",
                    (ident,),
                )
                # The cursor streams task keys instead of loading an unbounded graph.
                for task in link_tasks:
                    fields = [
                        field[0]
                        for field in db.execute(
                            "SELECT DISTINCT field FROM assistant_job_dependencies "
                            "WHERE job_id=? AND task_key=? AND state!='applied'",
                            (ident, task[0]),
                        )
                    ]
                    db.execute(
                        "INSERT INTO assistant_job_sections "
                        "(job_id,task_key,section,fields,phase,state) "
                        "VALUES (?,?,'__links__',?,'links','queued') "
                        "ON CONFLICT(job_id,task_key,section) DO UPDATE SET "
                        "fields=excluded.fields,state='queued',result=NULL,versions='{}'",
                        (ident, task[0], encoded(fields)),
                    )
            db.execute(
                "UPDATE assistant_jobs SET owner=?,status='queued',questions='[]',"
                "error_key=NULL,updated=? WHERE id=?",
                (owner, time.time(), ident),
            )
            return self._public(db, self._row(db, ident))

    def delete(self, owner, ident):
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.proposals.require_session(db, owner)
            self._row(db, ident)
            db.execute("DELETE FROM assistant_jobs WHERE id=?", (ident,))
        return {"deleted": True}

    def facts(self, ident, page=1, limit=4):
        with self.admin.connect() as db:
            rows = db.execute(
                "SELECT sequence,message FROM assistant_job_inputs WHERE job_id=? "
                "ORDER BY sequence LIMIT ? OFFSET ?",
                (ident, limit, (page - 1) * limit),
            ).fetchall()
            total = db.execute(
                "SELECT count(*) FROM assistant_job_inputs WHERE job_id=?", (ident,)
            ).fetchone()[0]
            return {"items": [dict(row) for row in rows], "page": page, "total": total}

    def task_page(self, ident, query="", page=1):
        with self.admin.connect() as db:
            pattern = (
                "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            )
            where = "job_id=? AND (key LIKE ? ESCAPE '\\' OR task LIKE ? ESCAPE '\\')"
            args = (ident, pattern, pattern)
            rows = db.execute(
                "SELECT key,kind,entry_id,task,state,result_id FROM assistant_job_tasks WHERE "
                + where
                + " ORDER BY ordinal LIMIT 8 OFFSET ?",
                (*args, (page - 1) * 8),
            ).fetchall()
            return {
                "items": [{**dict(row), "task": json.loads(row["task"])} for row in rows],
                "page": page,
                "total": db.execute(
                    "SELECT count(*) FROM assistant_job_tasks WHERE " + where, args
                ).fetchone()[0],
            }

    def common(self, ident):
        with self.admin.connect() as db:
            row = self._row(db, ident)
            first = db.execute(
                "SELECT message FROM assistant_job_inputs WHERE job_id=? ORDER BY sequence LIMIT 1",
                (ident,),
            ).fetchone()[0]
            latest = db.execute(
                "SELECT sequence,message FROM assistant_job_inputs WHERE job_id=? "
                "ORDER BY sequence DESC LIMIT 1",
                (ident,),
            ).fetchone()
            planned = db.execute(
                "SELECT count(*) FROM assistant_job_tasks WHERE job_id=?", (ident,)
            ).fetchone()[0]
            return {
                "messages": [{"role": "user", "content": first}],
                "latest_input": dict(latest),
                "content_language": row["language"],
                "private_notes_enabled": bool(row["include_private"]),
                "job": {
                    "id": ident,
                    "continuation": row["continuation"],
                    "planned": planned,
                    "input_count": latest["sequence"],
                },
            }

    def preferences(self, ident):
        return Preferences.model_validate_json(self.raw(ident)["preferences"])

    def batches(self, owner, ident, page, limit):
        with self.admin.connect() as db:
            self.proposals.require_session(db, owner)
            self._row(db, ident)
            rows = db.execute(
                "SELECT * FROM assistant_job_batches WHERE job_id=? ORDER BY sequence "
                "LIMIT ? OFFSET ?",
                (ident, limit, (page - 1) * limit),
            ).fetchall()
            return {
                "items": [
                    {"sequence": row["sequence"], "proposal": self._proposal_public(row)}
                    for row in rows
                ],
                "page": page,
                "limit": limit,
                "total": db.execute(
                    "SELECT count(*) FROM assistant_job_batches WHERE job_id=?", (ident,)
                ).fetchone()[0],
            }

    def _batch_row(self, db, owner, ident):
        self.proposals.require_session(db, owner)
        row = db.execute("SELECT * FROM assistant_job_batches WHERE id=?", (ident,)).fetchone()
        if not row:
            raise ContentError(tr("errors.proposalMissing"), status=404)
        return row

    def _proposal_public(self, row):
        return self.proposals._public({**dict(row), "expires": None})

    def proposal(self, owner, ident):
        with self.admin.connect() as db:
            return self._proposal_public(self._batch_row(db, owner, ident))

    def finish_if_ready(self, db, ident):
        job = self._row(db, ident)
        if job["status"] in {"paused", "failed", "cancelled", "needs_input"}:
            return
        remaining = db.execute(
            "SELECT 1 FROM assistant_job_tasks WHERE job_id=? AND state!='applied' LIMIT 1",
            (ident,),
        ).fetchone()
        dependencies = db.execute(
            "SELECT 1 FROM assistant_job_dependencies WHERE job_id=? AND state!='applied' LIMIT 1",
            (ident,),
        ).fetchone()
        if job["plan_done"] and not remaining and not dependencies:
            planned = db.execute(
                "SELECT count(*) FROM assistant_job_tasks WHERE job_id=?", (ident,)
            ).fetchone()[0]
            if job["total_tasks"] and planned < job["total_tasks"]:
                return
            db.execute(
                "UPDATE assistant_jobs SET status='completed',updated=? WHERE id=?",
                (time.time(), ident),
            )

    def apply(self, owner, ident, revision):
        try:
            with self.admin.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                row = self._batch_row(db, owner, ident)
                if row["revision"] != revision or row["state"] not in {"pending", "applied"}:
                    raise ContentError(tr("errors.proposalInapplicable"), status=409)
                if row["state"] == "applied":
                    return self._proposal_public(row)
                job = self._row(db, row["job_id"])
                if job["status"] == "cancelled":
                    raise ContentError(tr("errors.proposalInapplicable"), status=409)
                payload = json.loads(row["payload"])
                touched = {
                    operation["entry_id"]
                    for operation in payload["operations"]
                    if operation["entry_id"] is not None
                } | {item["id"] for item in payload["preview"] if item.get("related")}
                before_versions = {}
                for key in touched:
                    current = db.execute(
                        "SELECT version FROM content_entries WHERE id=?", (key,)
                    ).fetchone()
                    if not current:
                        raise ContentError(tr("errors.batchConflict"), status=409)
                    before_versions[key] = current[0]
                records = write_batch(self.content, db, payload["operations"], payload["versions"])
                for operation, record in zip(payload["operations"], records, strict=True):
                    if row["phase"] == "content":
                        db.execute(
                            "UPDATE assistant_job_tasks SET state='applied',result_id=?,"
                            "result_version=? WHERE job_id=? AND key=?",
                            (record["id"], record["version"], row["job_id"], operation["key"]),
                        )
                    else:
                        for field in operation["changes"]:
                            db.execute(
                                "UPDATE assistant_job_dependencies SET state='applied' "
                                "WHERE job_id=? AND task_key=? AND field=?",
                                (row["job_id"], operation["key"], field),
                            )
                records.extend(
                    self.content.read(db, item["kind"], item["id"])
                    for item in payload["preview"]
                    if item.get("related")
                )
                for record in records:
                    db.execute(
                        "UPDATE assistant_job_tasks SET result_version=? "
                        "WHERE job_id=? AND result_id=?",
                        (record["version"], row["job_id"], record["id"]),
                    )
                    if record["id"] in before_versions:
                        # Propagate only versions changed by this very reviewed transaction.
                        # A stale expectation from an external edit remains stale and conflicts.
                        path = f'$."{record["id"]}"'
                        db.execute(
                            "UPDATE assistant_job_dependencies SET versions=json_set(versions,?,?) "
                            "WHERE job_id=? AND state!='applied' AND json_extract(versions,?)=?",
                            (
                                path,
                                record["version"],
                                row["job_id"],
                                path,
                                before_versions[record["id"]],
                            ),
                        )
                result = [
                    {
                        "id": record["id"],
                        "language": record["entry"]["language"],
                        "kind": record["kind"],
                        "title": record["entry"]["title"],
                        "version": record["version"],
                        "status": record["status"],
                    }
                    for record in records
                ]
                db.execute(
                    "UPDATE assistant_job_batches SET state='applied',result=? WHERE id=?",
                    (encoded(result), ident),
                )
                db.execute(
                    "UPDATE assistant_jobs SET updated=? WHERE id=?", (time.time(), row["job_id"])
                )
                self.finish_if_ready(db, row["job_id"])
        except sqlite3.IntegrityError:
            raise ContentError(tr("errors.identifierExists"), status=409) from None
        return self.proposal(owner, ident)

    def cancel_proposal(self, owner, ident, revision):
        with self.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self._batch_row(db, owner, ident)
            if row["revision"] != revision or row["state"] == "applied":
                raise ContentError(tr("errors.proposalChanged"), status=409)
            if row["state"] == "cancelled":
                return self._proposal_public(row)
            if self._row(db, row["job_id"])["status"] in TERMINAL:
                raise ContentError(tr("errors.proposalInapplicable"), status=409)
            payload = json.loads(row["payload"])
            db.execute("UPDATE assistant_job_batches SET state='cancelled' WHERE id=?", (ident,))
            for operation in payload["operations"]:
                if row["phase"] == "content":
                    db.execute(
                        "UPDATE assistant_job_tasks SET state='generated' WHERE job_id=? AND key=?",
                        (row["job_id"], operation["key"]),
                    )
                else:
                    db.execute(
                        "UPDATE assistant_job_dependencies SET state='waiting' "
                        "WHERE job_id=? AND task_key=? AND state='prepared'",
                        (row["job_id"], operation["key"]),
                    )
            db.execute(
                "UPDATE assistant_jobs SET status='paused',"
                "error_key='jobs.batchCancelled',updated=? "
                "WHERE id=?",
                (time.time(), row["job_id"]),
            )
        return self.proposal(owner, ident)
