"""Projection publique fermée : aucun contrat privé n'est envoyé au visiteur."""

from personal_site.content.catalog import target
from personal_site.content.schemas import LABELS
from personal_site.content.validation import ContentError, normalize, slugify

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
 SELECT c.id, c.kind, c.language, c.featured, c.sort_order,
 CASE WHEN t.anonymous = 1 THEN 'Témoignage anonyme'
      WHEN o.alias != '' THEN o.alias ELSE c.title END AS title,
 CASE WHEN t.anonymous = 1 THEN 'temoignage-anonyme'
      WHEN o.alias != '' THEN 'organisation' ELSE c.slug END AS slug,
 CASE WHEN t.anonymous = 1 OR o.alias != '' THEN '' ELSE c.summary END AS summary
 FROM content_entries c
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


def address(item):
    return f"/{PATHS[item['kind']]}/{item['id']}/{item['slug']}"


def missing():
    raise ContentError("Contenu introuvable.", status=404)


class PublicContent:
    def __init__(self, content):
        self.content = content

    def visible(self, db, ident, kind=None):
        if not isinstance(ident, int) or ident < 1 or ident > 9223372036854775807:
            return None
        row = db.execute(BASE + "SELECT * FROM visible WHERE id = ?", (ident,)).fetchone()
        if not row or (kind and row["kind"] != kind):
            return None
        return dict(row)

    def summary(self, db, row, *, cover=True):
        item = {
            key: row[key]
            for key in ("id", "kind", "title", "slug", "summary", "language", "featured")
        }
        item["url"] = address(item)
        item["featured"] = bool(item["featured"])
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
        if kind == "skills":
            domain = db.execute(
                "SELECT domain_id FROM skills WHERE id = ?", (item["id"],)
            ).fetchone()[0]
            domain = self.visible(db, domain) if domain else None
            if domain:
                item["domain"] = domain["title"]
        if cover:
            media = db.execute(
                BASE + "SELECT v.*, em.alt, em.decorative, em.caption, m.credit, m.license "
                "FROM entry_media em "
                "JOIN visible v ON v.id = em.ref_id JOIN media_assets m ON m.id = v.id "
                "WHERE em.entry_id = ? AND em.role = 'cover' AND m.nature = 'image' "
                "AND m.source = 'file' ORDER BY em.position_a LIMIT 1",
                (item["id"],),
            ).fetchone()
            if media and not self.masked(db, row):
                file = db.execute(
                    "SELECT width, height FROM media_files WHERE entry_id = ?", (media["id"],)
                ).fetchone()
                if file:
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
                        "alt": "" if media["decorative"] else media["alt"],
                        **{key: media[key] for key in ("caption", "credit", "license")},
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
                BASE + f"SELECT count(*) FROM visible v WHERE {condition}", args
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
                BASE + f"SELECT v.* FROM visible v {joins} WHERE {condition} "
                f"ORDER BY {order} LIMIT ? OFFSET ?",
                [*args, limit, (page - 1) * limit],
            ).fetchall()
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
            "collections": [{"kind": kind, "label": LABELS[kind][0]} for kind in PATHS],
        }

    def public_filename(self, kind, ident):
        if not self.content:
            missing()
        with self.content.admin.connect() as db:
            row = self.visible(db, ident, kind)
            if not row:
                missing()
            return slugify(row["title"])
