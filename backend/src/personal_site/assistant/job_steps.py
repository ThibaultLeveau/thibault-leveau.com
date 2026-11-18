"""Short resumable graph waves and bounded proposal preparation for durable jobs."""

import asyncio
import json
import operator
import secrets
import time
from copy import deepcopy
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from starlette.concurrency import run_in_threadpool

from personal_site.assistant.agents import invoke
from personal_site.assistant.contracts import Operation, Plan, Task
from personal_site.assistant.job_context import JobContext
from personal_site.assistant.job_store import encoded
from personal_site.assistant.models import RUN_SECONDS, Budget
from personal_site.assistant.prompts import PLANNER, SPECIALIST, policy
from personal_site.assistant.proposals import prepare
from personal_site.assistant.registry import FAMILIES, PRIVATE_FIELDS, output_model
from personal_site.content.batch import reference_ids
from personal_site.content.catalog import list_fields, target
from personal_site.content.localization import localize
from personal_site.content.schemas import LABELS
from personal_site.content.validation import ContentError
from personal_site.i18n import tr


class Wave(TypedDict):
    done: Annotated[list[str], operator.add]


class JobSteps:
    def __init__(self, manager):
        self.manager = manager
        self.store = manager.store

    def budget(self, ident):
        return Budget(
            semaphore=self.manager.assistant.semaphore,
            guard=lambda: self.store.guard(ident, count=True),
        )

    async def common(self, job, context):
        common = await run_in_threadpool(self.store.common, job["id"])
        attached = []
        for ident in json.loads(job["media_ids"]):
            media = await run_in_threadpool(context.read, "media", ident)
            attached.append(
                {
                    "id": ident,
                    "entry": {
                        k: v
                        for k, v in media["entry"].items()
                        if context.include_private or k not in PRIVATE_FIELDS
                    },
                }
            )
        return {**common, "attached_media": attached}

    async def plan(self, job, config):
        budget = self.budget(job["id"])
        context = JobContext(self.store, job, budget)
        preferences = await run_in_threadpool(self.store.preferences, job["id"])
        common = await self.common(job, context)
        async with (
            asyncio.timeout(RUN_SECONDS),
            self.manager.assistant.models.open(config, budget) as model,
        ):
            plan = await invoke(
                model,
                Plan,
                policy(job["interface_language"]) + PLANNER,
                {
                    **common,
                    "preferences": {
                        **preferences.defaults.model_dump(),
                        "language": job["language"],
                    },
                    "collections": {key: value[0] for key, value in LABELS.items()},
                },
                context,
            )
        await run_in_threadpool(self.store.save_plan, job["id"], plan)

    def claim(self, ident):
        with self.store.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.store._assert_running(db, ident)
            rows = db.execute(
                "SELECT s.*,t.task,t.plan_page,t.result_id FROM assistant_job_sections s "
                "JOIN assistant_job_tasks t ON t.job_id=s.job_id AND t.key=s.task_key "
                "WHERE s.job_id=? AND s.state='queued' "
                "AND (t.state='queued' OR (t.state='applied' AND s.phase='links')) "
                "ORDER BY t.ordinal,s.section LIMIT 3",
                (ident,),
            ).fetchall()
            for row in rows:
                db.execute(
                    "UPDATE assistant_job_sections SET state='running' "
                    "WHERE job_id=? AND task_key=? AND section=?",
                    (ident, row["task_key"], row["section"]),
                )
            db.execute(
                "UPDATE assistant_jobs SET delegations=delegations+?,updated=? WHERE id=?",
                (len(rows), time.time(), ident),
            )
            return [dict(row) for row in rows]

    def siblings(self, ident, page):
        with self.store.admin.connect() as db:
            return [
                json.loads(row[0])
                for row in db.execute(
                    "SELECT task FROM assistant_job_tasks WHERE job_id=? AND plan_page=? "
                    "ORDER BY ordinal LIMIT 12",
                    (ident, page),
                )
            ]

    def save_section(self, work, result, versions):
        with self.store.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT status FROM assistant_jobs WHERE id=?", (work["job_id"],)
            ).fetchone()
            if not row or row[0] == "cancelled":
                return
            db.execute(
                "UPDATE assistant_job_sections SET state=?,result=?,versions=? "
                "WHERE job_id=? AND task_key=? AND section=?",
                (
                    "needs_input" if result.questions else "done",
                    encoded(
                        {
                            "changes": result.changes.model_dump(exclude_unset=True),
                            "questions": [q.model_dump() for q in result.questions],
                            "missing": result.missing,
                            "as_draft": result.as_draft,
                        }
                    ),
                    encoded(versions),
                    work["job_id"],
                    work["task_key"],
                    work["section"],
                ),
            )

    async def sections(self, job, config, work):
        preferences = await run_in_threadpool(self.store.preferences, job["id"])

        async def specialist(item):
            task = Task.model_validate_json(item["task"])
            fields = json.loads(item["fields"])
            deferred = None
            if item["phase"] == "links":
                task = task.model_copy(update={"entry_id": item["result_id"], "fields": fields})
                with self.store.admin.connect() as db:
                    deferred = {
                        row["field"]: json.loads(row["value"])
                        for row in db.execute(
                            "SELECT DISTINCT field,value FROM assistant_job_dependencies "
                            "WHERE job_id=? AND task_key=? AND state!='applied'",
                            (job["id"], task.key),
                        )
                    }
            budget = self.budget(job["id"])
            context = JobContext(self.store, job, budget)
            common = await self.common(job, context)
            current = (
                await run_in_threadpool(context.read, task.kind, task.entry_id, fields)
                if task.entry_id is not None
                else None
            )
            siblings = await run_in_threadpool(self.siblings, job["id"], item["plan_page"])
            schema = output_model(task.kind, fields, context.include_private)
            async with (
                asyncio.timeout(RUN_SECONDS),
                self.manager.assistant.models.open(config, budget) as model,
            ):
                result = await invoke(
                    model,
                    schema,
                    policy(job["interface_language"]) + SPECIALIST,
                    {
                        **common,
                        "task": task.model_dump(),
                        "section": item["section"],
                        "allowed_fields": fields,
                        "current": current,
                        "deferred_changes": deferred,
                        "plan": siblings,
                        "preferences": {
                            **preferences.for_family(FAMILIES[task.kind]).model_dump(),
                            "language": job["language"],
                        },
                    },
                    context,
                )
            await run_in_threadpool(self.save_section, item, result, context.versions)
            return {"done": [task.key]}

        # The persisted queue supplies exactly one wave. Graph state never accumulates all
        # sections, and a worker commits its own successful output before siblings finish.
        graph = StateGraph(Wave)
        graph.add_node("specialist", specialist)
        graph.add_conditional_edges(START, lambda _: [Send("specialist", item) for item in work])
        graph.add_edge("specialist", END)
        await graph.compile().ainvoke({"done": []}, {"recursion_limit": 4, "callbacks": []})

    def questions(self, ident):
        with self.store.admin.connect() as db:
            rows = db.execute(
                "SELECT result FROM assistant_job_sections WHERE job_id=? AND state='needs_input' "
                "LIMIT 8",
                (ident,),
            ).fetchall()
            questions = {}
            for row in rows:
                for question in json.loads(row[0])["questions"]:
                    questions[question["question"]] = question
            return list(questions.values())[:8]

    def consolidate(self, ident):
        with self.store.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            job = self.store._assert_running(db, ident)
            rows = db.execute(
                "SELECT t.* FROM assistant_job_tasks t WHERE t.job_id=? AND t.state='queued' "
                "AND NOT EXISTS (SELECT 1 FROM assistant_job_sections s WHERE s.job_id=t.job_id "
                "AND s.task_key=t.key AND s.state!='done') ORDER BY ordinal LIMIT 12",
                (ident,),
            ).fetchall()
            for row in rows:
                changes, missing, versions, draft = {}, [], {}, False
                for section in db.execute(
                    "SELECT result,versions FROM assistant_job_sections "
                    "WHERE job_id=? AND task_key=?",
                    (ident, row["key"]),
                ):
                    result = json.loads(section["result"])
                    if changes.keys() & result["changes"].keys():
                        raise ContentError(tr("errors.specialistConflict"))
                    changes.update(result["changes"])
                    missing.extend(result["missing"])
                    draft |= result["as_draft"]
                    for key, version in json.loads(section["versions"]).items():
                        if key in versions and versions[key] != version:
                            raise ContentError(tr("errors.generationConflict"), status=409)
                        versions[key] = version
                if not changes:
                    raise ContentError(tr("jobs.emptyTask"))
                if row["entry_id"]:
                    record = localize(db, self.store.content.read(db, row["kind"], row["entry_id"]))
                    draft |= bool(
                        record["entry"]["language"] != job["language"]
                        and record["localization"]["states"].get(job["language"]) != "ready"
                    )
                operation = Operation(
                    key=row["key"],
                    kind=row["kind"],
                    entry_id=row["entry_id"],
                    language=job["language"],
                    version=versions.get(str(row["entry_id"])) if row["entry_id"] else None,
                    changes={
                        **changes,
                        **({"language": job["language"]} if row["entry_id"] is None else {}),
                    },
                    as_draft=draft,
                )
                db.execute(
                    "UPDATE assistant_job_tasks SET state='generated',operation=?,versions=?,"
                    "missing=? "
                    "WHERE job_id=? AND key=?",
                    (
                        operation.model_dump_json(),
                        encoded(versions),
                        encoded(missing),
                        ident,
                        row["key"],
                    ),
                )
            return len(rows)

    def consolidate_links(self, ident):
        with self.store.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.store._assert_running(db, ident)
            rows = db.execute(
                "SELECT s.*,t.kind,t.result_id FROM assistant_job_sections s "
                "JOIN assistant_job_tasks t ON t.job_id=s.job_id AND t.key=s.task_key "
                "WHERE s.job_id=? AND s.phase='links' AND s.state='done' LIMIT 3",
                (ident,),
            ).fetchall()
            for row in rows:
                result = json.loads(row["result"])
                changes = result["changes"]
                fields = json.loads(row["fields"])
                if set(changes) != set(fields):
                    raise ContentError(tr("jobs.emptyTask"))
                for name, value in changes.items():
                    db.execute(
                        "DELETE FROM assistant_job_dependencies WHERE job_id=? AND task_key=? "
                        "AND field=? AND state!='applied'",
                        (ident, row["task_key"], name),
                    )
                    refs = [
                        ref
                        for ref in reference_ids(row["kind"], {name: value})
                        if isinstance(ref, str)
                    ]
                    # A field containing only real IDs still needs an explicit reviewed
                    # write. Its own saved source is the already-satisfied dependency.
                    deps = [(ref[1:], target(row["kind"], name)) for ref in refs] or [
                        (row["task_key"], row["kind"])
                    ]
                    for key, kind in deps:
                        db.execute(
                            "INSERT INTO assistant_job_dependencies "
                            "(job_id,task_key,field,target_key,expected_kind,value,versions,state) "
                            "VALUES (?,?,?,?,?,?,?,'waiting') ON CONFLICT DO NOTHING",
                            (
                                ident,
                                row["task_key"],
                                name,
                                key,
                                kind,
                                encoded(value),
                                row["versions"],
                            ),
                        )
                versions = json.loads(row["versions"])
                db.execute(
                    "UPDATE assistant_job_tasks SET result_version=?,versions=? "
                    "WHERE job_id=? AND key=?",
                    (versions[str(row["result_id"])], encoded(versions), ident, row["task_key"]),
                )
                db.execute(
                    "DELETE FROM assistant_job_sections "
                    "WHERE job_id=? AND task_key=? AND phase='links'",
                    (ident, row["task_key"]),
                )
            return len(rows)

    def _batch(self, db, ident, phase, payload):
        if len(encoded(payload).encode()) > 2 * 1024 * 1024:
            raise ContentError(tr("errors.proposalSize"))
        sequence = db.execute(
            "SELECT coalesce(max(sequence),0)+1 FROM assistant_job_batches WHERE job_id=?",
            (ident,),
        ).fetchone()[0]
        db.execute(
            "INSERT INTO assistant_job_batches "
            "(id,job_id,sequence,state,phase,created,payload) VALUES (?,?,?,'pending',?,?,?)",
            (
                "job_" + secrets.token_urlsafe(24),
                ident,
                sequence,
                phase,
                time.time(),
                encoded(payload),
            ),
        )
        db.execute("UPDATE assistant_jobs SET updated=? WHERE id=?", (time.time(), ident))

    def prepare_content(self, ident, limit=12):
        with self.store.admin.connect() as db:
            rows = db.execute(
                "SELECT * FROM assistant_job_tasks WHERE job_id=? AND state='generated' "
                "ORDER BY ordinal LIMIT ?",
                (ident, limit),
            ).fetchall()
            if not rows:
                return False
            keys = {row["key"] for row in rows}
            operations, versions, missing, dependencies = [], {}, {}, []
            for row in rows:
                operation = json.loads(row["operation"])
                changes = operation["changes"]
                missing[row["key"]] = json.loads(row["missing"])
                for key, version in json.loads(row["versions"]).items():
                    if key in versions and versions[key] != version:
                        raise ContentError(tr("errors.generationConflict"), status=409)
                    versions[key] = version
                for name, value in list(changes.items()):
                    kind = target(row["kind"], name)
                    if not kind:
                        continue
                    refs = list(reference_ids(row["kind"], {name: value}))
                    mapping, deferred = {}, []
                    for ref in refs:
                        if not isinstance(ref, str):
                            continue
                        key = ref.removeprefix("@")
                        source = db.execute(
                            "SELECT kind,result_id FROM assistant_job_tasks "
                            "WHERE job_id=? AND key=?",
                            (ident, key),
                        ).fetchone()
                        if source and source["kind"] != kind:
                            raise ContentError(tr("jobs.referenceKind"))
                        if source and source["result_id"]:
                            mapping[ref] = source["result_id"]
                        elif key not in keys:
                            deferred.append(key)
                    if deferred:
                        dependencies.extend(
                            (row["key"], name, ref.removeprefix("@"), kind, encoded(value))
                            for ref in refs
                            if isinstance(ref, str)
                        )
                        del changes[name]
                        missing[row["key"]].append(tr("jobs.deferredField", field=name))
                        # Deferring a relationship may make a ready record incomplete.
                        # Existing values are retained for this first review.
                    elif mapping:
                        changes[name] = self.resolve_value(row["kind"], name, value, mapping)
                operations.append(Operation.model_validate(operation))
        try:
            payload = prepare(self.store.content, operations, versions, missing)
        except ContentError as exc:
            if exc.message == tr("errors.proposalSize") and limit > 1:
                return self.prepare_content(ident, max(1, limit // 2))
            raise
        if len(encoded(payload).encode()) > 2 * 1024 * 1024 and limit > 1:
            return self.prepare_content(ident, max(1, limit // 2))
        with self.store.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.store._assert_running(db, ident)
            self._batch(db, ident, "content", payload)
            for key, name, ref, kind, value in dependencies:
                db.execute(
                    "INSERT INTO assistant_job_dependencies "
                    "(job_id,task_key,field,target_key,expected_kind,value,state) "
                    "VALUES (?,?,?,?,?,?,'waiting') ON CONFLICT DO NOTHING",
                    (ident, key, name, ref, kind, value),
                )
            for row in rows:
                db.execute(
                    "UPDATE assistant_job_tasks SET state='prepared' WHERE job_id=? AND key=?",
                    (ident, row["key"]),
                )
        return True

    @staticmethod
    def resolve_value(kind, name, value, mapping):
        if name in list_fields(kind):
            return [{**item, "id": mapping.get(item["id"], item["id"])} for item in value]
        return mapping.get(value, value)

    def prepare_links(self, ident):
        with self.store.admin.connect() as db:
            if (
                db.execute(
                    "SELECT 1 FROM assistant_job_tasks WHERE job_id=? AND state!='applied' LIMIT 1",
                    (ident,),
                ).fetchone()
                or db.execute(
                    "SELECT 1 FROM assistant_job_batches WHERE job_id=? AND phase='links' "
                    "AND state='pending' LIMIT 1",
                    (ident,),
                ).fetchone()
            ):
                return False
            # Only complete fields are eligible. SQL filters without loading the dependency
            # graph; large cycles are broken by previously reviewed draft creations.
            rows = db.execute(
                "SELECT d.task_key,d.field,d.value,d.versions,t.kind,t.result_id,t.result_version "
                "FROM assistant_job_dependencies d JOIN assistant_job_tasks t "
                "ON t.job_id=d.job_id AND t.key=d.task_key "
                "WHERE d.job_id=? AND d.state='waiting' AND t.state='applied' "
                "AND NOT EXISTS (SELECT 1 FROM assistant_job_dependencies x "
                "LEFT JOIN assistant_job_tasks y ON y.job_id=x.job_id AND y.key=x.target_key "
                "WHERE x.job_id=d.job_id AND x.task_key=d.task_key AND x.field=d.field "
                "AND (y.result_id IS NULL OR y.kind!=x.expected_kind)) "
                "GROUP BY d.task_key,d.field ORDER BY t.ordinal,d.field LIMIT 12",
                (ident,),
            ).fetchall()
            if not rows:
                return False
            operations, versions = {}, {}
            for row in rows:
                record = self.store.content.read(db, row["kind"], row["result_id"])
                if record["version"] != row["result_version"]:
                    raise ContentError(tr("errors.generationConflict"), status=409)
                mapping = {
                    "@" + item["target_key"]: item["result_id"]
                    for item in db.execute(
                        "SELECT d.target_key,t.result_id FROM assistant_job_dependencies d "
                        "JOIN assistant_job_tasks t ON t.job_id=d.job_id AND t.key=d.target_key "
                        "WHERE d.job_id=? AND d.task_key=? AND d.field=?",
                        (ident, row["task_key"], row["field"]),
                    )
                }
                value = self.resolve_value(
                    row["kind"], row["field"], json.loads(row["value"]), mapping
                )
                operation = operations.setdefault(
                    row["task_key"],
                    Operation(
                        key=row["task_key"],
                        kind=row["kind"],
                        entry_id=row["result_id"],
                        language=self.store._row(db, ident)["language"],
                        version=record["version"],
                        changes={},
                    ),
                )
                operation.changes[row["field"]] = deepcopy(value)
                versions[str(record["id"])] = record["version"]
                for key, version in json.loads(row["versions"]).items():
                    if key in versions and versions[key] != version:
                        raise ContentError(tr("errors.generationConflict"), status=409)
                    versions[key] = version
        payload = prepare(self.store.content, list(operations.values()), versions, {})
        with self.store.admin.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.store._assert_running(db, ident)
            self._batch(db, ident, "links", payload)
            for row in rows:
                db.execute(
                    "UPDATE assistant_job_dependencies SET state='prepared' "
                    "WHERE job_id=? AND task_key=? AND field=? AND state='waiting'",
                    (ident, row["task_key"], row["field"]),
                )
        return True

    def missing_dependencies(self, ident):
        with self.store.admin.connect() as db:
            return bool(
                db.execute(
                    "SELECT 1 FROM assistant_job_dependencies d LEFT JOIN assistant_job_tasks t "
                    "ON t.job_id=d.job_id AND t.key=d.target_key "
                    "WHERE d.job_id=? AND (t.key IS NULL OR t.kind!=d.expected_kind) LIMIT 1",
                    (ident,),
                ).fetchone()
            )
