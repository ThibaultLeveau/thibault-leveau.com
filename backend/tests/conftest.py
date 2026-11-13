from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from personal_site.config import Settings
from personal_site.main import create_app


@pytest.fixture(scope="session")
def build_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "build"


@pytest.fixture
def client(build_dir: Path):
    settings = Settings(
        environment="production", static_dir=build_dir, indexable=False, _env_file=None
    )
    with TestClient(create_app(settings)) as client:
        yield client
