"""Projection publique fermée : aucun contrat privé n'est envoyé au visiteur."""

from personal_site.content.catalog import target
from personal_site.content.localization import localize
from personal_site.content.schemas import LABELS
from personal_site.content.validation import ContentError, normalize, slugify
from personal_site.i18n import current_language, schema_text, tr

PAGES = {
    "/": "Accueil",
    "/projets": "Projets",
    "/parcours": "Parcours",
    "/expertise": "Expertise",
    "/services": "Services",
    "/journal": "Journal",
    "/a-propos": "À propos",
    "/explorer": "Explorer",
}
PATHS = {
    "projects": "projets",
    "experiences": "parcours/experiences",
    "skills": "expertise/competences",
    "technologies": "expertise/technologies",
    "educations": "parcours/formations",
    "certifications": "parcours/certifications",
    "services": "services",
    "posts": "journal/articles",
    "publications": "journal/interventions",
    "testimonials": "a-propos/temoignages",
    "awards": "parcours/distinctions",
    "profiles": "a-propos/profils",
    "organizations": "explorer/organisations",
    "taxonomies": "explorer/categories",
    "media": "explorer/medias",
}
COMMON = (
    "title slug summary body language featured seo_title seo_description links locations media tags"
)
PERIOD = "start_date end_date ongoing date_note"
CONTRIBUTION = "responsibilities actions deliverables outcomes metrics team"
EXPERTISE = "skills technologies"
# Explicit allowlists: new administrative fields are private until reviewed here.
FIELDS = {
    "projects": (
        f"{PERIOD} {CONTRIBUTION} {EXPERTISE} nature open_source phase problem "
        "objectives audience organization_id client_id role authority team_size "
        "outcome_note lessons next_steps experiences educations services "
        "testimonials"
    ),
    "experiences": (
        f"{PERIOD} {CONTRIBUTION} {EXPERTISE} organization_id organization_alias "
        "client_id department nature contract working_time"
    ),
    "skills": "domain_id nature level first_used last_used aliases",
    "technologies": "family website_url documentation_url aliases",
    "educations": (
        f"{PERIOD} {EXPERTISE} institution_id nature domain level duration result program"
    ),
    "certifications": (
        "issuer_id category state issue_date issue_unknown validity expiry_date "
        "verification_url education_id skills"
    ),
    "services": (
        f"{EXPERTISE} value_proposition audience problem benefits included "
        "excluded prerequisites deliverables steps duration delivery_mode "
        "languages availability terms packages faq contact_label contact_url "
        "projects testimonials"
    ),
    "posts": "author_id publication_date revision_date projects services skills",
    "publications": (
        "nature role organizer_id event event_date date_unknown duration online "
        "publication_url identifier projects services skills"
    ),
    "testimonials": (
        "quote author_name anonymous author_role organization_id "
        "testimonial_date relationship projects experiences services"
    ),
    "awards": "issuer_id award_date date_unknown category projects educations",
    "profiles": (
        "profession tagline public_location public_contact availability languages interests"
    ),
    "organizations": "alias roles industry website_url",
    "taxonomies": "scope",
    "media": "nature source external_url credit license duration",
}

# Names used by search come from this sanitized projection, never search_text.
BASE = """
WITH visible AS (
 SELECT c.id, c.kind, c.language AS source_language,
 CASE WHEN l.entry_id IS NOT NULL THEN '{{language}}' ELSE c.language END AS language,
 (c.language = '{{language}}' OR l.entry_id IS NOT NULL) AS translation_available,
 c.featured, c.sort_order,
 CASE WHEN t.anonymous = 1 THEN ?
      WHEN o.alias != '' THEN COALESCE(la.value, o.alias) ELSE COALESCE(lt.value,
 c.title) END AS title,
 CASE WHEN t.anonymous = 1 THEN 'temoignage-anonyme'
      WHEN o.alias != '' THEN 'organisation' ELSE c.slug END AS slug,
 CASE WHEN t.anonymous = 1 OR o.alias != '' THEN '' ELSE COALESCE(ls.value, c.summary)
 END AS summary
 FROM content_entries c
 LEFT JOIN content_localizations l ON l.entry_id=c.id AND l.language='{{language}}'
 AND l.state='ready' AND l.stale=0
 LEFT JOIN content_localized_values lt ON lt.entry_id=l.entry_id AND
 lt.language=l.language AND lt.path='title'
 LEFT JOIN content_localized_values ls ON ls.entry_id=l.entry_id AND
 ls.language=l.language AND ls.path='summary'
 LEFT JOIN content_localized_values la ON la.entry_id=l.entry_id AND
 la.language=l.language AND la.path='alias'
 LEFT JOIN testimonials t ON t.id = c.id
 LEFT JOIN organizations o ON o.id = c.id
 WHERE c.status = 'ready' AND c.visibility = 'public'
 AND (c.kind != 'testimonials' OR t.consent = 'granted')
 AND (c.kind != 'media' OR EXISTS (
   SELECT 1 FROM entry_media em JOIN content_entries p ON p.id = em.entry_id
   LEFT JOIN testimonials pt ON pt.id = p.id
   LEFT JOIN organizations po ON po.id = p.id
   WHERE em.ref_id = c.id AND em.role != 'private_proof'
   AND p.status = 'ready' AND p.visibility = 'public'
   AND (p.kind != 'testimonials' OR (pt.consent = 'granted' AND pt.anonymous = 0))
   AND (p.kind != 'organizations' OR po.alias = '')
 ))
)
"""


def address(item, language=None):
    return (
        f"/{language or current_language.get()}/{PATHS[item['kind']]}/{item['id']}/{item['slug']}"
    )


def missing():
    raise ContentError(tr("errors.contentMissing"), status=404)


class PublicContent:
    def __init__(self, content):
        self.content = content
        self._summary_values = {}

    @property
    def base(self):
        # The context is a closed fr/en code, never a raw request value.
        return BASE.replace("{{language}}", current_language.get())

    def visible(self, db, ident, kind=None):
        if not isinstance(ident, int) or ident < 1 or ident > 9223372036854775807:
            return None
        row = db.execute(
            self.base + "SELECT * FROM visible WHERE id = ?", (tr("public.anonymous"), ident)
        ).fetchone()
        if not row or (kind and row["kind"] != kind):
            return None
        return dict(row)

    def summary_values(self, db, ids):
        missing_ids = set(ids) - self._summary_values.keys()
        if missing_ids:
            self._summary_values.update({ident: {} for ident in missing_ids})
            placeholders = ",".join("?" for _ in missing_ids)
            rows = db.execute(
                "SELECT v.entry_id, v.path, v.value FROM content_localized_values v "
                "JOIN content_localizations l USING(entry_id, language) "
                "WHERE l.language=? AND l.state='ready' AND l.stale=0 "
                f"AND v.entry_id IN ({placeholders}) "
                "AND (v.path IN ('level','credit','license') OR v.path LIKE 'media.%')",
                [current_language.get(), *missing_ids],
            )
            for value in rows:
                self._summary_values[value["entry_id"]][value["path"]] = value["value"]
        return self._summary_values

    def summary(self, db, row, *, cover=True):
        item = {
            key: row[key]
            for key in ("id", "kind", "title", "slug", "summary", "language", "featured")
        }
        item["url"] = address(item)
        item["translation_available"] = bool(row["translation_available"])
        item["source_url"] = address(item, row["source_language"])
        item["featured"] = bool(item["featured"])
        translated = self.summary_values(db, [item["id"]])[item["id"]]
        kind = item["kind"]
        dated = {
            "projects": "start_date",
            "experiences": "start_date",
            "educations": "start_date",
            "certifications": "issue_date",
            "posts": "publication_date",
            "publications": "event_date",
            "awards": "award_date",
        }.get(kind)
        if dated:
            item["date"] = db.execute(
                f'SELECT "{dated}" FROM "{kind}" WHERE id = ?', (item["id"],)
            ).fetchone()[0]
        for field in {
            "taxonomies": ("scope",),
            "technologies": ("family",),
            "skills": ("level",),
            "projects": ("nature", "phase"),
            "publications": ("nature",),
            "certifications": ("state", "expiry_date"),
        }.get(kind, ()):
            item[field] = db.execute(
                f'SELECT "{field}" FROM "{kind}" WHERE id = ?', (item["id"],)
            ).fetchone()[0]
        if "level" in translated:
            item["level"] = translated["level"]
        if kind == "skills":
            domain = db.execute(
                "SELECT domain_id FROM skills WHERE id = ?", (item["id"],)
            ).fetchone()[0]
            domain = self.visible(db, domain) if domain else None
            if domain:
                item["domain"] = domain["title"]
        if cover:
            media = db.execute(
                self.base + "SELECT v.*, em.alt, em.decorative, em.caption, em.position_a, "
                "m.credit, m.license "
                "FROM entry_media em "
                "JOIN visible v ON v.id = em.ref_id JOIN media_assets m ON m.id = v.id "
                "WHERE em.entry_id = ? AND em.role = 'cover' AND m.nature = 'image' "
                "AND m.source = 'file' ORDER BY em.position_a LIMIT 1",
                (tr("public.anonymous"), item["id"]),
            ).fetchone()
            if media and not self.masked(db, row):
                file = db.execute(
                    "SELECT width, height FROM media_files WHERE entry_id = ?", (media["id"],)
                ).fetchone()
                if file:
                    media_text = self.summary_values(db, [media["id"]])[media["id"]]
                    variants = {}
                    for width in (480, 960, 1600):
                        ratio = min(1, width / max(file["width"], file["height"]))
                        actual_width = max(1, round(file["width"] * ratio))
                        variants.setdefault(
                            actual_width,
                            f"/api/public/media/{media['id']}/image?width={width}",
                        )
                    item["cover"] = {
                        "url": f"/api/public/media/{media['id']}/image?width=960",
                        "srcset": ", ".join(f"{url} {width}w" for width, url in variants.items()),
                        "alt": ""
                        if media["decorative"]
                        else translated.get(f"media.{media['position_a']}.alt", media["alt"]),
                        "caption": translated.get(
                            f"media.{media['position_a']}.caption", media["caption"]
                        ),
                        **{key: media_text.get(key, media[key]) for key in ("credit", "license")},
                        **dict(file),
                    }
        return item

    def masked(self, db, row):
        if row["kind"] == "testimonials":
            return bool(
                db.execute(
                    "SELECT anonymous FROM testimonials WHERE id = ?", (row["id"],)
                ).fetchone()[0]
            )
        if row["kind"] == "organizations":
            return bool(
                db.execute("SELECT alias FROM organizations WHERE id = ?", (row["id"],)).fetchone()[
                    0
                ]
            )
        return False

    def public_usages(self, db, row):
        if self.masked(db, row):
            return []
        result = []
        for usage in self.content.usages(db, row["id"]):
            entry = self.visible(db, usage["id"])
            if not entry or self.masked(db, entry):
                continue
            if row["kind"] == "media":
                usage = db.execute(
                    "SELECT role FROM entry_media WHERE entry_id = ? AND ref_id = ?",
                    (entry["id"], row["id"]),
                ).fetchone()
                if not usage or usage["role"] == "private_proof":
                    continue
            if entry["kind"] == "experiences" and row["kind"] == "organizations":
                alias = db.execute(
                    "SELECT organization_alias FROM experiences WHERE id = ?", (entry["id"],)
                ).fetchone()[0]
                if alias:
                    continue
            result.append(entry)
        return result

    def listing(self, *, kind="", query="", page=1, limit=12, sort="selection", related=None):
        if kind and kind not in PATHS:
            missing()
        empty = {"items": [], "total": 0, "page": page, "limit": limit}
        if not self.content:
            if related:
                missing()
            return empty
        with self.content.admin.connect() as db:
            db.execute("BEGIN")
            db.create_function("public_normalize", 1, normalize)
            where, args = ["1"], []
            if kind:
                where.append("v.kind = ?")
                args.append(kind)
            if query:
                where.append("instr(public_normalize(v.title || ' ' || v.summary), ?) > 0")
                args.append(normalize(query))
            if related:
                row = self.visible(db, related)
                if not row:
                    missing()
                # A masked identity cannot be recovered through reverse associations.
                ids = [r["id"] for r in self.public_usages(db, row)]
                where.append("v.id IN (" + ",".join("?" for _ in ids) + ")" if ids else "0")
                args.extend(ids)
            condition = " AND ".join(where)
            total = db.execute(
                self.base + f"SELECT count(*) FROM visible v WHERE {condition}",
                [tr("public.anonymous"), *args],
            ).fetchone()[0]
            order = {
                "selection": "v.featured DESC, v.sort_order, v.id DESC",
                "title": "v.title COLLATE NOCASE, v.id",
                "recent": (
                    "COALESCE(NULLIF(p.publication_date,''), NULLIF(i.event_date,''), "
                    "NULLIF(e.start_date,''), NULLIF(ed.start_date,''), "
                    "NULLIF(pr.start_date,''), NULLIF(c.issue_date,''), "
                    "NULLIF(a.award_date,''), '') DESC, v.id DESC"
                ),
            }[sort]
            joins = (
                ""
                if sort != "recent"
                else (
                    "LEFT JOIN posts p ON p.id=v.id LEFT JOIN publications i ON i.id=v.id "
                    "LEFT JOIN experiences e ON e.id=v.id LEFT JOIN educations ed ON ed.id=v.id "
                    "LEFT JOIN projects pr ON pr.id=v.id LEFT JOIN certifications c ON c.id=v.id "
                    "LEFT JOIN awards a ON a.id=v.id "
                )
            )
            rows = db.execute(
                self.base + f"SELECT v.* FROM visible v {joins} WHERE {condition} "
                f"ORDER BY {order} LIMIT ? OFFSET ?",
                [tr("public.anonymous"), *args, limit, (page - 1) * limit],
            ).fetchall()
            self.summary_values(db, [r["id"] for r in rows])
            return {**empty, "total": total, "items": [self.summary(db, r) for r in rows]}

    def detail(self, kind, ident):
        if not self.content or kind not in PATHS:
            missing()
        with self.content.admin.connect() as db:
            db.execute("BEGIN")
            row = self.visible(db, ident, kind)
            if not row:
                missing()
            raw = self.content.read(db, kind, ident)
            if row["translation_available"]:
                raw = localize(db, raw, current_language.get())
            data = {key: raw["entry"][key] for key in (COMMON + " " + FIELDS[kind]).split()}
            if self.masked(db, row):
                keep = (
                    ("quote", "anonymous", "testimonial_date", "relationship")
                    if kind == "testimonials"
                    else ("alias", "industry", "roles")
                )
                data = {key: data[key] for key in keep}
            data.update({key: row[key] for key in ("title", "slug", "summary", "language")})
            references = {}
            for name in list(data):
                dest = target(kind, name)
                if not dest:
                    continue
                if (
                    kind == "experiences"
                    and name == "organization_id"
                    and data.get("organization_alias")
                ):
                    data[name] = None
                    continue
                value = data[name]
                refs = value if isinstance(value, list) else ([{"id": value}] if value else [])
                allowed = []
                for ref in refs:
                    if ref.get("role") == "private_proof":
                        continue
                    entry = self.visible(db, ref["id"], dest)
                    if not entry:
                        continue
                    references[entry["id"]] = self.summary(db, entry, cover=False)
                    if dest == "media":
                        media = db.execute(
                            "SELECT nature, source, external_url, credit, license "
                            "FROM media_assets WHERE id = ?",
                            (entry["id"],),
                        ).fetchone()
                        file = db.execute(
                            "SELECT width, height FROM media_files WHERE entry_id = ?",
                            (entry["id"],),
                        ).fetchone()
                        references[entry["id"]].update(dict(media))
                        translated = self.summary_values(db, [entry["id"]])[entry["id"]]
                        references[entry["id"]].update(
                            {k: v for k, v in translated.items() if k in {"credit", "license"}}
                        )
                        if file:
                            references[entry["id"]].update(
                                file_url=f"/api/public/media/{entry['id']}/file", **dict(file)
                            )
                    # Context text on a relation to a masked identity may name it.
                    allowed.append({"id": ref["id"]} if self.masked(db, entry) else ref)
                data[name] = (
                    allowed if isinstance(value, list) else (allowed[0]["id"] if allowed else None)
                )
            related = [
                self.summary(db, entry, cover=False) for entry in self.public_usages(db, row)[:12]
            ]
            result = {
                **self.summary(db, row),
                "entry": data,
                "references": references,
                "related": related,
                "expired": raw["derived"]["expired"],
                "available_languages": [
                    raw["localization"]["source_language"]
                    if "localization" in raw
                    else row["source_language"],
                    *[
                        r[0]
                        for r in db.execute(
                            "SELECT language FROM content_localizations WHERE "
                            "entry_id=? AND state='ready' AND stale=0",
                            (ident,),
                        )
                    ],
                ],
            }
            if kind == "media" and raw["file"]:
                result["file"] = {
                    "url": f"/api/public/media/{ident}/file",
                    **{key: raw["file"][key] for key in ("mime", "size", "width", "height")},
                }
            return result

    def home(self):
        profiles = self.listing(kind="profiles", limit=1)["items"]
        return {
            "profile": self.detail("profiles", profiles[0]["id"]) if profiles else None,
            "projects": self.listing(kind="projects", limit=3)["items"],
            "posts": self.listing(kind="posts", limit=3, sort="recent")["items"],
            "services": self.listing(kind="services", limit=3)["items"],
            "skills": self.listing(kind="skills", limit=6)["items"],
            "collections": [
                {"kind": kind, "label": schema_text(LABELS[kind][0])} for kind in PATHS
            ],
        }

    def public_filename(self, kind, ident):
        if not self.content:
            missing()
        with self.content.admin.connect() as db:
            row = self.visible(db, ident, kind)
            if not row:
                missing()
            return slugify(row["title"])
