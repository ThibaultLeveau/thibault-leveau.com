"""Cas d'usage conversationnel ; budgets, confidentialité et erreurs au même endroit."""

import asyncio
import logging
import time

import httpx
import httpx2
from langsmith import tracing_context
from starlette.concurrency import run_in_threadpool

from personal_site.admin.llm import ProviderError
from personal_site.assistant.graph import build_graph
from personal_site.assistant.models import RUN_SECONDS, Budget, ModelFactory
from personal_site.assistant.registry import PRIVATE_FIELDS
from personal_site.assistant.store import AssistantStore
from personal_site.assistant.tools import Context
from personal_site.content.validation import ContentError

logger = logging.getLogger(__name__)


class AssistantService:
    def __init__(self, content, models=None):
        self.store = AssistantStore(content)
        self.models = models or ModelFactory()

    async def reply(self, turn, owner, config):
        started, budget = time.monotonic(), Budget()
        context = Context(self.store.content, budget, turn.include_private_notes)
        try:
            with tracing_context(enabled=False):
                async with asyncio.timeout(RUN_SECONDS), self.models.open(config, budget) as model:
                    preferences = await run_in_threadpool(self.store.preferences)
                    previous = await run_in_threadpool(self.store.latest, owner, turn.thread_id)
                    if previous and not turn.include_private_notes:
                        previous = {
                            **previous,
                            "operations": [
                                {
                                    **op,
                                    "changes": {
                                        k: v
                                        for k, v in op["changes"].items()
                                        if k not in PRIVATE_FIELDS
                                    },
                                }
                                for op in previous["operations"]
                            ],
                        }
                    for ident in turn.media_ids:
                        await run_in_threadpool(context.read, "media", ident)
                    graph = build_graph(model, context, preferences, turn, previous)
                    state = await graph.ainvoke(
                        {"results": []}, {"recursion_limit": 24, "callbacks": []}
                    )
                    response = state["response"]
                    payload = response.pop("proposal_payload")
                    proposal = (
                        await run_in_threadpool(self.store.create, owner, turn.thread_id, payload)
                        if payload
                        else None
                    )
                    if proposal is None:
                        await run_in_threadpool(self.store.supersede, owner, turn.thread_id)
                    return {
                        **response,
                        "proposal": proposal,
                        "provider": config["provider"],
                        "model": config["model"],
                        "calls": budget.calls,
                    }
        except TimeoutError:
            raise ProviderError(
                "La génération dépasse le délai. Réduisez le périmètre ou réessayez.", 504
            ) from None
        except (ContentError, ProviderError):
            raise
        except Exception as exc:
            # SDKs may wrap transport failures in a connection exception. Recover only
            # our deliberately safe error; never forward a provider's raw error text.
            cause, seen = exc, set()
            while cause and id(cause) not in seen:
                seen.add(id(cause))
                if isinstance(cause, ProviderError):
                    raise ProviderError(cause.message, cause.status) from None
                if isinstance(cause, (httpx.TimeoutException, httpx2.TimeoutException)):
                    raise ProviderError(
                        "Le fournisseur met trop de temps à répondre. Réessayez.", 504
                    ) from None
                cause = cause.__cause__ or cause.__context__
            # SDK/graph exceptions can embed credentials, prompts or provider payloads.
            logger.warning("assistant_failure category=%s", type(exc).__name__)
            raise ProviderError(
                "La génération n'a pas abouti. Vérifiez le modèle, "
                "sa compatibilité avec les outils et réessayez."
            ) from None
        finally:
            logger.info(
                "assistant_turn id=%s calls=%d tools=%d duration=%.2f",
                turn.request_id,
                budget.calls,
                budget.tool_calls,
                time.monotonic() - started,
            )
