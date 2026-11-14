import io

import pytest
from PIL import Image
from public_fixtures import seed_public
from test_admin import admin_client as admin_client
from test_admin import admin_settings as admin_settings

from personal_site.content.public import PAGES, PATHS, PublicContent


@pytest.fixture
def populated(admin_client):
    return admin_client, seed_public(admin_client.app)


@pytest.mark.parametrize("kind", PATHS)
def test_public_collection_details_routes_and_private_fields(populated, kind):
    client, records = populated
    listing = client.get("/api/public/entries", params={"kind": kind})
    assert listing.status_code == 200
    item = listing.json()["items"][0]
    assert item["id"] == records[kind]["id"]
    assert "body" not in item and "private_notes" not in item
    detail = client.get(f"/api/public/entries/{kind}/{item['id']}")
    assert detail.status_code == 200
    assert "SECRET" not in detail.text
    assert not {"version", "status", "errors", "usages"} & detail.json().keys()
    for method in ("GET", "HEAD"):
        response = client.request(method, item["url"])
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
    assert client.get(item["url"]).headers["x-robots-tag"] == "noindex, nofollow"
    old = client.get(item["url"].rsplit("/", 1)[0] + "/ancien-nom", follow_redirects=False)
    assert old.status_code == 308 and old.headers["location"] == item["url"]
    store = client.app.state.content_store
    current = store.get(kind, item["id"])
    store.transition(kind, item["id"], current["version"], "draft")
    assert client.get(f"/api/public/entries/{kind}/{item['id']}").status_code == 404
    assert client.get(item["url"]).status_code == 404
    assert client.get("/api/public/entries", params={"kind": kind}).json()["total"] == 0


def test_private_archive_relations_search_and_metadata(populated):
    client, records = populated
    store = client.app.state.content_store
    skill = store.get("skills", records["skills"]["id"])
    store.save(
        "skills",
        {**skill["entry"], "visibility": "private", "title": "SECRET-SKILL"},
        entry_id=skill["id"],
        version=skill["version"],
    )
    public = PublicContent(store)
    for kind, record in records.items():
        if kind == "skills":
            continue
        assert "SECRET" not in str(public.detail(kind, record["id"]))
    assert client.get("/api/public/entries?q=SECRET").json()["total"] == 0
    assert client.get(f"/api/public/entries?related={skill['id']}").status_code == 404
    assert client.get("/api/public/home").status_code == 200
    assert "SECRET" not in client.get("/api/public/home").text
    post = store.get("posts", records["posts"]["id"])
    store.transition("posts", post["id"], post["version"], "archived")
    assert client.get("/api/public/entries?kind=posts").json()["total"] == 0


def test_anonymity_every_surface_and_consent(populated):
    client, records = populated
    store = client.app.state.content_store
    for kind, flag in [
        ("organizations", {"alias": "Organisation confidentielle"}),
        ("testimonials", {"anonymous": True}),
    ]:
        record = store.get(kind, records[kind]["id"])
        store.save(
            kind,
            {
                **record["entry"],
                "title": "SECRET-NAME",
                "slug": "secret-name",
                "summary": "SECRET-SUMMARY",
                "body": "SECRET-BODY",
                "seo_title": "SECRET-SEO",
                "links": [{"label": "SECRET-LINK", "url": "https://example.test"}],
                **flag,
            },
            entry_id=record["id"],
            version=record["version"],
        )
        assert "SECRET" not in client.get(f"/api/public/entries?kind={kind}").text
        detail = client.get(f"/api/public/entries/{kind}/{record['id']}")
        assert "SECRET" not in detail.text
        assert "SECRET" not in client.get(detail.json()["url"]).text
        assert client.get(f"/api/public/entries?related={record['id']}").json()["total"] == 0
    assert client.get("/api/public/entries?q=SECRET").json()["total"] == 0
    testimonial = records["testimonials"]
    # Defense in depth for a consent change independent of the editorial transition.
    with store.admin.connect() as db:
        db.execute("UPDATE testimonials SET consent = 'refused' WHERE id = ?", (testimonial["id"],))
    assert client.get(f"/api/public/entries/testimonials/{testimonial['id']}").status_code == 404


def test_experience_alias_not_recoverable_through_reverse_relations(populated):
    client, records = populated
    store = client.app.state.content_store
    exp = store.get("experiences", records["experiences"]["id"])
    store.save(
        "experiences",
        {**exp["entry"], "organization_alias": "Client confidentiel"},
        entry_id=exp["id"],
        version=exp["version"],
    )
    detail = client.get(f"/api/public/entries/experiences/{exp['id']}").json()
    assert detail["entry"]["organization_id"] is None
    related = client.get(f"/api/public/entries?related={records['organizations']['id']}").json()
    assert exp["id"] not in [item["id"] for item in related["items"]]


def test_media_and_derivatives_recheck_public_usage(populated):
    client, records = populated
    ident = records["media"]["id"]
    base = f"/api/public/media/{ident}"
    assert client.get(base + "/file").status_code == 200
    response = client.get(base + "/image?width=480")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    with Image.open(io.BytesIO(response.content)) as image:
        assert max(image.size) <= 480 and image.format == "WEBP"
    assert client.get(base + "/image?width=9000").status_code == 422
    store = client.app.state.content_store
    project = store.get("projects", records["projects"]["id"])
    store.save(
        "projects",
        {**project["entry"], "media": [{"id": ident, "role": "private_proof"}]},
        entry_id=project["id"],
        version=project["version"],
    )
    for suffix in ("/file", "/image?width=480"):
        assert client.get(base + suffix).status_code == 404
        assert client.head(base + suffix).status_code == 404
    assert client.get("/api/public/entries?kind=media").json()["total"] == 0
    assert client.get(f"/api/public/entries/media/{ident}").status_code == 404


def test_private_proof_relation_hidden_even_when_file_has_another_public_use(populated):
    client, records = populated
    store = client.app.state.content_store
    media_id = records["media"]["id"]
    post = store.get("posts", records["posts"]["id"])
    store.save(
        "posts",
        {**post["entry"], "media": [{"id": media_id, "role": "private_proof"}]},
        entry_id=post["id"],
        version=post["version"],
    )
    public = client.get(f"/api/public/entries/media/{media_id}").json()
    assert post["id"] not in [item["id"] for item in public["related"]]
    listed = client.get(f"/api/public/entries?related={media_id}").json()
    assert post["id"] not in [item["id"] for item in listed["items"]]
    assert client.get(f"/api/public/media/{media_id}/file").status_code == 200


def test_pagination_filters_and_invalid_inputs(populated):
    client, records = populated
    store = client.app.state.content_store
    for index in range(14):
        record = store.save(
            "technologies",
            {
                "title": f"Écosystème {index:02}",
                "family": "tool",
                "body": "Exemple",
                "visibility": "public",
            },
        )
        store.transition("technologies", record["id"], record["version"], "ready")
    first = client.get(
        "/api/public/entries?kind=technologies&q=ecosysteme&limit=10&sort=title"
    ).json()
    second = client.get(
        "/api/public/entries?kind=technologies&q=ecosysteme&limit=10&sort=title&page=2"
    ).json()
    assert first["total"] == second["total"] == 14
    assert len(first["items"]) == 10 and len(second["items"]) == 4
    assert not {i["id"] for i in first["items"]} & {i["id"] for i in second["items"]}
    for query in ("page=0", "limit=49", "sort=sql", "q=" + "a" * 161):
        assert client.get("/api/public/entries?" + query).status_code == 422
    assert client.get("/api/public/entries?kind=invalid").status_code == 404
    assert client.get("/api/public/entries?q=%25").json()["total"] == 0
    related = client.get(
        f"/api/public/entries?kind=projects&related={records['technologies']['id']}"
    ).json()
    assert related["total"] == 1
    assert client.get("/api/public/entries?sort=recent").status_code == 200


def test_disabled_studio_keeps_public_envelope_without_storage(client):
    for path in PAGES:
        assert client.get(path).status_code == 200
    assert client.get("/api/public/entries").json()["total"] == 0
    assert client.get("/api/public/home").json()["profile"] is None
    assert client.get("/api/public/entries/projects/1").status_code == 404
    assert client.get("/projets/1/inconnu").status_code == 404
    assert client.get("/projets/inconnu").status_code == 404
    assert client.get("/api/public/entries/projects/999999999999999999999999").status_code == 404
    redirect = client.get("/projets/?q=atlas", follow_redirects=False)
    assert redirect.status_code == 308 and redirect.headers["location"] == "/projets?q=atlas"


def test_metadata_is_escaped(populated):
    client, records = populated
    store = client.app.state.content_store
    post = store.get("posts", records["posts"]["id"])
    store.save(
        "posts",
        {
            **post["entry"],
            "seo_title": "</title><script>alert(1)</script>",
            "seo_description": '"><script>alert(2)</script>',
        },
        entry_id=post["id"],
        version=post["version"],
    )
    item = PublicContent(store).detail("posts", post["id"])
    html = client.get(item["url"]).text
    assert "<script>alert(" not in html
    assert "&lt;script&gt;" in html
