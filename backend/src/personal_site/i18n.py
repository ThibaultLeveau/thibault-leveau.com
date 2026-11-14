"""Application messages only. Editorial values never pass through these catalogs."""

import json
from contextvars import ContextVar
from pathlib import Path
from typing import Literal

Language = Literal["fr", "en"]
current_language: ContextVar[Language] = ContextVar("interface_language", default="fr")
_directory = Path(__file__).with_name("locales")
CATALOGS = {
    language: json.loads((_directory / f"{language}.json").read_text()) for language in ("fr", "en")
}
SCHEMA_KEYS = json.loads((_directory / "schema-keys.json").read_text())


def tr(key: str, *, language: Language | None = None, **values) -> str:
    """Render an explicit message key, with the request's independent interface language."""
    message = CATALOGS[language or current_language.get()][key]
    return message.format(**values)


def schema_text(value: str) -> str:
    """Translate fixed Pydantic form metadata, never an entry or a free-form value."""
    return tr(SCHEMA_KEYS[value])


def localized_schema(value):
    if isinstance(value, list):
        return [localized_schema(item) for item in value]
    if isinstance(value, dict):
        return {
            key: schema_text(item)
            if key == "title" and isinstance(item, str) and item in SCHEMA_KEYS
            else localized_schema(item)
            for key, item in value.items()
        }
    return value
