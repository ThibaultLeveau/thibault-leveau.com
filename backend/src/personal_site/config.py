"""Configuration d'exécution, validée avant le démarrage."""

from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SITE_", env_file=".env", extra="ignore", hide_input_in_errors=True
    )

    environment: Literal["development", "production"] = "development"
    static_dir: Path = Path(__file__).resolve().parents[3] / "build"
    indexable: bool = False
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"
    admin_enabled: bool = False
    admin_username: str = "admin"
    admin_password: SecretStr = SecretStr("")
    secret_key: SecretStr = SecretStr("")
    admin_db_path: Path = Path(__file__).resolve().parents[3] / "data" / "admin.sqlite3"
    admin_origin: str = "http://127.0.0.1:5173"
    media_quota_bytes: int = Field(default=1024**3, gt=0, le=1024**4)

    @field_validator("static_dir", "admin_db_path")
    @classmethod
    def require_absolute_path(cls, value: Path) -> Path:
        if not value.is_absolute():
            raise ValueError("Le répertoire de build et la base admin exigent un chemin absolu")
        return value

    @model_validator(mode="after")
    def validate_admin(self):
        if not self.admin_enabled:
            return self
        import re

        if not re.fullmatch(r"[A-Za-z0-9_.-]{3,64}", self.admin_username):
            raise ValueError("SITE_ADMIN_USERNAME : 3 à 64 lettres, chiffres, points, _ ou -")
        password = self.admin_password.get_secret_value()
        if password and not 12 <= len(password) <= 128:
            raise ValueError("SITE_ADMIN_PASSWORD doit contenir entre 12 et 128 caractères")
        try:
            Fernet(self.secret_key.get_secret_value().encode())
        except (ValueError, TypeError) as exc:
            raise ValueError("SITE_SECRET_KEY doit être une clé Fernet valide") from exc
        origin = urlsplit(self.admin_origin)
        if (
            origin.scheme not in {"https", "http"}
            or not origin.hostname
            or origin.username
            or origin.password
            or origin.path
            or origin.query
            or origin.fragment
            or (
                origin.scheme == "http" and origin.hostname not in {"localhost", "127.0.0.1", "::1"}
            )
        ):
            raise ValueError("SITE_ADMIN_ORIGIN : origine HTTPS sans chemin (HTTP local autorisé)")
        return self
