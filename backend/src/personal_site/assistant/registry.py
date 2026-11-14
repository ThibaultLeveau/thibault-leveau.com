"""Contrats de génération dérivés du catalogue, sans copie des champs du studio."""

from copy import deepcopy
from typing import Annotated, get_args

from pydantic import Field, create_model

from personal_site.assistant.contracts import Question
from personal_site.content.catalog import list_fields, target
from personal_site.content.schemas import LABELS, MODELS, Model
from personal_site.content.validation import ContentError

FAMILIES = {
    "profiles": "profile",
    **dict.fromkeys(("experiences", "educations", "certifications", "awards"), "career"),
    **dict.fromkeys(("projects", "skills", "technologies"), "expertise"),
    "services": "services",
    **dict.fromkeys(("posts", "publications", "testimonials"), "editorial"),
    **dict.fromkeys(("organizations", "taxonomies", "media"), "library"),
}
PRIVATE_FIELDS = {"private_notes", "consent_note"}
PendingReference = Annotated[str, Field(pattern=r"^@[a-z][a-z0-9_]{0,39}$")]


def describe(kind: str):
    return {
        "kind": kind,
        "label": LABELS[kind][0],
        "description": LABELS[kind][1],
        "fields": {
            name: {
                "label": f.title,
                "section": (f.json_schema_extra or {}).get("section"),
                "target": target(kind, name),
            }
            for name, f in MODELS[kind].model_fields.items()
        },
    }


def output_model(kind: str, names: list[str], include_private: bool):
    """Only requested fields may be emitted. Omitted fields are never reset to defaults."""
    if (
        not names
        or len(set(names)) != len(names)
        or not set(names) <= MODELS[kind].model_fields.keys()
    ):
        raise ContentError("Le plan contient des champs inconnus ou répétés.")
    if not include_private and PRIVATE_FIELDS.intersection(names):
        raise ContentError("Activez le partage des notes privées pour demander leur modification.")
    fields = {}
    lists = list_fields(kind)
    for name in names:
        source = MODELS[kind].model_fields[name]
        info = deepcopy(source)
        info.default, info.default_factory = None, None
        annotation = source.annotation
        if target(kind, name):
            if name in lists:
                child = get_args(annotation)[0]
                reference = create_model(
                    f"{kind}_{name}_Reference",
                    __base__=child,
                    id=(Annotated[int, Field(strict=True, gt=0)] | PendingReference, ...),
                )
                annotation = list[reference]
            else:
                annotation = Annotated[int, Field(strict=True, gt=0)] | PendingReference | None
        fields[name] = (annotation, info)
    patch = create_model(f"{kind}_Fields", __base__=Model, **fields)
    return create_model(
        f"{kind}_Draft",
        __base__=Model,
        changes=(patch, Field(default_factory=patch)),
        questions=(list[Question], Field(default_factory=list, max_length=8)),
        missing=(list[str], Field(default_factory=list, max_length=30)),
        as_draft=(bool, False),
    )


def redact(kind: str, entry: dict, include_private: bool):
    return {k: v for k, v in entry.items() if include_private or k not in PRIVATE_FIELDS}
