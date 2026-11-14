"""Contrats fermés partagés par le graphe, l'API et la persistance."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, model_validator

from personal_site.content.schemas import Model

Kind = Literal[
    "projects",
    "experiences",
    "skills",
    "technologies",
    "educations",
    "certifications",
    "services",
    "posts",
    "publications",
    "testimonials",
    "awards",
    "profiles",
    "organizations",
    "taxonomies",
    "media",
]
Family = Literal["profile", "career", "expertise", "services", "editorial", "library"]
Key = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")]


class Style(Model):
    language: str = Field(default="fr", pattern=r"^[a-z]{2,3}(-[A-Z]{2})?$")
    tone: Literal["neutral", "warm", "direct", "formal"] = "neutral"
    technicality: Literal["accessible", "balanced", "expert"] = "balanced"
    detail: Literal["concise", "balanced", "detailed"] = "balanced"
    voice: Literal["first_person", "third_person", "impersonal"] = "first_person"
    audience: str = Field(default="", max_length=300)
    instructions: str = Field(default="", max_length=1500)


class Preferences(Model):
    defaults: Style = Field(default_factory=Style)
    overrides: dict[Family, Style] = Field(default_factory=dict, max_length=6)
    version: int = Field(default=1, ge=1)

    def for_family(self, family: Family) -> Style:
        return self.overrides.get(family, self.defaults)


class Message(Model):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20000)


class Turn(Model):
    request_id: UUID
    thread_id: UUID
    messages: list[Message] = Field(min_length=1, max_length=40)
    include_private_notes: bool = False
    media_ids: list[Annotated[int, Field(strict=True, gt=0)]] = Field(
        default_factory=list, max_length=10
    )

    @model_validator(mode="after")
    def bounded(self):
        if self.messages[-1].role != "user" or sum(len(m.content) for m in self.messages) > 80000:
            raise ValueError("Terminez par une demande ; historique limité à 80 000 caractères.")
        for i, message in enumerate(self.messages):
            if (
                message.role != ("user" if i % 2 == 0 else "assistant")
                or not message.content.strip()
            ):
                raise ValueError(
                    "Les messages non vides doivent alterner utilisateur et assistant."
                )
            if message.role == "user" and len(message.content) > 16000:
                raise ValueError("Le message utilisateur dépasse 16 000 caractères.")
        return self


class Question(Model):
    question: str = Field(min_length=1, max_length=500)
    reason: str = Field(default="", max_length=500)
    fields: list[str] = Field(default_factory=list, max_length=30)


class Task(Model):
    key: Key
    kind: Kind
    entry_id: Annotated[int, Field(strict=True, gt=0)] | None = None
    fields: list[str] = Field(min_length=1, max_length=60)
    brief: str = Field(min_length=1, max_length=4000)


class Plan(Model):
    message: str = Field(min_length=1, max_length=3000)
    questions: list[Question] = Field(default_factory=list, max_length=8)
    tasks: list[Task] = Field(default_factory=list, max_length=12)


class Operation(Model):
    key: Key
    kind: Kind
    entry_id: int | None = None
    version: int | None = None
    changes: dict = Field(max_length=60)
    as_draft: bool = False


class ProposalRequest(Model):
    revision: int = Field(ge=1)


class PreferencesUpdate(Preferences):
    pass
