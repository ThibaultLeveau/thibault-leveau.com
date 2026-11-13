"""Configuration d'exécution, validée avant le démarrage."""

from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SITE_", env_file=".env", extra="ignore")

    environment: Literal["development", "production"] = "development"
    static_dir: Path = Path(__file__).resolve().parents[3] / "build"
    indexable: bool = False
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"

    @field_validator("static_dir")
    @classmethod
    def require_absolute_path(cls, value: Path) -> Path:
        if not value.is_absolute():
            raise ValueError("SITE_STATIC_DIR doit être un chemin absolu")
        return value
