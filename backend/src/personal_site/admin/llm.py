"""Adaptateurs texte ; destinations fixes, réponses bornées et erreurs sans secrets."""

import asyncio
import json

import httpx

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
                        raise ProviderError(
                            "Clé API refusée. Vérifiez les réglages du fournisseur."
                        )
                    if response.status_code == 429:
                        raise ProviderError(
                            "Quota ou limite du fournisseur atteint. Réessayez plus tard."
                        )
                    if response.status_code >= 300:
                        raise ProviderError(
                            "Le fournisseur a refusé la demande. Vérifiez le modèle et votre accès."
                        )
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > 2 * 1024 * 1024:
                            raise ProviderError("La réponse du fournisseur est trop volumineuse.")
            data = json.loads(body)
            if provider == "anthropic":
                text = "\n".join(part["text"] for part in data["content"] if part["type"] == "text")
            else:
                text = data["choices"][0]["message"]["content"]
            if not isinstance(text, str) or not text.strip():
                raise ProviderError("Le modèle n’a pas renvoyé de texte. Essayez un autre modèle.")
            if len(text) > 20000:
                raise ProviderError(
                    "La réponse dépasse la taille acceptée. Demandez une réponse plus courte."
                )
            return text
        except (TimeoutError, httpx.TimeoutException) as exc:
            raise ProviderError(
                "Le fournisseur met trop de temps à répondre. Réessayez.", 504
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                "Impossible de joindre le fournisseur. Réessayez plus tard."
            ) from exc
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(
                "Réponse du fournisseur illisible. Essayez un autre modèle."
            ) from exc
