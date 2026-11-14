"""Serveur Playwright isolé ; aucune clé réelle ni requête vers un fournisseur."""

from pathlib import Path
from tempfile import TemporaryDirectory

import httpx
import uvicorn
from assistant_e2e import provider
from cryptography.fernet import Fernet

from personal_site.admin.llm import LLMGateway
from personal_site.assistant.models import ModelFactory
from personal_site.config import Settings
from personal_site.main import create_app


def main():
    with TemporaryDirectory(prefix="personal-site-e2e-") as directory:
        app = create_app(
            Settings(
                environment="production",
                static_dir=Path(__file__).resolve().parents[2] / "build",
                admin_enabled=True,
                admin_origin="http://127.0.0.1:8765",
                admin_db_path=Path(directory) / "admin.sqlite3",
                admin_username="playwright-admin",
                admin_password="playwright-only-password",
                secret_key=Fernet.generate_key().decode(),
                _env_file=None,
            )
        )
        app.state.llm = LLMGateway(
            httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    json={
                        "choices": [
                            {"message": {"content": "Bonjour depuis le fournisseur de test."}}
                        ]
                    },
                )
            )
        )
        app.state.assistant.models = ModelFactory(httpx.MockTransport(provider()))
        uvicorn.run(app, host="127.0.0.1", port=8765)


if __name__ == "__main__":
    main()
