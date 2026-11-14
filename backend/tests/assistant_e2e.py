"""Scénarios natifs tool-calling de Playwright, sans clé ni accès réseau externe."""

from assistant_fakes import ScriptedProvider


def scenario(data):
    text = data["messages"][0]["content"].lower()
    if "projet" in text:
        return {
            "skill": (
                "skills",
                {"title": "Conception d’API pour l’atelier", "nature": "technical"},
            ),
            "project": (
                "projects",
                {
                    "title": "Atelier Python",
                    "summary": "Un atelier de conception d’API.",
                    "body": "J’ai animé un atelier Python.",
                    "nature": "personal",
                    "start_date": "2025",
                    "end_date": "2025",
                    "role": "Animateur",
                    "actions": [{"text": "Préparer les exercices"}],
                    "skills": [{"id": "@skill", "context": "Concevoir une API"}],
                },
            ),
        }
    if "profil" in text:
        return {
            "profile": (
                "profiles",
                {
                    "title": "Alex",
                    "profession": "Ingénieur",
                    "summary": "Je conçois des API.",
                    "body": "Je conçois des API Python.",
                    "tagline": "Des API fiables",
                    "public_location": "Paris",
                    "availability": "Disponible en décembre",
                    "languages": [{"name": "Français", "level": "Courant"}],
                    "interests": [{"text": "Photographie"}],
                    "seo_title": "Alex — API",
                },
            )
        }
    if "offre" in text:
        return {
            "service": (
                "services",
                {
                    "title": "Audit API",
                    "summary": "Un audit de votre API.",
                    "packages": [
                        {"name": "Découverte", "pricing": "fixed", "amount": "0"},
                        {"name": "Audit complet", "pricing": "fixed", "amount": "1499.90"},
                    ],
                    "faq": [{"question": "À distance ?", "answer": "Oui, entièrement à distance."}],
                },
            )
        }
    if "article" in text:
        return {
            "post": (
                "posts",
                {
                    "title": "Documenter une API",
                    "summary": "Les étapes de documentation.",
                    "body": "## Préparer\nDécrire les routes et leurs **exemples**.",
                    "media": [
                        {"id": m["id"], "alt": "Schéma de documentation fourni"}
                        for m in data["attached_media"]
                    ],
                },
            )
        }
    return {}


def plan(data):
    entries = scenario(data)
    if "profile" in entries and len(data["messages"]) == 1:
        return {
            "message": "Préparons votre profil.",
            "questions": [
                {
                    "question": "Quel est votre métier et que souhaitez-vous présenter ?",
                    "fields": ["profession"],
                }
            ],
        }
    return {
        "message": "Voici les fiches proposées."
        if entries
        else "Bonjour depuis le fournisseur de test.",
        "tasks": [
            {
                "key": key,
                "kind": kind,
                "fields": list(values),
                "brief": "Reprendre les faits explicitement fournis.",
            }
            for key, (kind, values) in entries.items()
        ],
    }


def draft(data):
    values = scenario(data)[data["task"]["key"]][1]
    if "version affinée" in data["messages"][-1]["content"].lower() and "summary" in values:
        values["summary"] = "Version affinée"
    return {"changes": {k: v for k, v in values.items() if k in data["allowed_fields"]}}


def provider():
    return ScriptedProvider(
        plan, dict.fromkeys(("skill", "project", "profile", "service", "post"), draft)
    )
