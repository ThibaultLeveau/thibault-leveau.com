"""Intégrations LangChain officielles avec transports fermés et budget partagé par tour."""

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from functools import cached_property
from typing import Any

import anthropic
import httpx
import httpx2
from langchain_anthropic import ChatAnthropic
from langchain_mistralai import ChatMistralAI
from langchain_openai import ChatOpenAI
from pydantic import Field

from personal_site.admin.llm import ENDPOINTS as TEXT_ENDPOINTS
from personal_site.admin.llm import ProviderError

ENDPOINTS = {**TEXT_ENDPOINTS, "openai": "https://api.openai.com/v1/responses"}

MAX_CALLS = 24
MAX_INPUT = 400000
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
RUN_SECONDS = 240


@dataclass
class Budget:
    calls: int = 0
    tool_calls: int = 0
    context_chars: int = 0
    semaphore: asyncio.Semaphore = field(default_factory=lambda: asyncio.Semaphore(3))

    def use_model(self):
        if self.calls >= MAX_CALLS:
            raise ProviderError(
                "La demande atteint la limite d'appels. Traitez moins de fiches à la fois.", 422
            )
        self.calls += 1

    def use_tool(self, size=0):
        self.tool_calls += 1
        self.context_chars += size
        if self.tool_calls > 48 or self.context_chars > 250000:
            raise ProviderError(
                "Le contexte est trop large. Précisez les fiches ou les champs concernés.", 422
            )


def guarded_client(module):
    class Client(module.AsyncClient):
        def __init__(self, *, endpoint, budget, **kwargs):
            super().__init__(follow_redirects=False, trust_env=False, timeout=60, **kwargs)
            self.endpoint, self.budget = endpoint, budget

        async def send(self, request, **kwargs):
            if str(request.url) != self.endpoint or request.method != "POST":
                raise ProviderError("Destination du fournisseur refusée.")
            if len(request.content) > MAX_INPUT * 4:
                raise ProviderError("Le contexte est trop volumineux. Ciblez moins de champs.", 422)
            self.budget.use_model()
            kwargs["stream"] = True
            kwargs["follow_redirects"] = False
            response = await super().send(request, **kwargs)
            try:
                status = response.status_code
                if status >= 300:
                    if status in {401, 403}:
                        message = "Clé API refusée. Vérifiez les réglages AI provider."
                    elif status == 429:
                        message = "Quota ou limite du fournisseur atteint. Réessayez plus tard."
                    else:
                        message = (
                            "Le fournisseur refuse la génération structurée. "
                            "Vérifiez le modèle et son accès aux outils."
                        )
                    raise ProviderError(message)
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_RESPONSE_BYTES:
                        raise ProviderError("La réponse du fournisseur est trop volumineuse.")
                headers = dict(response.headers)
                headers.pop("content-encoding", None)
                headers.pop("content-length", None)
                return module.Response(
                    status, headers=headers, content=bytes(body), request=request
                )
            finally:
                await response.aclose()

    return Client


HTTPClient = guarded_client(httpx)
HTTP2Client = guarded_client(httpx2)


class StudioAnthropic(ChatAnthropic):
    """Inject the bounded client at the SDK creation seam (covered by adapter tests)."""

    studio_client: Any = Field(exclude=True, repr=False)

    @cached_property
    def _async_client(self):
        return anthropic.AsyncAnthropic(**self._client_params, http_client=self.studio_client)


class ModelFactory:
    def __init__(self, transport=None, anthropic_transport=None):
        self.transport = transport
        self.anthropic_transport = anthropic_transport

    @asynccontextmanager
    async def open(self, config, budget):
        provider = config["provider"]
        client_type = HTTP2Client if provider == "anthropic" else HTTPClient
        transport = self.anthropic_transport if provider == "anthropic" else self.transport
        client_options = (
            {
                "base_url": "https://api.mistral.ai/v1",
                "headers": {
                    "Authorization": "Bearer " + config["api_key"],
                    "Content-Type": "application/json",
                },
            }
            if provider == "mistral"
            else {}
        )
        async with client_type(
            endpoint=ENDPOINTS[provider], budget=budget, transport=transport, **client_options
        ) as client:
            common = {
                "model": config["model"],
                "api_key": config["api_key"],
                "max_retries": 0,
                "max_tokens": 12000,
                "streaming": False,
            }
            if provider == "openai":
                model = ChatOpenAI(
                    **common,
                    base_url="https://api.openai.com/v1",
                    http_async_client=client,
                    store=False,
                    use_responses_api=True,
                    use_previous_response_id=False,
                    include=["reasoning.encrypted_content"],
                )
            elif provider == "anthropic":
                model = StudioAnthropic(
                    **common, base_url="https://api.anthropic.com", studio_client=client
                )
            else:
                model = ChatMistralAI(
                    **common, endpoint="https://api.mistral.ai/v1", async_client=client
                )
            try:
                yield model
            finally:
                if provider == "mistral":
                    model.client.close()
                elif provider == "openai":
                    model.root_client.close()
