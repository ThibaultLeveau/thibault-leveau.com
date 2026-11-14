"""Contenus fictifs exclusivement pour les tests ; jamais importés dans l'application."""

from PIL import Image, ImageDraw


def seed_public(app):
    store = app.state.content_store
    records = {}

    def add(kind, title, **fields):
        record = store.save(
            kind,
            {
                "title": title,
                "visibility": "public",
                "summary": f"Présentation de démonstration : {title}.",
                "body": (
                    "## Une intention claire\n\nUn exemple fictif pour vérifier la lecture "
                    "et les interfaces.\n\n## Les choix\n\nLe détail des décisions et des "
                    "apprentissages.\n\n- Un objectif lisible\n- Une mise en œuvre documentée"
                ),
                "private_notes": "SECRET-NOTE",
                **fields,
            },
        )
        record = store.transition(kind, record["id"], record["version"], "ready")
        records[kind] = record
        return record["id"]

    category = add("taxonomies", "Conception de produits", scope="skill_domain")
    org = add("organizations", "Atelier Démonstration", roles=[{"role": "employer"}])
    profile = add(
        "profiles",
        "Thibault Leveau",
        profession="Concevoir. Développer. Transmettre.",
        tagline="Des interfaces utiles, des systèmes solides et le goût du détail.",
        public_location="France · Démonstration",
        public_contact="mailto:demo@example.test",
        languages=[{"name": "Français", "level": "Courant"}],
        interests=[{"text": "Architecture et photographie"}],
    )
    skill = add("skills", "Architecture logicielle", domain_id=category, level="Avancé")
    tech = add("technologies", "Python", family="language", website_url="https://www.python.org")
    education = add(
        "educations",
        "Conception de systèmes numériques",
        institution_id=org,
        nature="degree",
        domain="Informatique",
        result="earned",
        start_date="2017",
        end_date="2020",
    )
    exp = add(
        "experiences",
        "Développeur de produits numériques",
        organization_id=org,
        nature="employment",
        start_date="2020-09",
        ongoing=True,
        responsibilities=[{"text": "Concevoir et livrer des applications utiles."}],
        skills=[{"id": skill}],
        technologies=[{"id": tech}],
    )
    add(
        "certifications",
        "Certification de démonstration",
        issuer_id=org,
        state="earned",
        issue_date="2021",
        validity="dated",
        expiry_date="2022",
    )
    add(
        "awards",
        "Prix du projet de démonstration",
        issuer_id=org,
        award_date="2023",
        educations=[{"id": education}],
    )
    service = add(
        "services",
        "Du besoin au produit",
        audience="Équipes et porteurs de projets",
        value_proposition="Donner une forme concrète à une idée utile.",
        included="Conception et réalisation de l’application.",
        deliverables=[{"text": "Une application documentée"}],
        delivery_mode="remote",
        contact_label="Parlons de votre projet",
        contact_url="mailto:demo@example.test",
        packages=[
            {
                "name": "Exploration",
                "pricing": "fixed",
                "amount": "1200.50",
                "currency": "EUR",
                "scope": "Cadrage, parcours et prototype.",
                "tax_note": "Tarif fictif de test",
            },
            {"name": "Réalisation", "pricing": "quote", "scope": "Construction du produit."},
        ],
        faq=[
            {"question": "Comment démarrer ?", "answer": "Nous commençons par préciser le besoin."}
        ],
        steps=[{"text": "Comprendre"}, {"text": "Concevoir"}, {"text": "Construire"}],
        skills=[{"id": skill}],
    )
    files = app.state.media_files
    temporary = files.directory / ".public-test.png"
    image = Image.new("RGB", (1600, 1000), "#dce6ed")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((180, 120, 1420, 880), radius=20, fill="#f8faf7")
    draw.rectangle((180, 120, 420, 880), fill="#263a43")
    for x, y, w, h, color in [
        (470, 180, 700, 30, "#263a43"),
        (470, 250, 340, 180, "#d4dfc8"),
        (850, 250, 500, 180, "#dce6ed"),
        (470, 470, 880, 280, "#e9ece7"),
    ]:
        draw.rounded_rectangle((x, y, x + w, y + h), radius=10, fill=color)
    image.save(temporary)
    import hashlib

    file = files.finish(
        temporary,
        "demonstration.png",
        "image/png",
        "image",
        ".png",
        temporary.stat().st_size,
        hashlib.sha256(temporary.read_bytes()).hexdigest(),
    )
    media = store.save(
        "media",
        {
            **file["entry"],
            "title": "Interface de démonstration",
            "visibility": "public",
            "credit": "Illustration de test",
        },
        entry_id=file["id"],
        version=file["version"],
    )
    media = store.transition("media", media["id"], media["version"], "ready")
    records["media"] = media
    project = add(
        "projects",
        "Atlas — Un espace pour les idées",
        nature="personal",
        phase="completed",
        start_date="2024",
        role="Conception et développement",
        responsibilities=[{"text": "Concevoir les parcours et développer l’application."}],
        outcomes=[{"text": "Un parcours de lecture simple et accessible."}],
        problem="Comment rendre des connaissances faciles à retrouver ?",
        objectives="Une information claire et reliée.",
        constraints="SECRET-CONSTRAINTS",
        skills=[{"id": skill}],
        technologies=[{"id": tech, "release": "3.13"}],
        experiences=[{"id": exp}],
        services=[{"id": service}],
        media=[
            {
                "id": media["id"],
                "role": "cover",
                "alt": "Maquette fictive d’une application de classement.",
            }
        ],
        featured=True,
        metrics=[
            {
                "label": "Exemple de mesure",
                "baseline": "3",
                "result": "1",
                "unit": "étape",
                "context": "Donnée fictive du test",
            }
        ],
    )
    add(
        "testimonials",
        "Un travail attentif",
        quote="Les choix sont expliqués et chaque détail a sa place.",
        author_name="Camille — personnage fictif",
        relationship="Collaboration fictive",
        consent="granted",
        consent_note="SECRET-CONSENT",
        projects=[{"id": project}],
        services=[{"id": service}],
    )
    add(
        "posts",
        "Concevoir pour la clarté",
        author_id=profile,
        publication_date="2026-10",
        projects=[{"id": project}],
    )
    add(
        "publications",
        "Des interfaces qui se comprennent",
        nature="talk",
        role="Intervenant",
        event="Rencontre fictive",
        event_date="2026-09-12",
        publication_url="https://example.test/conference",
        projects=[{"id": project}],
    )
    return records
