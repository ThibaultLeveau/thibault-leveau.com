"""Création paginée déterministe pour le serveur navigateur dédié aux travaux."""

from assistant_fakes import ScriptedProvider

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
    return ScriptedProvider(plan, {f"bulk_{number}": draft for number in range(1, TOTAL + 1)})
