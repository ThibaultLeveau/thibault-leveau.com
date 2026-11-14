"""Registre fermé des tables et des formulaires ; aucun identifiant SQL ne vient du client."""

from typing import get_args, get_origin

from personal_site.content.schemas import LABELS, MODELS, Entry

COMMON = {
    name: info
    for name, info in Entry.model_fields.items()
    if get_origin(info.annotation) is not list
}


def table(kind):
    if kind not in MODELS:
        raise KeyError(kind)
    return "media_assets" if kind == "media" else kind


def scalar_fields(kind):
    return {
        name: info
        for name, info in MODELS[kind].model_fields.items()
        if name not in COMMON and get_origin(info.annotation) is not list
    }


def list_fields(kind):
    return {
        name: get_args(info.annotation)[0]
        for name, info in MODELS[kind].model_fields.items()
        if get_origin(info.annotation) is list
    }


def target(kind, name):
    return (MODELS[kind].model_fields[name].json_schema_extra or {}).get("target")


# Both editors use the same association, including its role/context. Separate order per side.
PAIRS = {
    ("projects", "experiences"): "project_experiences",
    ("projects", "educations"): "project_educations",
    ("projects", "services"): "project_services",
    ("projects", "testimonials"): "project_testimonials",
    ("services", "testimonials"): "service_testimonials",
}


def relation(kind, name):
    if name in {"skills", "technologies", "media", "tags"}:
        return (f"entry_{name}", "entry_id", "ref_id", "position_a")
    if (kind, name) in PAIRS:
        return (PAIRS[kind, name], "entry_id", "ref_id", "position_a")
    if (name, kind) in PAIRS:
        return (PAIRS[name, kind], "ref_id", "entry_id", "position_b")
    return (f"{kind}_{name}", "entry_id", "ref_id", "position_a")


def catalog():
    return {
        kind: {
            "label": LABELS[kind][0],
            "description": LABELS[kind][1],
            "schema": model.model_json_schema(),
        }
        for kind, model in MODELS.items()
    }
