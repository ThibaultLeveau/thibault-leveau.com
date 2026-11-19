"""A twelve-entry experience plan whose ordinary tool reads exceed a turn's budget."""

import json

from assistant_fakes import ScriptedProvider, request_data, tool_response

TECHNOLOGIES = (
    "PHP",
    "CakePHP",
    "JavaScript",
    "AngularJS",
    "Bootstrap",
    "MySQL",
    "RHEL 7",
    "Elasticsearch",
    "GitLab",
    "GitLab CI",
)
EXPERIENCE = {
    "title": "Ingénieur software PHP — Banque de démonstration",
    "summary": "Outils internes de gestion de la production informatique.",
    "body": "Développement et maintenance en équipe de plus de 60 applications, "
    "interconnexion par API REST et automatisation des pipelines CI/CD.",
    "start_date": "2016-09",
    "end_date": "2019-09",
    "team": "11 développeurs en Kanban.",
    "organization_id": "@bank",
    "technologies": [{"id": f"@tech_{i}"} for i in range(len(TECHNOLOGIES))],
}


class ExperienceProvider:
    def __init__(self):
        self.entries = {
            "bank": ("organizations", {"title": "Banque de démonstration"}),
            **{
                f"tech_{i}": ("technologies", {"title": name})
                for i, name in enumerate(TECHNOLOGIES)
            },
            "experience": ("experiences", EXPERIENCE),
        }
        self.calls = 0
        self.plans = 0
        self.drafts = []
        self.base = ScriptedProvider(self.plan, dict.fromkeys(self.entries, self.draft))

    def plan(self, data):
        self.plans += 1
        return {
            "message": "Préparer l’expérience et ses dix technologies.",
            "tasks": [
                {
                    "key": key,
                    "kind": kind,
                    "fields": list(values),
                    "brief": "Reprendre les faits fournis.",
                }
                for key, (kind, values) in self.entries.items()
            ],
            "has_more": False,
            "total_tasks": 12,
        }

    def draft(self, data):
        task = data["task"]
        self.drafts.append(task["key"])
        values = self.entries[task["key"]][1]
        return {"changes": {k: v for k, v in values.items() if k in data["allowed_fields"]}}

    def __call__(self, request):
        self.calls += 1
        body = json.loads(request.content)
        data = request_data(body)
        # Every agent performs a normal catalogue read before its structured answer.
        if not any(m.get("type") == "function_call_output" for m in body["input"]):
            return tool_response(
                body,
                "decrire_collection",
                {
                    "kind": data.get("task", {}).get("kind", "experiences"),
                },
            )
        return self.base(request)
