"""Validation structurelle et relecture éditoriale, sans reprendre les valeurs refusées."""

import calendar
import re
import unicodedata
from datetime import date
from urllib.parse import urlsplit

from pydantic import ValidationError

from personal_site.content.schemas import MODELS


class ContentError(Exception):
    def __init__(self, message, *, status=422, errors=None, usages=None):
        self.message, self.status = message, status
        self.errors, self.usages = errors or [], usages or []


def issue(path, message, code="invalid"):
    return {"path": path, "message": message, "code": code}


def normalize(value):
    return "".join(
        c for c in unicodedata.normalize("NFKD", value).casefold() if not unicodedata.combining(c)
    )


def slugify(value):
    return re.sub(r"[^a-z0-9]+", "-", normalize(value)).strip("-")[:140].rstrip("-") or "fiche"


def date_bounds(value):
    parts = [int(p) for p in value.split("-")]
    year, month, day = (parts + [1, 1])[:3]
    first = date(year, month, day)
    last = (
        date(year, 12, 31)
        if len(parts) == 1
        else (date(year, month, calendar.monthrange(year, month)[1]) if len(parts) == 2 else first)
    )
    return first, last


def safe_url(value, *, contact=False):
    if not value:
        return True
    if any(ord(c) < 33 or ord(c) == 127 for c in value) or "\\" in value:
        return False
    try:
        url = urlsplit(value)
        if contact and url.scheme == "mailto":
            return bool(re.fullmatch(r"[^@\s/?#%]+@[^@\s/?#%]+\.[^@\s/?#%]+", url.path)) and not (
                url.query or url.fragment
            )
        allowed = {"https"} if contact else {"https", "http"}
        return (
            url.scheme in allowed
            and bool(url.hostname)
            and not (url.username or url.password)
            and (url.port is None or url.port > 0)
        )
    except ValueError:
        return False


def validate(kind, payload):
    try:
        model = MODELS[kind].model_validate(payload)
    except ValidationError as exc:
        messages = {
            "string_too_long": "Ce texte dépasse la longueur autorisée.",
            "string_too_short": "Renseignez ce champ.",
            "extra_forbidden": "Ce champ n'appartient pas à cette fiche.",
            "literal_error": "Sélectionnez une valeur proposée.",
            "too_long": "Cette liste dépasse 100 lignes.",
            "string_pattern_mismatch": "Vérifiez le format de ce champ.",
        }
        raise ContentError(
            "Vérifiez les champs indiqués.",
            errors=[
                issue(
                    ".".join(map(str, e["loc"])),
                    messages.get(e["type"], "Valeur invalide."),
                    e["type"],
                )
                for e in exc.errors(include_input=False, include_context=False)
            ],
        ) from None
    data = model.model_dump()
    errors = []

    def walk(value, schema, prefix=""):
        for key, info in schema.model_fields.items():
            item = value[key]
            path = f"{prefix}{key}"
            extra = info.json_schema_extra or {}
            if isinstance(item, list):
                from typing import get_args

                child = get_args(info.annotation)[0]
                for index, row in enumerate(item):
                    walk(row, child, f"{path}.{index}.")
            elif extra.get("widget") == "date" and item:
                try:
                    date_bounds(item)
                except ValueError:
                    errors.append(
                        issue(
                            path, "Utilisez une date réelle : AAAA, AAAA-MM ou AAAA-MM-JJ.", "date"
                        )
                    )
            elif extra.get("widget") == "url" and not safe_url(
                item, contact=key in {"contact_url", "public_contact"}
            ):
                errors.append(
                    issue(
                        path,
                        "Utilisez une URL autorisée, sans identifiants ni caractères de contrôle.",
                        "url",
                    )
                )

    walk(data, type(model))
    for start, end in (
        ("start_date", "end_date"),
        ("first_used", "last_used"),
        ("issue_date", "expiry_date"),
        ("publication_date", "revision_date"),
    ):
        if data.get(start) and data.get(end):
            try:
                if date_bounds(data[end])[1] < date_bounds(data[start])[0]:
                    errors.append(issue(end, "La fin ne peut pas précéder le début.", "date_order"))
            except ValueError:
                pass  # Reported at the field above.
    if data.get("ongoing") and data.get("end_date"):
        errors.append(issue("end_date", "Retirez la fin ou désactivez « En cours ».", "ongoing"))
    if kind == "certifications":
        if data["issue_unknown"] and data["issue_date"]:
            errors.append(issue("issue_date", "Choisissez une date connue ou inconnue."))
        if data["expiry_date"] and data["validity"] != "dated":
            errors.append(issue("expiry_date", "Choisissez une validité avec date d'expiration."))
        if data["state"] == "preparing" and data["issue_date"]:
            errors.append(
                issue("issue_date", "Une certification en préparation n'est pas encore obtenue.")
            )
    for flag, dated in (("date_unknown", "event_date"), ("date_unknown", "award_date")):
        if data.get(flag) and data.get(dated):
            errors.append(issue(dated, "Choisissez une date connue ou inconnue."))
    for name, value in data.items():
        if isinstance(value, list):
            ids = [r["id"] for r in value if "id" in r]
            if len(ids) != len(set(ids)):
                errors.append(issue(name, "Cet objet est déjà associé.", "duplicate"))
    for index, package in enumerate(data.get("packages", [])):
        if (package["pricing"] == "quote") == bool(package["amount"]):
            errors.append(
                issue(
                    f"packages.{index}.amount",
                    "Sur devis : laissez le montant vide. Sinon, indiquez un montant "
                    "positif ou nul.",
                    "amount",
                )
            )
    if kind == "media":
        if data["source"] == "external" and not data["external_url"]:
            errors.append(issue("external_url", "Renseignez le lien du média."))
        if data["source"] == "file" and data["external_url"]:
            errors.append(issue("external_url", "Un fichier téléversé n'a pas d'URL externe."))
        if data["media"]:
            errors.append(issue("media", "Un média ne peut pas contenir d'autres médias."))
    if errors:
        raise ContentError("Vérifiez les champs indiqués.", errors=errors)
    return data


def completeness(kind, d, media_natures=None):
    errors = []

    def need(key, message=None, condition=None):
        value = d.get(key) if condition is None else condition
        if isinstance(value, list):
            value = any(row.get("text", row.get("name", row.get("role", ""))) for row in value)
        if not value:
            title = MODELS[kind].model_fields[key].title
            errors.append(issue(key, message or f"Renseignez « {title} ».", "required_for_ready"))

    if kind == "projects":
        for key in ("nature", "summary", "body", "phase", "role", "responsibilities"):
            need(key)
        need(
            "start_date",
            "Précisez le début ou expliquez pourquoi il est inconnu.",
            d["start_date"] or d["date_note"],
        )
        if d["phase"] == "completed":
            need(
                "outcomes",
                "Décrivez un résultat ou expliquez son absence.",
                any(r["text"] for r in d["outcomes"])
                or any(m["label"] and m["result"] for m in d["metrics"])
                or d["outcome_note"],
            )
    elif kind == "experiences":
        for key in ("nature", "summary", "responsibilities"):
            need(key)
        need(
            "organization_id",
            "Choisissez une organisation ou son nom anonymisé.",
            d["organization_id"] or d["organization_alias"],
        )
        need(
            "start_date",
            "Renseignez une période ou son absence motivée.",
            (d["start_date"] and (d["end_date"] or d["ongoing"])) or d["date_note"],
        )
    elif kind in {"skills", "technologies"}:
        need("body")
        need("domain_id" if kind == "skills" else "family")
    elif kind == "educations":
        for key in ("nature", "domain", "result"):
            need(key)
        need(
            "institution_id",
            "Choisissez un établissement ou l'apprentissage personnel.",
            d["institution_id"] or d["nature"] == "self_taught",
        )
        need(
            "start_date",
            "Renseignez la période ou une explication.",
            (d["start_date"] and (d["end_date"] or d["ongoing"])) or d["date_note"],
        )
    elif kind == "certifications":
        need("issuer_id")
        need("state")
        if d["state"] == "earned":
            need(
                "issue_date",
                "Renseignez l'obtention ou indiquez qu'elle est inconnue.",
                d["issue_date"] or d["issue_unknown"],
            )
            need("validity")
            if d["validity"] == "dated":
                need("expiry_date")
    elif kind == "services":
        for key in (
            "audience",
            "value_proposition",
            "included",
            "deliverables",
            "delivery_mode",
            "contact_label",
            "contact_url",
            "packages",
        ):
            need(key)
    elif kind == "posts":
        for key in ("slug", "summary", "body", "author_id", "language"):
            need(key)
    elif kind == "publications":
        for key in ("nature", "role", "summary"):
            need(key)
        need(
            "event_date",
            "Renseignez la date ou indiquez qu'elle est inconnue.",
            d["event_date"] or d["date_unknown"],
        )
        need(
            "publication_url",
            "Ajoutez un lien ou une référence bibliographique.",
            d["publication_url"] or d["identifier"],
        )
    elif kind == "testimonials":
        need("quote")
        need("relationship")
        need(
            "author_name",
            "Renseignez l'auteur ou choisissez l'anonymat.",
            d["author_name"] or d["anonymous"],
        )
        if d["visibility"] == "public" and d["consent"] != "granted":
            errors.append(
                issue(
                    "consent",
                    "Une autorisation est nécessaire pour une diffusion publique envisagée.",
                    "consent",
                )
            )
    elif kind == "awards":
        need("issuer_id")
        need("body")
        need(
            "award_date",
            "Renseignez la date ou indiquez qu'elle est inconnue.",
            d["award_date"] or d["date_unknown"],
        )
    elif kind == "profiles":
        need("profession")
        need("summary")
    elif kind == "organizations":
        need("roles")
    elif kind == "taxonomies":
        need("scope")
    for index, use in enumerate(d["media"]):
        if (
            use["role"] != "private_proof"
            and (media_natures or {}).get(use["id"]) == "image"
            and not (use["alt"] or use["decorative"])
        ):
            errors.append(
                issue(
                    f"media.{index}.alt",
                    "Décrivez l'image ou indiquez qu'elle est décorative.",
                    "alternative",
                )
            )
    return errors
