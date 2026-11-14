"""Outils de contexte en lecture seule, filtrés, paginés et bornés."""

import json
from dataclasses import dataclass, field

from langchain.tools import tool
from starlette.concurrency import run_in_threadpool

from personal_site.assistant.contracts import Kind
from personal_site.assistant.models import Budget
from personal_site.assistant.registry import PRIVATE_FIELDS, describe, redact
from personal_site.content.schemas import MODELS
from personal_site.content.store import ContentStore
from personal_site.content.validation import ContentError


@dataclass
class Context:
    content: ContentStore
    budget: Budget
    include_private: bool
    versions: dict[str, int] = field(default_factory=dict)
    snapshots: dict[int, dict] = field(default_factory=dict)

    def read(self, kind, ident, fields=None):
        record = self.content.get(kind, ident)
        version = self.versions.setdefault(str(ident), record["version"])
        if record["version"] != version:
            raise ContentError("Une fiche a changé pendant la génération. Réessayez.", status=409)
        self.snapshots[ident] = record
        data = redact(kind, record["entry"], self.include_private)
        if fields is not None:
            if not set(fields) <= MODELS[kind].model_fields.keys():
                raise ContentError("Champs inconnus.")
            data = {k: v for k, v in data.items() if k in fields}
        result = {
            "id": ident,
            "kind": kind,
            "status": record["status"],
            "entry": data,
            "references": record["references"],
        }
        self.budget.use_tool(len(json.dumps(result, ensure_ascii=False)))
        return result

    def tools(self):
        @tool
        async def rechercher_fiches(kind: Kind, query: str = "", page: int = 1) -> dict:
            """Chercher des fiches existantes par nom ; page de 15 résultats, accents ignorés."""
            self.budget.use_tool()
            if len(query) > 160 or not 1 <= page <= 100:
                return {"error": "Recherche invalide : 160 caractères, page 1 à 100."}
            result = await run_in_threadpool(
                self.content.listing, kind, query=query, page=page, limit=15
            )
            return {
                "items": [
                    {k: row[k] for k in ("id", "title", "kind", "status")}
                    for row in result["items"]
                ],
                "total": result["total"],
                "page": page,
            }

        @tool
        async def lire_fiche(kind: Kind, entry_id: int, fields: list[str] | None = None) -> dict:
            """Lire les champs utiles d'une fiche et ses références avant modification."""
            try:
                return await run_in_threadpool(self.read, kind, entry_id, fields)
            except ContentError as exc:
                return {"error": exc.message}

        @tool
        def decrire_collection(kind: Kind) -> dict:
            """Obtenir tous les champs éditables et les types de références d'une collection."""
            self.budget.use_tool()
            result = describe(kind)
            if not self.include_private:
                result["fields"] = {
                    k: v for k, v in result["fields"].items() if k not in PRIVATE_FIELDS
                }
            return result

        return [rechercher_fiches, lire_fiche, decrire_collection]
