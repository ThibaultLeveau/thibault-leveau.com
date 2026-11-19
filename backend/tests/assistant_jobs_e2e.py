"""Création paginée déterministe pour le serveur navigateur dédié aux travaux."""

import json

from assistant_budget_fakes import ExperienceProvider
from assistant_fakes import ScriptedProvider, request_data

TOTAL = 13


def plan(data):
    completed = int(data.get("job", {}).get("planned", 0))
    end = min(completed + 12, TOTAL)
    return {
        "message": "Créer 13 compétences de test isolé.",
        "tasks": [
            {
                "key": f"bulk_{number}",
                "kind": "skills",
                "fields": ["title", "summary"],
                "brief": (
                    f"Intitulé fourni : Compétence suivie {number}. "
                    "Résumé fourni : Faits synthétiques fournis."
                ),
            }
            for number in range(completed + 1, end + 1)
        ],
        "has_more": end < TOTAL,
        "continuation": str(end),
        "total_tasks": TOTAL,
    }


def draft(data):
    number = int(data["task"]["key"].removeprefix("bulk_"))
    values = {
        "title": f"Compétence suivie {number}",
        "summary": "Faits synthétiques fournis.",
    }
    return {
        "changes": {key: value for key, value in values.items() if key in data["allowed_fields"]}
    }


def provider():
    bulk = ScriptedProvider(plan, {f"bulk_{number}": draft for number in range(1, TOTAL + 1)})
    experience = ExperienceProvider()

    def dispatch(request):
        data = request_data(json.loads(request.content))
        if "Banque de démonstration" in data["messages"][0]["content"]:
            return experience(request)
        return bulk(request)

    return dispatch
