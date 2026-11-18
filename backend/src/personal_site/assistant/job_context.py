"""Bounded read tools for durable facts and stable task identities."""

import json

from langchain.tools import tool
from starlette.concurrency import run_in_threadpool

from personal_site.assistant.tools import Context
from personal_site.i18n import tr


class JobContext(Context):
    def __init__(self, store, job, budget):
        super().__init__(store.content, budget, bool(job["include_private"]), job["language"])
        self.max_search_page = 9223372036854775807 // 15
        self.job_store = store
        self.job_id = job["id"]

    def tools(self):
        @tool
        async def lire_precisions(page: int = 1) -> dict:
            """Lire les faits du travail, quatre segments par page, sans limite totale."""
            if not 1 <= page <= 9223372036854775807 // 4:
                return {"error": tr("errors.searchBounds")}
            result = await run_in_threadpool(self.job_store.facts, self.job_id, page)
            self.budget.use_tool(len(json.dumps(result, ensure_ascii=False)))
            return result

        @tool
        async def rechercher_taches(query: str = "", page: int = 1) -> dict:
            """Retrouver les clés et fiches du travail, huit tâches par page."""
            if len(query) > 160 or not 1 <= page <= 9223372036854775807 // 8:
                return {"error": tr("errors.searchBounds")}
            result = await run_in_threadpool(self.job_store.task_page, self.job_id, query, page)
            self.budget.use_tool(len(json.dumps(result, ensure_ascii=False)))
            return result

        return [*super().tools(), lire_precisions, rechercher_taches]
