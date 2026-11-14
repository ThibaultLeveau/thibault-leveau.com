"""SQLite local : compte unique, sessions révocables et clé fournisseur chiffrée."""

import secrets
import sqlite3
import time
from contextlib import contextmanager

from cryptography.fernet import Fernet, InvalidToken

from personal_site.admin.security import SESSION_SECONDS, password_hash, token_hash
from personal_site.config import Settings


class AdminStore:
    def __init__(self, settings: Settings):
        self.path = settings.admin_db_path
        self.cipher = Fernet(settings.secret_key.get_secret_value().encode())
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS account (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    username TEXT NOT NULL, password_hash TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS provider (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    name TEXT NOT NULL, model TEXT NOT NULL, api_key BLOB
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS rate_limits (
                    bucket TEXT PRIMARY KEY, started REAL NOT NULL, count INTEGER NOT NULL
                );
            """)
            if db.execute("SELECT 1 FROM account").fetchone() is None:
                password = settings.admin_password.get_secret_value()
                if not password:
                    raise ValueError("SITE_ADMIN_PASSWORD est requis pour initialiser le compte")
                db.execute(
                    "INSERT INTO account VALUES (1, ?, ?)",
                    (settings.admin_username, password_hash(password)),
                )
            db.execute("INSERT OR IGNORE INTO provider VALUES (1, 'openai', 'gpt-6-luna', NULL)")
            # Detect a lost or replaced encryption key before accepting requests.
            saved = db.execute("SELECT api_key FROM provider WHERE id = 1").fetchone()[0]
            if saved:
                try:
                    self.cipher.decrypt(saved)
                except InvalidToken as exc:
                    raise ValueError(
                        "SITE_SECRET_KEY ne déchiffre pas la clé API enregistrée"
                    ) from exc
        self.path.chmod(0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def account(self):
        with self.connect() as db:
            return dict(db.execute("SELECT * FROM account WHERE id = 1").fetchone())

    def session(self, token: str):
        if not token or len(token) > 128:
            return None
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM sessions WHERE token_hash = ? AND expires > ?",
                (token_hash(token), time.time()),
            ).fetchone()
            return dict(row) if row else None

    def new_session(self, previous: str, expected_account: dict):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            account = db.execute("SELECT * FROM account WHERE id = 1").fetchone()
            if (account["username"], account["password_hash"]) != (
                expected_account["username"],
                expected_account["password_hash"],
            ):
                return None
            db.execute("DELETE FROM sessions WHERE expires <= ?", (time.time(),))
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(previous),))
            db.execute(
                "DELETE FROM sessions WHERE token_hash IN "
                "(SELECT token_hash FROM sessions ORDER BY expires DESC LIMIT -1 OFFSET 19)"
            )
            db.execute(
                "INSERT INTO sessions VALUES (?, ?, ?)",
                (token_hash(token), csrf, time.time() + SESSION_SECONDS),
            )
        return token, csrf

    def logout(self, token: str):
        with self.connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))

    def update_account(self, username: str, hashed_password: str, expected_account: dict) -> bool:
        with self.connect() as db:
            changed = db.execute(
                "UPDATE account SET username = ?, password_hash = ? "
                "WHERE id = 1 AND username = ? AND password_hash = ?",
                (
                    username,
                    hashed_password,
                    expected_account["username"],
                    expected_account["password_hash"],
                ),
            ).rowcount
            if changed:
                db.execute("DELETE FROM sessions")
            return bool(changed)

    def provider(self, *, decrypt=False):
        with self.connect() as db:
            row = dict(db.execute("SELECT * FROM provider WHERE id = 1").fetchone())
        return {
            "provider": row["name"],
            "model": row["model"],
            "has_api_key": bool(row["api_key"]),
            **(
                {"api_key": self.cipher.decrypt(row["api_key"]).decode()}
                if decrypt and row["api_key"]
                else {}
            ),
        }

    def save_provider(self, provider: str, model: str, api_key: str | None, clear: bool):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT name, api_key FROM provider WHERE id = 1").fetchone()
            if provider != old["name"] and not api_key and not clear:
                raise ValueError(
                    "Saisissez une clé pour ce fournisseur ou retirez la clé actuelle."
                )
            encrypted = (
                None
                if clear
                else (self.cipher.encrypt(api_key.encode()) if api_key else old["api_key"])
            )
            db.execute(
                "UPDATE provider SET name = ?, model = ?, api_key = ? WHERE id = 1",
                (provider, model, encrypted),
            )

    def rate_limit(self, bucket: str, limit: int, seconds: int) -> int:
        """Atomically consume an attempt; return Retry-After when exhausted."""
        now = time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM rate_limits WHERE started < ?", (now - 900,))
            row = db.execute("SELECT * FROM rate_limits WHERE bucket = ?", (bucket,)).fetchone()
            if row and row["started"] + seconds > now:
                if row["count"] >= limit:
                    return max(1, int(row["started"] + seconds - now) + 1)
                db.execute("UPDATE rate_limits SET count = count + 1 WHERE bucket = ?", (bucket,))
            else:
                db.execute("INSERT OR REPLACE INTO rate_limits VALUES (?, ?, 1)", (bucket, now))
        return 0
