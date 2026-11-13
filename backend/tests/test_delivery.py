import re

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from personal_site.config import Settings
from personal_site.main import create_app


def test_built_home_and_its_assets(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Thibault Leveau" in response.text
    assert response.headers["cache-control"] == "no-cache"
    assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', response.text)
    assert assets, "Le test doit vérifier les véritables assets du build Vite"
    for asset in assets:
        result = client.get(asset)
        assert result.status_code == 200
        assert "immutable" in result.headers["cache-control"]
    assert client.get("/theme-init.js").status_code == 200


def test_documentation_and_search_index(client):
    redirect = client.get("/documentation", follow_redirects=False)
    assert redirect.status_code == 308
    assert redirect.headers["location"] == "/documentation/"
    for path in ("/documentation/", "/documentation/architecture/"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-cache"
        assert response.headers["x-robots-tag"] == "noindex, nofollow"
    search = client.get("/documentation/search/search_index.json")
    assert search.status_code == 200
    assert search.json()["docs"]


@pytest.mark.parametrize(
    "path",
    [
        "/inconnu",
        "/api/inconnue",
        "/assets/inexistant.js",
        "/documentation/inexistante/",
        "/docs",
        "/redoc",
        "/openapi.json",
    ],
)
def test_unknown_paths_are_real_404s(client, path):
    response = client.get(path)
    assert response.status_code == 404
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"] == "noindex, nofollow"


def test_production_refuses_incomplete_artifacts(tmp_path):
    settings = Settings(environment="production", static_dir=tmp_path, _env_file=None)
    with pytest.raises(RuntimeError, match="Artefacts manquants"):
        create_app(settings)
    (tmp_path / "web").mkdir()
    (tmp_path / "web/index.html").write_text("<html></html>")
    with pytest.raises(RuntimeError, match="documentation"):
        create_app(settings)


def test_configuration_requires_absolute_static_path():
    with pytest.raises(ValidationError, match="chemin absolu"):
        Settings(static_dir="relative/build", _env_file=None)


def test_indexing_can_be_enabled_explicitly(tmp_path):
    settings = Settings(static_dir=tmp_path, indexable=True, _env_file=None)
    with TestClient(create_app(settings)) as client:
        assert "x-robots-tag" not in client.get("/api/health").headers
