"""Adaptateurs texte ; destinations fixes, réponses bornées et erreurs sans secrets."""

import asyncio
import json

import httpx

from personal_site.i18n import tr

PROVIDERS = [
    {
        "id": "openai",
        "name": "OpenAI",
        "default_model": "gpt-6-luna",
        "docs_url": "https://developers.openai.com/api/docs/models",
    },
    {
        "id": "anthropic",
        "name": "Anthropic",
        "default_model": "claude-sonnet-4-6",
        "docs_url": "https://platform.claude.com/docs/en/about-claude/models/overview",
    },
    {
        "id": "mistral",
        "name": "Mistral",
        "default_model": "mistral-small-latest",
        "docs_url": "https://docs.mistral.ai/getting-started/models",
    },
]
ENDPOINTS = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "anthropic": "https://api.anthropic.com/v1/messages",
    "mistral": "https://api.mistral.ai/v1/chat/completions",
}


class ProviderError(Exception):
    def __init__(self, message: str, status: int = 502):
        self.message = message
        self.status = status


class LLMGateway:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None):
        self.transport = transport

    async def reply(self, config: dict, messages: list[dict]) -> str:
        provider = config["provider"]
        payload = {"model": config["model"], "messages": messages, "stream": False}
        headers = {"Authorization": "Bearer " + config["api_key"]}
        if provider == "anthropic":
            headers["anthropic-version"] = "2026-10-21"
            payload["max_tokens"] = 4096
        elif provider == "openai":
            payload.update(max_completion_tokens=4096, store=False)
        else:
            payload["max_tokens"] = 4096
        try:
            async with (
                asyncio.timeout(65),
                httpx.AsyncClient(
                    timeout=httpx.Timeout(60, connect=10),
                    transport=self.transport,
                    follow_redirects=False,
                    trust_env=False,
                ) as client,
            ):
                async with client.stream(
                    "POST", ENDPOINTS[provider], headers=headers, json=payload
                ) as response:
                    if response.status_code in {401, 403}:
                        raise ProviderError(tr("errors.apiKeyRejected"))
                    if response.status_code == 429:
                        raise ProviderError(tr("errors.providerQuota"))
                    if response.status_code >= 300:
                        raise ProviderError(tr("errors.providerRejected"))
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > 2 * 1024 * 1024:
                            raise ProviderError(tr("errors.providerResponseSize"))
            data = json.loads(body)
            if provider == "anthropic":
                text = "\n".join(part["text"] for part in data["content"] if part["type"] == "text")
            else:
                text = data["choices"][0]["message"]["content"]
            if not isinstance(text, str) or not text.strip():
                raise ProviderError(tr("errors.modelNoText"))
            if len(text) > 20000:
                raise ProviderError(tr("errors.replySize"))
            return text
        except (TimeoutError, httpx.TimeoutException) as exc:
            raise ProviderError(tr("errors.providerTimeout"), 504) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(tr("errors.providerConnection")) from exc
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(tr("errors.providerUnreadable")) from exc
