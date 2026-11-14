"""Contrats privés de l'administration : les réponses ne contiennent aucun secret fournisseur."""

import hmac
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from starlette.concurrency import run_in_threadpool

from personal_site.admin.llm import PROVIDERS, ProviderError
from personal_site.admin.security import (
    COOKIE_NAME,
    COOKIE_PATH,
    SESSION_SECONDS,
    password_hash,
    password_matches,
    token_hash,
)
from personal_site.admin.store import AdminStore

router = APIRouter(prefix="/api/admin")


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class Login(Payload):
    username: str = Field(min_length=1, max_length=128)
    password: SecretStr = Field(min_length=1, max_length=128)


class AccountUpdate(Payload):
    username: str = Field(pattern=r"^[A-Za-z0-9_.-]{3,64}$")
    current_password: SecretStr = Field(min_length=1, max_length=128)
    new_password: SecretStr | None = Field(default=None, min_length=12, max_length=128)


class ProviderUpdate(Payload):
    provider: Literal["openai", "anthropic", "mistral"]
    model: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
    api_key: SecretStr | None = Field(default=None, min_length=1, max_length=512)
    clear_api_key: bool = False

    @field_validator("api_key")
    @classmethod
    def validate_key(cls, value):
        if value and any(ord(c) < 33 or ord(c) > 126 for c in value.get_secret_value()):
            raise ValueError("La clé ne doit pas contenir d’espace ou de caractère de contrôle")
        return value

    @model_validator(mode="after")
    def no_conflicting_key(self):
        if self.api_key and self.clear_api_key:
            raise ValueError("Choisissez une nouvelle clé ou sa suppression")
        return self


class Message(Payload):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20000)


class Chat(Payload):
    messages: list[Message] = Field(min_length=1, max_length=40)

    @model_validator(mode="after")
    def bounded_conversation(self):
        if self.messages[-1].role != "user" or self.messages[0].role != "user":
            raise ValueError("La conversation commence et se termine par un message utilisateur")
        if sum(len(m.content) for m in self.messages) > 40000:
            raise ValueError(
                "La conversation dépasse 40 000 caractères ; ouvrez une nouvelle conversation"
            )
        for index, message in enumerate(self.messages):
            if message.role != ("user" if index % 2 == 0 else "assistant"):
                raise ValueError("Les messages doivent alterner utilisateur et assistant")
            if not message.content.strip() or (
                message.role == "user" and len(message.content) > 4000
            ):
                raise ValueError("Le message utilisateur doit contenir entre 1 et 4 000 caractères")
        return self


def get_store(request: Request) -> AdminStore:
    store = request.app.state.admin_store
    if store is None:
        raise HTTPException(
            503, "L’administration n’est pas activée. Consultez le guide de configuration."
        )
    return store


Store = Annotated[AdminStore, Depends(get_store)]


def same_origin(request: Request):
    if request.headers.get("origin") != request.app.state.settings.admin_origin:
        raise HTTPException(403, "Origine de la requête refusée.")


def require_session(request: Request, store: Store):
    session = store.session(request.cookies.get(COOKIE_NAME, ""))
    if not session:
        raise HTTPException(401, "Connectez-vous pour accéder à l’administration.")
    if request.method not in {"GET", "HEAD"}:
        same_origin(request)
        supplied = request.headers.get("x-csrf-token", "")
        if not hmac.compare_digest(supplied.encode(), session["csrf"].encode()):
            raise HTTPException(403, "Session de formulaire invalide. Rechargez la page.")
    return session


Session = Annotated[dict, Depends(require_session)]


def limit(store: AdminStore, bucket: str, count: int, seconds: int):
    retry = store.rate_limit(bucket, count, seconds)
    if retry:
        raise HTTPException(
            429, "Trop de tentatives. Réessayez plus tard.", headers={"Retry-After": str(retry)}
        )


def credentials_limit(request: Request, store: AdminStore):
    limit(store, "credentials:global", 30, 900)
    address = request.client.host if request.client else "unknown"
    limit(store, "credentials:" + token_hash(address), 5, 900)


def clear_cookie(response: Response, request: Request):
    response.delete_cookie(
        COOKIE_NAME,
        path=COOKIE_PATH,
        httponly=True,
        secure=request.app.state.settings.admin_origin.startswith("https://"),
        samesite="strict",
    )


@router.post("/login", dependencies=[Depends(same_origin)])
def login(payload: Login, request: Request, response: Response, store: Store):
    credentials_limit(request, store)
    account = store.account()
    valid_password = password_matches(payload.password.get_secret_value(), account["password_hash"])
    if not valid_password or not hmac.compare_digest(
        payload.username.encode(), account["username"].encode()
    ):
        raise HTTPException(401, "Identifiants incorrects.")
    result = store.new_session(request.cookies.get(COOKIE_NAME, ""), account)
    if result is None:
        raise HTTPException(401, "Le compte a changé. Reconnectez-vous.")
    token, csrf = result
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_SECONDS,
        path=COOKIE_PATH,
        httponly=True,
        secure=request.app.state.settings.admin_origin.startswith("https://"),
        samesite="strict",
    )
    return {"username": account["username"], "csrf_token": csrf}


@router.get("/session")
def session_info(store: Store, session: Session):
    return {"username": store.account()["username"], "csrf_token": session["csrf"]}


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, store: Store, session: Session):
    store.logout(request.cookies.get(COOKIE_NAME, ""))
    clear_cookie(response, request)


@router.put("/account", status_code=204)
def update_account(
    payload: AccountUpdate, request: Request, response: Response, store: Store, session: Session
):
    credentials_limit(request, store)
    account = store.account()
    if not password_matches(payload.current_password.get_secret_value(), account["password_hash"]):
        raise HTTPException(400, "Le mot de passe actuel est incorrect.")
    if payload.username == account["username"] and payload.new_password is None:
        raise HTTPException(400, "Aucune modification à enregistrer.")
    hashed = (
        password_hash(payload.new_password.get_secret_value())
        if payload.new_password
        else account["password_hash"]
    )
    if not store.update_account(payload.username, hashed, account):
        raise HTTPException(409, "Le compte a changé. Reconnectez-vous.")
    clear_cookie(response, request)


@router.get("/provider")
def provider_info(store: Store, session: Session):
    return {**store.provider(), "providers": PROVIDERS}


@router.put("/provider")
def update_provider(payload: ProviderUpdate, store: Store, session: Session):
    try:
        store.save_provider(
            payload.provider,
            payload.model,
            payload.api_key.get_secret_value() if payload.api_key else None,
            payload.clear_api_key,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {**store.provider(), "providers": PROVIDERS}


@router.post("/chat")
async def chat(payload: Chat, request: Request, store: Store, session: Session):
    await run_in_threadpool(limit, store, "chat:global", 10, 60)
    config = await run_in_threadpool(store.provider, decrypt=True)
    if not config["has_api_key"]:
        raise HTTPException(409, "Configurez une clé API dans les réglages AI provider.")
    lock = request.app.state.chat_lock
    if lock.locked():
        raise HTTPException(429, "Une réponse est déjà en cours. Patientez un instant.")
    async with lock:
        try:
            reply = await request.app.state.llm.reply(
                config, [m.model_dump() for m in payload.messages]
            )
        except ProviderError as exc:
            raise HTTPException(exc.status, exc.message) from exc
    return {
        "message": {"role": "assistant", "content": reply},
        "provider": config["provider"],
        "model": config["model"],
    }
