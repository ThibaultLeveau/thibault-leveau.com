"""Variantes textuelles normalisées. Les faits, identités et relations restent partagés."""

import hashlib
import json
from copy import deepcopy

from personal_site.content.catalog import list_fields
from personal_site.content.schemas import MODELS
from personal_site.content.validation import ContentError, completeness, validate
from personal_site.i18n import schema_text, tr

LANGUAGES = ("fr", "en")
COMMON = "title summary body seo_title seo_description"
PERIOD = "date_note"
CONTRIBUTION = "team"
# Registre fermé : un nouveau champ reste partagé jusqu'à une décision explicite.
TEXT_FIELDS = {
    "projects": (
        f"{PERIOD} {CONTRIBUTION} problem objectives audience constraints "
        "role authority outcome_note lessons next_steps"
    ),
    "experiences": f"{PERIOD} {CONTRIBUTION} organization_alias department contract working_time",
    "skills": "level",
    "technologies": "",
    "educations": f"{PERIOD} domain level duration program",
    "certifications": "category",
    "services": (
        "value_proposition audience problem included excluded prerequisites "
        "duration availability terms contact_label"
    ),
    "posts": "",
    "publications": "role event duration",
    "testimonials": "quote author_role relationship source",
    "awards": "category",
    "profiles": "profession tagline public_location availability",
    "organizations": "alias industry",
    "taxonomies": "",
    "media": "credit license duration",
}
ROW_FIELDS = {
    "Line": "text",
    "Link": "label",
    "Location": "label city region country",
    "Reference": "context",
    "TechnologyReference": "context",
    "MediaReference": "context alt caption transcript",
    "Metric": "label unit period context",
    "Package": "name scope unit tax_note",
    "FAQ": "question answer",
    "Language": "name level",
    "OrganizationRole": "",
}


def digest(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def fingerprint(entry):
    return digest(
        {
            k: v
            for k, v in entry.items()
            if k
            not in {
                "private_notes",
                "consent_note",
                "visibility",
                "featured",
                "sort_order",
                "slug",
                "canonical_url",
            }
        }
    )


def fields(kind, entry):
    for name in (COMMON + " " + TEXT_FIELDS[kind]).split():
        yield name, entry[name], "", MODELS[kind].model_fields[name]
    for name, child in list_fields(kind).items():
        for index, row in enumerate(entry[name]):
            # A changed/reordered row must never inherit the text of another row.
            anchor = digest(row)
            for field in ROW_FIELDS[child.__name__].split():
                yield f"{name}.{index}.{field}", row[field], anchor, child.model_fields[field]


def assign(entry, path, value):
    parts = path.split(".")
    if len(parts) == 1:
        entry[path] = value
    else:
        entry[parts[0]][int(parts[1])][parts[2]] = value


def shared(kind, entry):
    result = deepcopy(entry)
    for path, _, _, _ in fields(kind, entry):
        assign(result, path, "")
    result.pop("language")
    return result


def localize(db, record, language=None):
    original = record["entry"]
    source = original["language"]
    language = language or source
    variants = {
        r["language"]: dict(r)
        for r in db.execute("SELECT * FROM content_localizations WHERE entry_id=?", (record["id"],))
    }
    states = {
        code: (
            record["status"]
            if code == source
            else "stale"
            if variants.get(code, {}).get("stale")
            else variants.get(code, {}).get("state", "missing")
        )
        for code in LANGUAGES
    }
    result = deepcopy(record)
    values = (
        {
            r["path"]: r
            for r in db.execute(
                "SELECT path, value, anchor FROM content_localized_values WHERE "
                "entry_id=? AND language=?",
                (record["id"], language),
            )
        }
        if language != source
        else {}
    )
    descriptions = []
    reused = set()
    for path, value, anchor, definition in fields(record["kind"], original):
        translated = values.get(path)
        reusable = translated is not None and translated["anchor"] == anchor
        if language != source and reusable:
            reused.add(path)
            assign(result["entry"], path, translated["value"])
        top = path.split(".")[0]
        descriptions.append(
            {
                "path": path,
                "source": value,
                "label": schema_text(definition.title),
                "section": (MODELS[record["kind"]].model_fields[top].json_schema_extra or {}).get(
                    "section", "essential"
                ),
                "translated": language == source or reusable,
                "max_length": next(
                    (m.max_length for m in definition.metadata if getattr(m, "max_length", None)),
                    100000,
                ),
            }
        )
    result["entry"]["language"] = language
    result["localization"] = {
        "language": language,
        "source_language": source,
        "states": states,
        "fields": descriptions,
        "unmatched_texts": [
            {"path": path, "value": value["value"]}
            for path, value in values.items()
            if path not in reused and value["value"]
        ],
    }
    return result


def write_translation(store, db, kind, entry_id, data, *, version, language, as_draft=False):
    current = store.read(db, kind, entry_id)
    source = current["entry"]
    if current["version"] != version:
        raise ContentError(tr("errors.entryConflict"), status=409)
    if current["status"] == "archived":
        raise ContentError(tr("errors.restoreFirst"), status=409)
    if language not in LANGUAGES or language == source["language"]:
        raise ContentError(tr("errors.translationLanguage"))
    data = validate(kind, {**data, "language": language})
    if shared(kind, data) != shared(kind, source):
        raise ContentError(tr("errors.translationShared"), status=409)
    if not as_draft and current["status"] == "ready":
        natures = {r["id"]: r["nature"] for r in db.execute("SELECT id, nature FROM media_assets")}
        errors = completeness(kind, data, natures)
        if errors:
            raise ContentError(tr("errors.entryIncomplete"), errors=errors)
    db.execute(
        "INSERT INTO content_localizations VALUES (?, ?, ?, 0, ?) "
        "ON CONFLICT(entry_id, language) DO UPDATE SET state=excluded.state, stale=0, "
        "source_hash=excluded.source_hash",
        (entry_id, language, "draft" if as_draft else "ready", fingerprint(source)),
    )
    db.execute(
        "DELETE FROM content_localized_values WHERE entry_id=? AND language=?", (entry_id, language)
    )
    translated = {p: value for p, value, _, _ in fields(kind, data)}
    db.executemany(
        "INSERT INTO content_localized_values VALUES (?, ?, ?, ?, ?)",
        [
            (entry_id, language, path, translated[path], anchor)
            for path, _, anchor, _ in fields(kind, source)
        ],
    )
    db.execute(
        "UPDATE content_entries SET version=version+1, "
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
        (entry_id,),
    )
    return entry_id


def invalidate(db, ident):
    db.execute("UPDATE content_localizations SET stale=1 WHERE entry_id=?", (ident,))
