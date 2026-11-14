"""Graphe borné : planifier, déléguer par fiche/section, consolider, préparer."""

import operator
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from starlette.concurrency import run_in_threadpool

from personal_site.assistant.agents import invoke
from personal_site.assistant.contracts import Operation, Plan, Question
from personal_site.assistant.prompts import PLANNER, POLICY, SPECIALIST
from personal_site.assistant.proposals import prepare
from personal_site.assistant.registry import FAMILIES, PRIVATE_FIELDS, output_model
from personal_site.content.schemas import LABELS, MODELS
from personal_site.content.validation import ContentError


class State(TypedDict, total=False):
    plan: Plan
    workers: list[dict]
    results: Annotated[list[dict], operator.add]
    response: dict


def build_graph(model, context, preferences, turn, previous):
    history = [m.model_dump() for m in turn.messages]
    common = {
        "messages": history,
        "preferences": preferences.defaults.model_dump(),
        "private_notes_enabled": turn.include_private_notes,
        "attached_media": [
            {
                "id": ident,
                "entry": {
                    k: v
                    for k, v in context.snapshots[ident]["entry"].items()
                    if context.include_private or k not in PRIVATE_FIELDS
                },
            }
            for ident in turn.media_ids
        ],
        "previous_proposal": previous["operations"] if previous else None,
    }

    async def planner(state):
        plan = await invoke(
            model,
            Plan,
            POLICY + PLANNER,
            {**common, "collections": {k: v[0] for k, v in LABELS.items()}},
            context,
        )
        if plan.questions or not plan.tasks:
            return {"plan": plan, "workers": []}
        if len({t.key for t in plan.tasks}) != len(plan.tasks):
            raise ContentError("Le plan contient des identifiants de tâches répétés.")
        targets = [
            (t.kind, t.entry_id)
            for t in plan.tasks
            if t.entry_id is not None or t.kind == "profiles"
        ]
        if len(set(targets)) != len(targets):
            raise ContentError("Le plan répète une fiche. Précisez les modifications à regrouper.")
        workers = []
        for task in plan.tasks:
            output_model(task.kind, task.fields, context.include_private)
            if task.kind == "profiles" and task.entry_id is None:
                existing = await run_in_threadpool(context.content.listing, "profiles", limit=1)
                if existing["total"]:
                    return {
                        "plan": Plan(
                            message="Un profil existe déjà.",
                            questions=[
                                Question(
                                    question="Souhaitez-vous modifier le profil existant ?",
                                    fields=["profiles"],
                                )
                            ],
                        ),
                        "workers": [],
                    }
            current = None
            if task.entry_id is not None:
                current = await run_in_threadpool(
                    context.read, task.kind, task.entry_id, task.fields
                )
            sections = {}
            for name in task.fields:
                section = (MODELS[task.kind].model_fields[name].json_schema_extra or {}).get(
                    "section", "essential"
                )
                sections.setdefault(section if len(task.fields) > 8 else "fiche", []).append(name)
            for section, names in sections.items():
                workers.append(
                    {
                        "task": task,
                        "section": section,
                        "fields": names,
                        "current": {
                            **current,
                            "entry": {k: v for k, v in current["entry"].items() if k in names},
                        }
                        if current
                        else None,
                        "plan": [t.model_dump() for t in plan.tasks],
                    }
                )
        if len(workers) > 16:
            return {
                "plan": Plan(
                    message="Cette demande couvre trop de sections pour un seul envoi.",
                    questions=[
                        Question(question="Quelles fiches souhaitez-vous traiter en premier ?")
                    ],
                ),
                "workers": [],
            }
        return {"plan": plan, "workers": workers}

    def dispatch(state):
        return [Send("specialist", worker) for worker in state["workers"]] or "finish"

    async def specialist(worker):
        task = worker["task"]
        schema = output_model(task.kind, worker["fields"], context.include_private)
        style = preferences.for_family(FAMILIES[task.kind])
        result = await invoke(
            model,
            schema,
            POLICY + SPECIALIST,
            {
                **common,
                "preferences": style.model_dump(),
                "task": task.model_dump(),
                "section": worker["section"],
                "allowed_fields": worker["fields"],
                "current": worker["current"],
                "plan": worker["plan"],
            },
            context,
        )
        return {
            "results": [
                {
                    "key": task.key,
                    "changes": result.changes.model_dump(exclude_unset=True),
                    "questions": result.questions,
                    "missing": result.missing,
                    "as_draft": result.as_draft,
                    "section": worker["section"],
                }
            ]
        }

    async def finish(state):
        plan = state["plan"]
        questions = list(plan.questions)
        for result in state.get("results", []):
            questions.extend(result["questions"])
        unique = {q.question: q.model_dump() for q in questions}
        response = {
            "message": plan.message,
            "questions": list(unique.values())[:8],
            "proposal_payload": None,
            "delegations": len(state.get("workers", [])),
        }
        if unique or not plan.tasks:
            return {"response": response}
        operations, missing = [], {}
        for task in plan.tasks:
            changes, as_draft = {}, False
            for result in state.get("results", []):
                if result["key"] != task.key:
                    continue
                if changes.keys() & result["changes"].keys():
                    raise ContentError(
                        "Deux spécialistes proposent des modifications concurrentes."
                    )
                changes.update(result["changes"])
                missing.setdefault(task.key, []).extend(result["missing"])
                as_draft |= result["as_draft"]
            if not changes:
                response["questions"].append(
                    Question(
                        question=f"Que souhaitez-vous renseigner pour {LABELS[task.kind][0]} ?"
                    ).model_dump()
                )
                continue
            operations.append(
                Operation(
                    key=task.key,
                    kind=task.kind,
                    entry_id=task.entry_id,
                    changes=changes,
                    as_draft=as_draft,
                    version=context.versions.get(str(task.entry_id)) if task.entry_id else None,
                )
            )
        if not response["questions"]:
            try:
                response["proposal_payload"] = await run_in_threadpool(
                    prepare, context.content, operations, context.versions, missing
                )
            except ContentError as exc:
                response["message"] = (
                    "La proposition demande encore une précision avant de pouvoir être enregistrée."
                )
                response["questions"] = [
                    Question(
                        question=exc.message, reason=" ".join(e["message"] for e in exc.errors[:5])
                    ).model_dump()
                ]
        return {"response": response}

    graph = StateGraph(State)
    graph.add_node("planner", planner)
    graph.add_node("specialist", specialist)
    graph.add_node("finish", finish)
    graph.add_edge(START, "planner")
    graph.add_conditional_edges("planner", dispatch, ["specialist", "finish"])
    graph.add_edge("specialist", "finish")
    graph.add_edge("finish", END)
    return graph.compile()
