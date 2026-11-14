"""Modèles fermés du studio. Les métadonnées décrivent leurs formulaires, pas des types libres."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Long = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100_000)]
URL = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2048)]
Date = Annotated[str, StringConstraints(pattern=r"^$|^\d{4}(-\d{2})?(-\d{2})?$", max_length=10)]
Id = Annotated[int, Field(strict=True, gt=0)]


def field(title, default="", *, section="essential", widget=None, target=None, **kwargs):
    return Field(
        default=default,
        title=title,
        json_schema_extra={"section": section, "widget": widget, "target": target},
        **kwargs,
    )


def rows(title, *, section="contribution", target=None):
    return Field(
        default_factory=list,
        title=title,
        max_length=100,
        json_schema_extra={"section": section, "target": target},
    )


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class Line(Model):
    text: Text = field("Description")


class Link(Model):
    label: Short = field("Libellé")
    url: URL = field("URL", widget="url")
    kind: Literal["website", "repository", "demo", "documentation", "article", "other"] = field(
        "Type de lien", "website"
    )


class Location(Model):
    label: Short = field("Lieu ou zone")
    city: Short = field("Ville")
    region: Short = field("Région")
    country: Short = field("Pays")
    mode: Literal["", "onsite", "hybrid", "remote"] = field("Modalité")


class Reference(Model):
    id: Id
    context: Text = field("Rôle ou contexte")


class TechnologyReference(Reference):
    release: Short = field("Version utilisée")


class MediaReference(Reference):
    role: Literal["cover", "gallery", "video", "attachment", "private_proof", "share"] = field(
        "Usage", "gallery"
    )
    alt: Text = field("Alternative textuelle")
    decorative: bool = field("Image décorative", False)
    caption: Text = field("Légende")
    transcript: Long = field("Transcription", widget="textarea")
    subtitles_url: URL = field("Lien des sous-titres", widget="url")


class Metric(Model):
    label: Short = field("Mesure")
    baseline: str = field("Valeur initiale (point décimal)", pattern=r"^$|^-?\d{1,18}(\.\d{1,6})?$")
    result: str = field("Valeur finale (point décimal)", pattern=r"^$|^-?\d{1,18}(\.\d{1,6})?$")
    unit: Short = field("Unité")
    period: Short = field("Période")
    context: Text = field("Contexte et méthode")
    proof_url: URL = field("Preuve", widget="url")


class Package(Model):
    name: Short = field("Nom de la formule")
    scope: Text = field("Périmètre")
    pricing: Literal["quote", "fixed", "from", "hour", "day"] = field("Mode tarifaire", "quote")
    # Decimal strings stay exact in SQLite and in JavaScript, including zero.
    amount: str = field("Montant (ex. 1200.50)", pattern=r"^$|^\d{1,12}(\.\d{1,2})?$")
    currency: str = field("Devise ISO", "EUR", pattern=r"^[A-Z]{3}$")
    unit: Short = field("Unité / précision")
    tax_note: Text = field("Mention tarifaire et taxes")


class FAQ(Model):
    question: Text = field("Question")
    answer: Long = field("Réponse", widget="textarea")


class Language(Model):
    name: Short = field("Langue")
    level: Short = field("Niveau")


class Entry(Model):
    title: Short = field("Titre / nom", min_length=1)
    slug: str = field("Identifiant lisible", max_length=160, pattern=r"^$|^[a-z0-9]+(-[a-z0-9]+)*$")
    summary: Text = field("Résumé court", widget="textarea")
    body: Long = field("Description complète", widget="markdown")
    language: str = field("Langue du contenu", "fr", pattern=r"^[a-z]{2,3}(-[A-Z]{2})?$")
    visibility: Literal["private", "public"] = field(
        "Diffusion envisagée", "private", section="review"
    )
    featured: bool = field("Mettre en avant", False, section="review")
    sort_order: int = field("Ordre de présentation", 0, section="review", ge=0, le=100000)
    seo_title: Short = field("Titre SEO", section="review")
    seo_description: Text = field("Description SEO", section="review", widget="textarea")
    canonical_url: URL = field("URL canonique", section="review", widget="url")
    private_notes: Long = field("Notes privées", section="review", widget="textarea")
    links: list[Link] = rows("Liens nommés", section="media")
    locations: list[Location] = rows("Lieux et zones", section="context")
    media: list[MediaReference] = rows("Médias associés", section="media", target="media")
    tags: list[Reference] = rows("Catégories et tags", section="essential", target="taxonomies")


class Period(Model):
    start_date: Date = field(
        "Début (AAAA, AAAA-MM ou AAAA-MM-JJ)", section="context", widget="date"
    )
    end_date: Date = field("Fin (AAAA, AAAA-MM ou AAAA-MM-JJ)", section="context", widget="date")
    ongoing: bool = field("En cours, sans date de fin", False, section="context")
    date_note: Text = field(
        "Date inconnue / période non applicable : explication", section="context"
    )


class Expertise(Model):
    skills: list[Reference] = rows("Compétences mobilisées", section="expertise", target="skills")
    technologies: list[TechnologyReference] = rows(
        "Stack et outils", section="expertise", target="technologies"
    )


class Contribution(Model):
    responsibilities: list[Line] = rows("Responsabilités")
    actions: list[Line] = rows("Actions menées")
    deliverables: list[Line] = rows("Livrables")
    outcomes: list[Line] = rows("Résultats qualitatifs")
    metrics: list[Metric] = rows("Résultats mesurés")
    team: Text = field("Équipe et collaborations", section="contribution", widget="textarea")


class Project(Entry, Period, Expertise, Contribution):
    nature: Literal["", "professional", "personal", "association", "academic"] = field("Nature")
    open_source: bool = field("Open source", False)
    phase: Literal["", "planned", "active", "completed", "paused"] = field("Phase")
    problem: Long = field("Problème initial", section="context", widget="textarea")
    objectives: Long = field("Objectifs", section="context", widget="textarea")
    audience: Text = field("Public concerné", section="context")
    constraints: Long = field(
        "Contraintes et confidentialité", section="context", widget="textarea"
    )
    organization_id: Id | None = field(
        "Organisation porteuse", None, section="context", target="organizations"
    )
    client_id: Id | None = field("Client", None, section="context", target="organizations")
    role: Text = field("Mon rôle", section="contribution")
    authority: Text = field("Périmètre de décision", section="contribution")
    team_size: int | None = field("Taille d'équipe", None, section="contribution", ge=1, le=100000)
    outcome_note: Text = field("Absence de résultat : explication", section="contribution")
    lessons: Long = field("Enseignements", section="contribution", widget="textarea")
    next_steps: Long = field("Suites envisagées", section="contribution", widget="textarea")
    experiences: list[Reference] = rows(
        "Expériences associées", section="context", target="experiences"
    )
    educations: list[Reference] = rows(
        "Formations associées", section="context", target="educations"
    )
    services: list[Reference] = rows("Services illustrés", section="context", target="services")
    testimonials: list[Reference] = rows("Témoignages", section="media", target="testimonials")


class Experience(Entry, Period, Expertise, Contribution):
    organization_id: Id | None = field("Organisation", None, target="organizations")
    organization_alias: Short = field("Organisation anonymisée / confidentielle")
    client_id: Id | None = field("Client", None, target="organizations")
    department: Short = field("Département")
    nature: Literal["", "employment", "freelance", "internship", "apprenticeship", "volunteer"] = (
        field("Nature")
    )
    contract: Short = field("Type de contrat", section="context")
    working_time: Short = field("Rythme et temps de travail", section="context")


class Skill(Entry):
    domain_id: Id | None = field("Domaine de compétence", None, target="taxonomies")
    nature: Literal["", "technical", "method", "transverse"] = field("Nature")
    level: Short = field("Niveau autoévalué (facultatif)")
    first_used: Date = field("Début de pratique", section="context", widget="date")
    last_used: Date = field("Dernière utilisation", section="context", widget="date")
    aliases: list[Line] = rows("Autres noms", section="essential")


class Technology(Entry):
    family: Literal["", "language", "framework", "data", "cloud", "tool", "platform"] = field(
        "Famille"
    )
    website_url: URL = field("Site officiel", widget="url")
    documentation_url: URL = field("Documentation officielle", widget="url")
    aliases: list[Line] = rows("Autres noms", section="essential")


class Education(Entry, Period, Expertise):
    institution_id: Id | None = field("Établissement", None, target="organizations")
    nature: Literal["", "degree", "training", "course", "self_taught"] = field("Type de formation")
    domain: Short = field("Domaine")
    level: Short = field("Niveau ou diplôme visé")
    duration: Short = field("Durée", section="context")
    result: Literal["", "attended", "earned", "interrupted"] = field("Résultat")
    program: Long = field("Programme et travaux", section="contribution", widget="textarea")


class Certification(Entry):
    issuer_id: Id | None = field("Organisme délivrant", None, target="organizations")
    category: Short = field("Catégorie")
    credential_id: Short = field("Référence du justificatif")
    state: Literal["", "earned", "preparing", "revoked"] = field("État de la certification")
    issue_date: Date = field("Date d'obtention", section="context", widget="date")
    issue_unknown: bool = field("Date d'obtention inconnue", False, section="context")
    validity: Literal["", "dated", "never", "unknown"] = field("Validité", section="context")
    expiry_date: Date = field("Expiration", section="context", widget="date")
    verification_url: URL = field("Lien de vérification", section="media", widget="url")
    education_id: Id | None = field(
        "Formation associée", None, section="context", target="educations"
    )
    skills: list[Reference] = rows("Compétences attestées", section="expertise", target="skills")


class Service(Entry, Expertise):
    value_proposition: Text = field("Proposition de valeur")
    audience: Text = field("Public visé")
    problem: Long = field("Problème traité", section="context", widget="textarea")
    benefits: list[Line] = rows("Bénéfices attendus")
    included: Long = field("Périmètre inclus", section="contribution", widget="textarea")
    excluded: Long = field("Exclusions", section="contribution", widget="textarea")
    prerequisites: Long = field("Prérequis client", section="contribution", widget="textarea")
    deliverables: list[Line] = rows("Livrables")
    steps: list[Line] = rows("Déroulement")
    duration: Short = field("Durée indicative", section="context")
    delivery_mode: Literal["", "onsite", "hybrid", "remote", "flexible"] = field(
        "Mode de réalisation", section="context"
    )
    languages: list[Language] = rows("Langues de prestation", section="context")
    availability: Text = field("Disponibilité", section="context")
    terms: Long = field("Conditions pratiques", section="context", widget="textarea")
    packages: list[Package] = rows("Formules tarifaires")
    faq: list[FAQ] = rows("Questions fréquentes")
    contact_label: Short = field("Libellé de contact", section="media")
    contact_url: URL = field("Contact (HTTPS ou mailto)", section="media", widget="url")
    projects: list[Reference] = rows("Projets de référence", section="expertise", target="projects")
    testimonials: list[Reference] = rows("Témoignages", section="media", target="testimonials")


class Post(Entry):
    author_id: Id | None = field("Auteur", None, target="profiles")
    publication_date: Date = field(
        "Date de publication originale", section="context", widget="date"
    )
    revision_date: Date = field("Date de révision éditoriale", section="context", widget="date")
    projects: list[Reference] = rows("Projets associés", section="expertise", target="projects")
    services: list[Reference] = rows("Services associés", section="expertise", target="services")
    skills: list[Reference] = rows("Compétences associées", section="expertise", target="skills")


class Publication(Entry):
    nature: Literal["", "talk", "podcast", "interview", "external_article", "book", "other"] = (
        field("Type de publication")
    )
    role: Short = field("Mon rôle / auteurs")
    organizer_id: Id | None = field("Organisme", None, target="organizations")
    event: Short = field("Événement", section="context")
    event_date: Date = field("Date de parution / intervention", section="context", widget="date")
    date_unknown: bool = field("Date inconnue", False, section="context")
    duration: Short = field("Durée", section="context")
    online: bool = field("En ligne", False, section="context")
    publication_url: URL = field("Lien de publication", section="media", widget="url")
    identifier: Short = field("DOI / ISBN", section="media")
    projects: list[Reference] = rows("Projets associés", section="expertise", target="projects")
    services: list[Reference] = rows("Services associés", section="expertise", target="services")
    skills: list[Reference] = rows("Compétences associées", section="expertise", target="skills")


class Testimonial(Entry):
    quote: Long = field("Citation exacte", widget="textarea")
    author_name: Short = field("Nom d'affichage de l'auteur")
    anonymous: bool = field("Auteur anonyme", False)
    author_role: Short = field("Fonction de l'auteur")
    organization_id: Id | None = field("Organisation", None, target="organizations")
    testimonial_date: Date = field("Date du témoignage", section="context", widget="date")
    relationship: Text = field("Contexte de la relation", section="context")
    source: Text = field("Source", section="media")
    proof_url: URL = field("Lien de preuve", section="media", widget="url")
    consent: Literal["pending", "granted", "refused"] = field(
        "Autorisation de diffusion", "pending", section="review"
    )
    consent_note: Long = field(
        "Note privée sur l'autorisation", section="review", widget="textarea"
    )
    projects: list[Reference] = rows("Projets concernés", section="context", target="projects")
    experiences: list[Reference] = rows(
        "Expériences concernées", section="context", target="experiences"
    )
    services: list[Reference] = rows("Services concernés", section="context", target="services")


class Award(Entry):
    issuer_id: Id | None = field("Organisme", None, target="organizations")
    award_date: Date = field("Date", section="context", widget="date")
    date_unknown: bool = field("Date inconnue", False, section="context")
    category: Short = field("Catégorie / classement")
    projects: list[Reference] = rows("Projets distingués", section="context", target="projects")
    educations: list[Reference] = rows(
        "Formations associées", section="context", target="educations"
    )


class Profile(Entry):
    profession: Short = field("Titre professionnel")
    tagline: Text = field("Accroche")
    public_location: Short = field("Localisation de présentation", section="context")
    public_contact: URL = field("Contact public (HTTPS ou mailto)", section="media", widget="url")
    availability: Text = field("Disponibilité", section="context")
    languages: list[Language] = rows("Langues et niveaux", section="context")
    interests: list[Line] = rows("Centres d'intérêt", section="context")


class OrganizationRole(Model):
    role: Literal["employer", "client", "school", "issuer", "publisher", "association"] = field(
        "Rôle", "employer"
    )


class Organization(Entry):
    alias: Short = field("Nom d'affichage anonymisé")
    roles: list[OrganizationRole] = rows("Rôles", section="essential")
    industry: Short = field("Secteur")
    website_url: URL = field("Site officiel", section="media", widget="url")


class Taxonomy(Entry):
    scope: Literal["", "project_category", "post_category", "skill_domain", "tag"] = field("Portée")


class Media(Entry):
    nature: Literal["image", "video", "document"] = field("Nature du média", "image")
    source: Literal["external", "file"] = field("Source", "external")
    external_url: URL = field("URL externe", widget="url")
    credit: Text = field("Auteur et crédits", section="context")
    license: Text = field("Origine et licence", section="context")
    duration: Short = field("Durée de la vidéo", section="context")


MODELS: dict[str, type[Entry]] = {
    "projects": Project,
    "experiences": Experience,
    "skills": Skill,
    "technologies": Technology,
    "educations": Education,
    "certifications": Certification,
    "services": Service,
    "posts": Post,
    "publications": Publication,
    "testimonials": Testimonial,
    "awards": Award,
    "profiles": Profile,
    "organizations": Organization,
    "taxonomies": Taxonomy,
    "media": Media,
}

LABELS = {
    "projects": ("Projets", "Une réalisation, son contexte et votre contribution."),
    "experiences": ("Expériences", "Vos postes, missions et engagements."),
    "skills": ("Compétences", "Ce que vous savez faire, avec ses preuves d'usage."),
    "technologies": ("Technologies", "Les outils de vos réalisations."),
    "educations": ("Formations", "Diplômes, cours et apprentissages."),
    "certifications": ("Certifications", "Qualifications, validité et justificatifs."),
    "services": ("Services", "Des offres claires, du besoin aux livrables."),
    "posts": ("Articles", "Vos textes, conservés en Markdown."),
    "publications": (
        "Interventions et publications",
        "Conférences, podcasts et publications externes.",
    ),
    "testimonials": ("Témoignages", "Des citations exactes et leurs autorisations."),
    "awards": ("Distinctions", "Prix et reconnaissances."),
    "profiles": ("Mon profil", "Votre identité de présentation, en un seul endroit."),
    "organizations": ("Organisations", "Employeurs, clients, écoles et organismes réutilisables."),
    "taxonomies": ("Catégories et tags", "Des catégories distinctes, des tags transversaux."),
    "media": ("Médias", "Images, vidéos et documents privés réutilisables."),
}


class Save(Model):
    entry: dict
    version: Annotated[int, Field(strict=True, ge=1)] | None = None
    as_draft: bool = False


class Transition(Model):
    version: Annotated[int, Field(strict=True, ge=1)]
    status: Literal["draft", "ready", "archived"]
