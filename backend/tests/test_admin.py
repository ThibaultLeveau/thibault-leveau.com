import asyncio
import json
import sqlite3
import time

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from pydantic import ValidationError

from personal_site.admin import reset
from personal_site.admin.llm import LLMGateway
from personal_site.admin.security import COOKIE_NAME, password_matches, token_hash
from personal_site.config import Settings
from personal_site.main import create_app

ORIGIN = "https://admin.example.test"
PASSWORD = "test-password-for-admin"
API_KEY = "test-provider-key-never-real"


@pytest.fixture
def admin_settings(tmp_path, build_dir):
    return Settings(
        environment="production",
        static_dir=build_dir,
        admin_enabled=True,
        admin_username="thibault",
        admin_password=PASSWORD,
        secret_key=Fernet.generate_key().decode(),
        admin_db_path=tmp_path / "admin.sqlite3",
        admin_origin=ORIGIN,
        _env_file=None,
    )


@pytest.fixture
def admin_client(admin_settings):
    with TestClient(create_app(admin_settings), base_url=ORIGIN) as client:
        client.headers["Origin"] = ORIGIN
        yield client


def sign_in(client, username="thibault", password=PASSWORD):
    response = client.post("/api/admin/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return response


def save_provider(client, name="openai", model="test-model"):
    response = client.put(
        "/api/admin/provider", json={"provider": name, "model": model, "api_key": API_KEY}
    )
    assert response.status_code == 200, response.text
    return response


def test_admin_routes_and_disabled_state(client):
    for method in ("GET", "HEAD"):
        page = client.request(method, "/admin")
        assert page.status_code == 200
        assert page.headers["cache-control"] == "no-store"
        assert page.headers["x-frame-options"] == "DENY"
        assert "frame-ancestors 'none'" in page.headers["content-security-policy"]
        redirect = client.request(method, "/admin/", follow_redirects=False)
        assert redirect.status_code == 308 and redirect.headers["location"] == "/admin"
    assert client.get("/admin/inconnu").status_code == 404
    assert client.get("/api/admin/session").status_code == 503


def test_authentication_cookie_session_and_logout(admin_client):
    client = admin_client
    assert client.get("/api/admin/provider").status_code == 401
    bad = client.post("/api/admin/login", json={"username": "wrong", "password": "wrong"})
    assert bad.status_code == 401
    login = sign_in(client)
    cookie = login.headers["set-cookie"]
    assert all(
        value in cookie
        for value in ("HttpOnly", "Secure", "SameSite=strict", "Path=/api/admin", "Max-Age=43200")
    )
    assert client.get("/api/admin/session").json() == login.json()
    assert client.get("/api/admin/provider").json()["has_api_key"] is False
    raw_token = client.cookies.get(COOKIE_NAME)
    with client.app.state.admin_store.connect() as db:
        assert db.execute("SELECT token_hash FROM sessions").fetchone()[0] == token_hash(raw_token)
    logout = client.post("/api/admin/logout")
    assert logout.status_code == 204
    client.cookies.set(COOKIE_NAME, raw_token)
    assert client.get("/api/admin/session").status_code == 401


def test_login_requires_exact_origin(admin_client):
    for origin in ("https://evil.example", "null", ORIGIN + ".evil", ""):
        response = admin_client.post(
            "/api/admin/login",
            headers={"Origin": origin},
            json={"username": "thibault", "password": PASSWORD},
        )
        assert response.status_code == 403


@pytest.mark.parametrize(
    "path,method,body",
    [
        ("/provider", "PUT", {"provider": "openai", "model": "test"}),
        ("/account", "PUT", {"username": "new-admin", "current_password": PASSWORD}),
        ("/chat", "POST", {"messages": [{"role": "user", "content": "Bonjour"}]}),
        ("/logout", "POST", None),
    ],
)
def test_private_mutations_require_session_csrf_and_origin(admin_client, path, method, body):
    client = admin_client
    assert client.request(method, "/api/admin" + path, json=body).status_code == 401
    sign_in(client)
    for headers in (
        {"X-CSRF-Token": "bad"},
        {"Origin": "https://evil.example"},
        {"X-CSRF-Token": ""},
    ):
        assert (
            client.request(method, "/api/admin" + path, json=body, headers=headers).status_code
            == 403
        )


def test_password_change_is_persistent_and_revokes_all_sessions(admin_client, admin_settings):
    client = admin_client
    sign_in(client)
    with TestClient(client.app, base_url=ORIGIN) as other:
        other.headers["Origin"] = ORIGIN
        sign_in(other)
        other_cookie = other.cookies.get(COOKIE_NAME)
    assert client.app.state.admin_store.session(other_cookie) is not None
    assert client.app.state.admin_store.session(client.cookies.get(COOKIE_NAME)) is not None
    body = {
        "username": "new-admin",
        "current_password": PASSWORD,
        "new_password": "new-long-test-password",
    }
    assert (
        client.put("/api/admin/account", json={**body, "current_password": "wrong"}).status_code
        == 400
    )
    assert client.put("/api/admin/account", json=body).status_code == 204
    client.cookies.set(COOKIE_NAME, other_cookie)
    assert client.get("/api/admin/session").status_code == 401
    with TestClient(create_app(admin_settings), base_url=ORIGIN) as restarted:
        restarted.headers["Origin"] = ORIGIN
        sign_in(restarted, "new-admin", "new-long-test-password")
        stored = restarted.app.state.admin_store.account()
        assert stored["password_hash"] != body["new_password"]
        assert password_matches(body["new_password"], stored["password_hash"])


def test_username_can_change_without_changing_password(admin_client):
    sign_in(admin_client)
    response = admin_client.put(
        "/api/admin/account", json={"username": "renamed", "current_password": PASSWORD}
    )
    assert response.status_code == 204
    sign_in(admin_client, "renamed")


def test_expiry_and_rotation(admin_client):
    sign_in(admin_client)
    previous = admin_client.cookies.get(COOKIE_NAME)
    sign_in(admin_client)
    assert admin_client.cookies.get(COOKIE_NAME) != previous
    assert admin_client.app.state.admin_store.session(previous) is None
    with admin_client.app.state.admin_store.connect() as db:
        db.execute("UPDATE sessions SET expires = ?", (time.time() - 1,))
    assert admin_client.get("/api/admin/session").status_code == 401


def test_credential_attempts_are_limited_and_survive_restart(admin_client, admin_settings):
    body = {"username": "nobody", "password": "wrong"}
    for _ in range(5):
        assert admin_client.post("/api/admin/login", json=body).status_code == 401
    with TestClient(create_app(admin_settings), base_url=ORIGIN) as restarted:
        response = restarted.post("/api/admin/login", json=body, headers={"Origin": ORIGIN})
        assert response.status_code == 429
        assert int(response.headers["retry-after"]) > 0


def test_provider_secret_is_encrypted_persistent_and_never_returned(admin_client, admin_settings):
    sign_in(admin_client)
    response = save_provider(admin_client)
    assert response.json()["has_api_key"] is True
    assert API_KEY not in response.text
    assert "api_key" not in response.json()
    assert API_KEY.encode() not in admin_settings.admin_db_path.read_bytes()
    with sqlite3.connect(admin_settings.admin_db_path) as db:
        encrypted = db.execute("SELECT api_key FROM provider").fetchone()[0]
    assert (
        Fernet(admin_settings.secret_key.get_secret_value()).decrypt(encrypted).decode() == API_KEY
    )
    restarted = create_app(admin_settings)
    assert restarted.state.admin_store.provider(decrypt=True)["api_key"] == API_KEY
    # A blank key retains the saved key only for the same provider.
    update = admin_client.put(
        "/api/admin/provider", json={"provider": "openai", "model": "another-model"}
    )
    assert update.status_code == 200 and update.json()["has_api_key"]
    assert (
        admin_client.put(
            "/api/admin/provider", json={"provider": "mistral", "model": "test"}
        ).status_code
        == 400
    )
    removed = admin_client.put(
        "/api/admin/provider", json={"provider": "openai", "model": "test", "clear_api_key": True}
    )
    assert removed.status_code == 200 and not removed.json()["has_api_key"]


@pytest.mark.parametrize("provider", ["openai", "anthropic", "mistral"])
def test_chat_uses_real_adapter_contracts_with_simulated_http(admin_client, provider):
    sign_in(admin_client)
    save_provider(admin_client, provider)
    captured = []

    def upstream(request):
        captured.append(request)
        if provider == "anthropic":
            return httpx.Response(
                200, json={"content": [{"type": "text", "text": "Bonjour Thibault."}]}
            )
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "Bonjour Thibault."}}]}
        )

    admin_client.app.state.llm = LLMGateway(httpx.MockTransport(upstream))
    conversation = [
        {"role": "user", "content": "Bonjour"},
        {"role": "assistant", "content": "Salut"},
        {"role": "user", "content": "Encore"},
    ]
    response = admin_client.post("/api/admin/chat", json={"messages": conversation})
    assert response.status_code == 200
    assert response.json() == {
        "message": {"role": "assistant", "content": "Bonjour Thibault."},
        "provider": provider,
        "model": "test-model",
    }
    request = captured[0]
    assert (
        request.url.host
        == {
            "openai": "api.openai.com",
            "anthropic": "api.anthropic.com",
            "mistral": "api.mistral.ai",
        }[provider]
    )
    assert request.headers["authorization"] == "Bearer " + API_KEY
    sent = json.loads(request.content)
    assert sent["messages"] == conversation
    assert sent["model"] == "test-model" and sent["stream"] is False
    if provider == "openai":
        assert sent["max_completion_tokens"] == 4096 and sent["store"] is False
    else:
        assert sent["max_tokens"] == 4096
    if provider == "anthropic":
        assert request.headers["anthropic-version"] == "2026-10-21"


@pytest.mark.parametrize("upstream_status", [302, 400, 401, 403, 429, 500])
def test_upstream_errors_are_sanitized(admin_client, upstream_status):
    sign_in(admin_client)
    save_provider(admin_client)
    admin_client.app.state.llm = LLMGateway(
        httpx.MockTransport(
            lambda request: httpx.Response(
                upstream_status,
                json={"error": API_KEY},
                headers={"Location": "https://evil.example"},
            )
        )
    )
    response = admin_client.post(
        "/api/admin/chat", json={"messages": [{"role": "user", "content": "Bonjour"}]}
    )
    assert response.status_code == 502
    assert API_KEY not in response.text and "evil.example" not in response.text


@pytest.mark.parametrize(
    "kind,expected",
    [("timeout", 504), ("connection", 502), ("malformed", 502), ("empty", 502), ("oversized", 502)],
)
def test_provider_failures_are_actionable(admin_client, kind, expected):
    sign_in(admin_client)
    save_provider(admin_client)

    def upstream(request):
        if kind == "timeout":
            raise httpx.ReadTimeout(API_KEY)
        if kind == "connection":
            raise httpx.ConnectError(API_KEY)
        if kind == "malformed":
            return httpx.Response(200, content=b"not JSON")
        if kind == "oversized":
            return httpx.Response(200, content=b"x" * (2 * 1024 * 1024 + 1))
        return httpx.Response(200, json={"choices": [{"message": {"content": None}}]})

    admin_client.app.state.llm = LLMGateway(httpx.MockTransport(upstream))
    response = admin_client.post(
        "/api/admin/chat", json={"messages": [{"role": "user", "content": "Bonjour"}]}
    )
    assert response.status_code == expected
    assert API_KEY not in response.text


def test_chat_limits_and_unconfigured_provider(admin_client):
    sign_in(admin_client)
    valid = {"messages": [{"role": "user", "content": "Bonjour"}]}
    assert admin_client.post("/api/admin/chat", json=valid).status_code == 409
    for messages in (
        [],
        [{"role": "system", "content": "x"}],
        [{"role": "user", "content": " "}],
        [{"role": "user", "content": "x" * 4001}],
        valid["messages"] * 41,
    ):
        assert admin_client.post("/api/admin/chat", json={"messages": messages}).status_code == 422
    save_provider(admin_client)
    for _ in range(9):
        admin_client.app.state.admin_store.rate_limit("chat:global", 10, 60)
    assert admin_client.post("/api/admin/chat", json=valid).status_code == 429


def test_validation_never_reflects_secrets_and_request_size_is_bounded(admin_client):
    sign_in(admin_client)
    secret = API_KEY + "\ninvalid"
    response = admin_client.put(
        "/api/admin/provider", json={"provider": "openai", "model": "ok", "api_key": secret}
    )
    assert response.status_code == 422 and API_KEY not in response.text
    oversized = admin_client.post("/api/admin/chat", content=(b"x" * 160000 for _ in range(2)))
    assert oversized.status_code == 413
    assert oversized.headers["cache-control"] == "no-store"


def test_configuration_and_key_recovery(admin_settings, admin_client):
    for changes in (
        {"admin_db_path": "relative"},
        {"secret_key": "invalid"},
        {"admin_origin": "http://public.example"},
        {"admin_origin": ORIGIN + "/"},
        {"admin_password": "short"},
        {"admin_username": "ab"},
    ):
        with pytest.raises(ValidationError):
            Settings(**{**admin_settings.model_dump(), **changes}, _env_file=None)
    sign_in(admin_client)
    save_provider(admin_client)
    wrong_key = admin_settings.model_copy(
        update={
            "secret_key": Settings(
                secret_key=Fernet.generate_key().decode(), _env_file=None
            ).secret_key
        }
    )
    with pytest.raises(ValueError, match="ne déchiffre"):
        create_app(wrong_key)
    # Removing bootstrap credentials after setup does not reset the stored account.
    without_bootstrap = Settings(
        **{**admin_settings.model_dump(), "admin_password": ""}, _env_file=None
    )
    assert create_app(without_bootstrap).state.admin_store.account()["username"] == "thibault"


def test_stale_credentials_cannot_create_session_after_account_change(admin_client):
    store = admin_client.app.state.admin_store
    old = store.account()
    assert store.update_account("new-admin", old["password_hash"], old)
    assert store.new_session("", old) is None
    assert not store.update_account("stale-rename", old["password_hash"], old)


def test_local_recovery_preserves_provider_and_revokes_sessions(
    admin_settings, admin_client, monkeypatch, capsys
):
    sign_in(admin_client)
    save_provider(admin_client)
    monkeypatch.setattr(reset, "Settings", lambda: admin_settings)
    monkeypatch.setattr("builtins.input", lambda prompt: "recovered-admin")
    password = "recovered-test-password"
    monkeypatch.setattr(reset.getpass, "getpass", lambda prompt: password)
    reset.main()
    output = capsys.readouterr().out
    assert password not in output and API_KEY not in output
    assert admin_client.get("/api/admin/session").status_code == 401
    sign_in(admin_client, "recovered-admin", password)
    assert admin_client.app.state.admin_store.provider(decrypt=True)["api_key"] == API_KEY


def test_only_one_provider_call_can_run_at_a_time(admin_client):
    sign_in(admin_client)
    save_provider(admin_client)

    async def concurrent_requests():
        started, finish = asyncio.Event(), asyncio.Event()
        calls = 0

        async def upstream(request):
            nonlocal calls
            calls += 1
            started.set()
            await finish.wait()
            return httpx.Response(200, json={"choices": [{"message": {"content": "Bonjour"}}]})

        admin_client.app.state.llm = LLMGateway(httpx.MockTransport(upstream))
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=admin_client.app),
            base_url=ORIGIN,
            headers={"Origin": ORIGIN, "X-CSRF-Token": admin_client.headers["X-CSRF-Token"]},
            cookies={COOKIE_NAME: admin_client.cookies.get(COOKIE_NAME)},
        ) as client:
            body = {"messages": [{"role": "user", "content": "Bonjour"}]}
            first = asyncio.create_task(client.post("/api/admin/chat", json=body))
            try:
                await asyncio.wait_for(started.wait(), timeout=5)
                second = await client.post("/api/admin/chat", json=body)
                assert second.status_code == 429
                assert calls == 1
            finally:
                finish.set()
                response = await first
            assert response.status_code == 200

    asyncio.run(concurrent_requests())


def test_sensitive_pages_stay_noindex_when_public_indexing_enabled(admin_settings):
    settings = admin_settings.model_copy(update={"indexable": True})
    with TestClient(create_app(settings), base_url=ORIGIN) as client:
        for path in ("/admin", "/api/admin/session"):
            assert client.get(path).headers["x-robots-tag"] == "noindex, nofollow"
        assert "x-robots-tag" not in client.get("/").headers
