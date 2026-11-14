"""Primitives de sécurité ; aucun secret n'est journalisé."""

import base64
import hashlib
import hmac
import secrets

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

SESSION_SECONDS = 12 * 60 * 60
COOKIE_NAME = "site_admin_session"
COOKIE_PATH = "/api/admin"


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=2**15, r=8, p=3, maxmem=64 * 1024 * 1024, dklen=32
    )
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def password_matches(password: str, stored: str) -> bool:
    try:
        algorithm, salt, _ = stored.split("$")
        if algorithm != "scrypt":
            return False
        return hmac.compare_digest(password_hash(password, base64.b64decode(salt)), stored)
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AdminBodyLimit:
    """Limit request bodies before JSON parsing, including chunked transfers."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if (
            scope["type"] != "http"
            or not scope["path"].startswith("/api/admin/")
            or scope["method"] not in {"POST", "PUT", "PATCH"}
        ):
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > 256 * 1024:
                response = JSONResponse({"detail": "La requête dépasse 256 Kio."}, status_code=413)
                return await response(scope, receive, send)
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
