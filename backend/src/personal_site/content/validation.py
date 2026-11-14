"""Validation structurelle et relecture éditoriale, sans reprendre les valeurs refusées."""

import calendar
import re
import unicodedata
from datetime import date
from urllib.parse import urlsplit

from pydantic import ValidationError

from personal_site.content.schemas import MODELS
from personal_site.i18n import CATALOGS, SCHEMA_KEYS, schema_text, tr


class ContentError(Exception):
    def __init__(self, message, *, status=422, errors=None, usages=None):
        self.message, self.status = message, status
        self.errors, self.usages = errors or [], usages or []


def issue(path, message, code="invalid"):
    return {"path": path, "message": message, "code": code}


def localized_errors(kind, errors):
    """Re-render only known machine errors in persisted proposal snapshots, including old ones.

    Never pass editorial text or model-generated explanations through this compatibility map.
    """
    fixed = {
        value: key
        for messages in CATALOGS.values()
        for key, value in messages.items()
        if key.startswith("errors.") and "{" not in value
    }
    result = []
    for error in errors:
        message = error["message"]
        if message in fixed:
            message = tr(fixed[message])
        else:
            field = MODELS[kind].model_fields.get(error["path"])
            if field and error["code"] == "required_for_ready":
                title_key = SCHEMA_KEYS[field.title]
                known = {
                    tr("errors.requiredField", language=lang, title=tr(title_key, language=lang))
                    for lang in CATALOGS
                }
                if message in known:
                    message = tr("errors.requiredField", title=tr(title_key))
        result.append({**error, "message": message})
    return result


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
            "string_too_long": tr("errors.textLength"),
            "string_too_short": tr("errors.required"),
            "extra_forbidden": tr("errors.unknownField"),
            "literal_error": tr("errors.chooseOption"),
            "too_long": tr("errors.listLength"),
            "string_pattern_mismatch": tr("errors.fieldFormat"),
        }
        raise ContentError(
            tr("errors.checkFields"),
            errors=[
                issue(
                    ".".join(map(str, e["loc"])),
                    messages.get(e["type"], tr("errors.invalidValue")),
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
                    errors.append(issue(path, tr("errors.date"), "date"))
            elif extra.get("widget") == "url" and not safe_url(
                item, contact=key in {"contact_url", "public_contact"}
            ):
                errors.append(
                    issue(
                        path,
                        tr("errors.url"),
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
                    errors.append(issue(end, tr("errors.dateOrder"), "date_order"))
            except ValueError:
                pass  # Reported at the field above.
    if data.get("ongoing") and data.get("end_date"):
        errors.append(issue("end_date", tr("errors.ongoing"), "ongoing"))
    if kind == "certifications":
        if data["issue_unknown"] and data["issue_date"]:
            errors.append(issue("issue_date", tr("errors.knownOrUnknownDate")))
        if data["expiry_date"] and data["validity"] != "dated":
            errors.append(issue("expiry_date", tr("errors.expiryRequired")))
        if data["state"] == "preparing" and data["issue_date"]:
            errors.append(issue("issue_date", tr("errors.certificationPreparing")))
    for flag, dated in (("date_unknown", "event_date"), ("date_unknown", "award_date")):
        if data.get(flag) and data.get(dated):
            errors.append(issue(dated, tr("errors.knownOrUnknownDate")))
    for name, value in data.items():
        if isinstance(value, list):
            ids = [r["id"] for r in value if "id" in r]
            if len(ids) != len(set(ids)):
                errors.append(issue(name, tr("errors.duplicateRelationship"), "duplicate"))
    for index, package in enumerate(data.get("packages", [])):
        if (package["pricing"] == "quote") == bool(package["amount"]):
            errors.append(
                issue(
                    f"packages.{index}.amount",
                    tr("errors.amount"),
                    "amount",
                )
            )
    if kind == "media":
        if data["source"] == "external" and not data["external_url"]:
            errors.append(issue("external_url", tr("errors.mediaUrl")))
        if data["source"] == "file" and data["external_url"]:
            errors.append(issue("external_url", tr("errors.uploadedUrl")))
        if data["media"]:
            errors.append(issue("media", tr("errors.nestedMedia")))
    if errors:
        raise ContentError(tr("errors.checkFields"), errors=errors)
    return data


def completeness(kind, d, media_natures=None):
    errors = []

    def need(key, message=None, condition=None):
        value = d.get(key) if condition is None else condition
        if isinstance(value, list):
            value = any(row.get("text", row.get("name", row.get("role", ""))) for row in value)
        if not value:
            title = schema_text(MODELS[kind].model_fields[key].title)
            errors.append(
                issue(key, message or tr("errors.requiredField", title=title), "required_for_ready")
            )

    if kind == "projects":
        for key in ("nature", "summary", "body", "phase", "role", "responsibilities"):
            need(key)
        need(
            "start_date",
            tr("errors.startRequired"),
            d["start_date"] or d["date_note"],
        )
        if d["phase"] == "completed":
            need(
                "outcomes",
                tr("errors.outcomeRequired"),
                any(r["text"] for r in d["outcomes"])
                or any(m["label"] and m["result"] for m in d["metrics"])
                or d["outcome_note"],
            )
    elif kind == "experiences":
        for key in ("nature", "summary", "responsibilities"):
            need(key)
        need(
            "organization_id",
            tr("errors.organizationRequired"),
            d["organization_id"] or d["organization_alias"],
        )
        need(
            "start_date",
            tr("errors.periodRequired"),
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
            tr("errors.institutionRequired"),
            d["institution_id"] or d["nature"] == "self_taught",
        )
        need(
            "start_date",
            tr("errors.periodExplanation"),
            (d["start_date"] and (d["end_date"] or d["ongoing"])) or d["date_note"],
        )
    elif kind == "certifications":
        need("issuer_id")
        need("state")
        if d["state"] == "earned":
            need(
                "issue_date",
                tr("errors.issueDateRequired"),
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
            tr("errors.dateRequired"),
            d["event_date"] or d["date_unknown"],
        )
        need(
            "publication_url",
            tr("errors.publicationReference"),
            d["publication_url"] or d["identifier"],
        )
    elif kind == "testimonials":
        need("quote")
        need("relationship")
        need(
            "author_name",
            tr("errors.authorRequired"),
            d["author_name"] or d["anonymous"],
        )
        if d["visibility"] == "public" and d["consent"] != "granted":
            errors.append(
                issue(
                    "consent",
                    tr("errors.consentRequired"),
                    "consent",
                )
            )
    elif kind == "awards":
        need("issuer_id")
        need("body")
        need(
            "award_date",
            tr("errors.dateRequired"),
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
                    tr("errors.imageAlternative"),
                    "alternative",
                )
            )
    return errors
