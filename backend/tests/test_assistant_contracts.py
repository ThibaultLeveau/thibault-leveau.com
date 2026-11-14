"""Couverture des valeurs de tous les champs et des frontières transactionnelles."""

from typing import Literal, get_args, get_origin

import pytest
from pydantic import ValidationError
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings
from test_admin import sign_in
from test_assistant import apply, propose
from test_content import create, transition, update

from personal_site.assistant.contracts import Operation
from personal_site.assistant.registry import output_model
from personal_site.content.catalog import target
from personal_site.content.schemas import MODELS
from personal_site.content.validation import ContentError, validate


def values_for(schema, refs, kind=None):
    values = {}
    special = {
        "slug": "fiche-complete",
        "language": "fr",
        "currency": "EUR",
        "baseline": "0.000001",
        "result": "12.345678",
        "amount": "1499.90",
        "pricing": "fixed",
        "scope": "tag",
        "validity": "dated",
        "visibility": "private",
        "consent": "pending",
    }
    for name, field in schema.model_fields.items():
        annotation, extra = field.annotation, field.json_schema_extra or {}
        destination = target(kind, name) if kind else None
        if destination:
            ident = refs["domain" if name == "domain_id" else destination]
            if get_origin(annotation) is list:
                child = values_for(get_args(annotation)[0], refs)
                values[name] = [{**child, "id": ident}]
            else:
                values[name] = ident
        elif get_origin(annotation) is list:
            values[name] = [values_for(get_args(annotation)[0], refs)]
        elif extra.get("widget") == "date":
            values[name] = "2025-01"
        elif extra.get("widget") == "url":
            values[name] = "https://example.test/source"
        elif get_origin(annotation) is Literal:
            options = get_args(annotation)
            values[name] = special.get(name, next((v for v in options if v), options[0]))
        elif name in special:
            values[name] = special[name]
        elif annotation is bool:
            values[name] = False
        elif annotation is int or name in {"id", "team_size"}:
            values[name] = 7
        else:
            values[name] = f"Valeur explicite {name}"
    if kind == "media":
        values["media"] = []  # An asset cannot contain other assets (existing domain rule).
    if kind == "educations":
        values["result"] = "earned"
    return values


def test_all_403_fields_and_nested_values_survive_typed_proposals(admin_client):
    c = admin_client
    sign_in(c)
    records = {
        kind: create(
            c,
            kind,
            **(
                {"external_url": "https://example.test/image"}
                if kind == "media"
                else {"scope": "tag"}
                if kind == "taxonomies"
                else {}
            ),
        )
        for kind in MODELS
    }
    refs = {k: r["id"] for k, r in records.items()}
    refs["domain"] = create(c, "taxonomies", title="Domaine", scope="skill_domain")["id"]
    covered = 0
    for kind, model in MODELS.items():
        record = c.get(f"/api/admin/content/{kind}/{refs[kind]}").json()
        values = values_for(model, refs, kind)
        patch = output_model(kind, list(model.model_fields), True).model_validate(
            {"changes": values}
        )
        changes = patch.changes.model_dump(exclude_unset=True)
        proposal = propose(
            c,
            [
                Operation(
                    key="fiche",
                    kind=kind,
                    entry_id=record["id"],
                    version=record["version"],
                    changes=changes,
                )
            ],
        )
        result = apply(c, proposal)
        assert result.status_code == 200, result.text
        saved = c.get(f"/api/admin/content/{kind}/{record['id']}").json()
        assert saved["entry"] == validate(kind, values)
        covered += len(changes)
    assert covered == sum(len(m.model_fields) for m in MODELS.values()) == 403


def test_omission_is_distinct_from_null_and_empty_lists():
    schema = output_model("projects", ["title", "skills", "team_size", "organization_id"], False)
    assert schema.model_validate({"changes": {}}).changes.model_dump(exclude_unset=True) == {}
    valid = {"skills": [], "team_size": None, "organization_id": None}
    assert schema.model_validate({"changes": valid}).changes.model_dump(exclude_unset=True) == valid
    for name in ("title", "skills"):
        with pytest.raises(ValidationError):
            schema.model_validate({"changes": {name: None}})


def test_reference_changes_and_explicit_ready_downgrade(admin_client):
    c = admin_client
    sign_in(c)
    skill = create(c, "skills", title="Référence")
    p = propose(
        c,
        [
            Operation(
                key="p",
                kind="projects",
                changes={"title": "Projet", "skills": [{"id": skill["id"]}]},
            )
        ],
    )
    assert update(c, skill, title="Autre signification").status_code == 200
    assert apply(c, p).status_code == 409
    profile = create(c, "profiles", title="Alex", profession="Ingénieur", summary="Présentation")
    profile = transition(c, profile, "ready").json()
    op = Operation(
        key="profil",
        kind="profiles",
        entry_id=profile["id"],
        version=profile["version"],
        changes={"profession": ""},
    )
    with pytest.raises(ContentError):
        propose(c, [op])
    p = propose(c, [op.model_copy(update={"as_draft": True})])
    assert p["items"][0]["status_before"] == "ready"
    assert p["items"][0]["status_after"] == "draft"
    assert apply(c, p).json()["result"][0]["status"] == "draft"


def test_media_source_cannot_be_fabricated_or_changed(admin_client):
    c = admin_client
    sign_in(c)
    with pytest.raises(ContentError):
        propose(
            c, [Operation(key="file", kind="media", changes={"title": "Inventé", "source": "file"})]
        )

    media = create(c, "media", external_url="https://example.test/image")
    with pytest.raises(ContentError):
        propose(
            c,
            [
                Operation(
                    key="file",
                    kind="media",
                    entry_id=media["id"],
                    version=media["version"],
                    changes={"source": "file", "external_url": ""},
                )
            ],
        )


def test_reciprocal_changes_are_visible_versioned_and_receipted(admin_client):
    c = admin_client
    sign_in(c)
    service = create(c, "services", title="Offre")
    p = propose(
        c,
        [
            Operation(
                key="p",
                kind="projects",
                changes={
                    "title": "Réalisation",
                    "services": [{"id": service["id"], "context": "Preuve"}],
                },
            )
        ],
    )
    inverse = next(item for item in p["items"] if item["related"])
    assert inverse["id"] == service["id"]
    assert inverse["changes"][0]["field"] == "projects"
    assert inverse["changes"][0]["before"] == []
    assert inverse["changes"][0]["after"][0]["context"] == "Preuve"
    result = apply(c, p).json()
    assert {row["kind"] for row in result["result"]} == {"projects", "services"}
