-- Migration 1: immutable snapshot. Future changes require a new numbered migration.

CREATE TABLE content_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK(kind IN ('projects', 'experiences', 'skills', 'technologies', 'educations', 'certifications', 'services', 'posts', 'publications', 'testimonials', 'awards', 'profiles', 'organizations', 'taxonomies', 'media')), "title" TEXT NOT NULL, "slug" TEXT NOT NULL, "summary" TEXT NOT NULL, "body" TEXT NOT NULL, "language" TEXT NOT NULL, "visibility" TEXT NOT NULL, "featured" INTEGER NOT NULL, "sort_order" INTEGER NOT NULL, "seo_title" TEXT NOT NULL, "seo_description" TEXT NOT NULL, "canonical_url" TEXT NOT NULL, "private_notes" TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','archived')), version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, search_text TEXT NOT NULL, UNIQUE(kind, language, slug), UNIQUE(id, kind));

CREATE UNIQUE INDEX content_single_profile ON content_entries(kind) WHERE kind = 'profiles';

CREATE INDEX content_listing ON content_entries(kind, status, updated_at);

CREATE TABLE projects (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'projects' CHECK(kind = 'projects'), "team" TEXT NOT NULL, "start_date" TEXT NOT NULL, "end_date" TEXT NOT NULL, "ongoing" INTEGER NOT NULL, "date_note" TEXT NOT NULL, "nature" TEXT NOT NULL, "open_source" INTEGER NOT NULL, "phase" TEXT NOT NULL, "problem" TEXT NOT NULL, "objectives" TEXT NOT NULL, "audience" TEXT NOT NULL, "constraints" TEXT NOT NULL, "organization_id" INTEGER REFERENCES organizations(id) ON DELETE RESTRICT, "client_id" INTEGER REFERENCES organizations(id) ON DELETE RESTRICT, "role" TEXT NOT NULL, "authority" TEXT NOT NULL, "team_size" INTEGER, "outcome_note" TEXT NOT NULL, "lessons" TEXT NOT NULL, "next_steps" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE experiences (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'experiences' CHECK(kind = 'experiences'), "team" TEXT NOT NULL, "start_date" TEXT NOT NULL, "end_date" TEXT NOT NULL, "ongoing" INTEGER NOT NULL, "date_note" TEXT NOT NULL, "organization_id" INTEGER REFERENCES organizations(id) ON DELETE RESTRICT, "organization_alias" TEXT NOT NULL, "client_id" INTEGER REFERENCES organizations(id) ON DELETE RESTRICT, "department" TEXT NOT NULL, "nature" TEXT NOT NULL, "contract" TEXT NOT NULL, "working_time" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE skills (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'skills' CHECK(kind = 'skills'), "domain_id" INTEGER REFERENCES taxonomies(id) ON DELETE RESTRICT, "nature" TEXT NOT NULL, "level" TEXT NOT NULL, "first_used" TEXT NOT NULL, "last_used" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE technologies (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'technologies' CHECK(kind = 'technologies'), "family" TEXT NOT NULL, "website_url" TEXT NOT NULL, "documentation_url" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE educations (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'educations' CHECK(kind = 'educations'), "start_date" TEXT NOT NULL, "end_date" TEXT NOT NULL, "ongoing" INTEGER NOT NULL, "date_note" TEXT NOT NULL, "institution_id" INTEGER REFERENCES organizations(id) ON DELETE RESTRICT, "nature" TEXT NOT NULL, "domain" TEXT NOT NULL, "level" TEXT NOT NULL, "duration" TEXT NOT NULL, "result" TEXT NOT NULL, "program" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE certifications (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'certifications' CHECK(kind = 'certifications'), "issuer_id" INTEGER REFERENCES organizations(id) ON DELETE RESTRICT, "category" TEXT NOT NULL, "credential_id" TEXT NOT NULL, "state" TEXT NOT NULL, "issue_date" TEXT NOT NULL, "issue_unknown" INTEGER NOT NULL, "validity" TEXT NOT NULL, "expiry_date" TEXT NOT NULL, "verification_url" TEXT NOT NULL, "education_id" INTEGER REFERENCES educations(id) ON DELETE RESTRICT, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE services (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'services' CHECK(kind = 'services'), "value_proposition" TEXT NOT NULL, "audience" TEXT NOT NULL, "problem" TEXT NOT NULL, "included" TEXT NOT NULL, "excluded" TEXT NOT NULL, "prerequisites" TEXT NOT NULL, "duration" TEXT NOT NULL, "delivery_mode" TEXT NOT NULL, "availability" TEXT NOT NULL, "terms" TEXT NOT NULL, "contact_label" TEXT NOT NULL, "contact_url" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE posts (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'posts' CHECK(kind = 'posts'), "author_id" INTEGER REFERENCES profiles(id) ON DELETE RESTRICT, "publication_date" TEXT NOT NULL, "revision_date" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE publications (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'publications' CHECK(kind = 'publications'), "nature" TEXT NOT NULL, "role" TEXT NOT NULL, "organizer_id" INTEGER REFERENCES organizations(id) ON DELETE RESTRICT, "event" TEXT NOT NULL, "event_date" TEXT NOT NULL, "date_unknown" INTEGER NOT NULL, "duration" TEXT NOT NULL, "online" INTEGER NOT NULL, "publication_url" TEXT NOT NULL, "identifier" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE testimonials (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'testimonials' CHECK(kind = 'testimonials'), "quote" TEXT NOT NULL, "author_name" TEXT NOT NULL, "anonymous" INTEGER NOT NULL, "author_role" TEXT NOT NULL, "organization_id" INTEGER REFERENCES organizations(id) ON DELETE RESTRICT, "testimonial_date" TEXT NOT NULL, "relationship" TEXT NOT NULL, "source" TEXT NOT NULL, "proof_url" TEXT NOT NULL, "consent" TEXT NOT NULL, "consent_note" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE awards (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'awards' CHECK(kind = 'awards'), "issuer_id" INTEGER REFERENCES organizations(id) ON DELETE RESTRICT, "award_date" TEXT NOT NULL, "date_unknown" INTEGER NOT NULL, "category" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE profiles (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'profiles' CHECK(kind = 'profiles'), "profession" TEXT NOT NULL, "tagline" TEXT NOT NULL, "public_location" TEXT NOT NULL, "public_contact" TEXT NOT NULL, "availability" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE organizations (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'organizations' CHECK(kind = 'organizations'), "alias" TEXT NOT NULL, "industry" TEXT NOT NULL, "website_url" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE taxonomies (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'taxonomies' CHECK(kind = 'taxonomies'), "scope" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE media_assets (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'media' CHECK(kind = 'media'), "nature" TEXT NOT NULL, "source" TEXT NOT NULL, "external_url" TEXT NOT NULL, "credit" TEXT NOT NULL, "license" TEXT NOT NULL, "duration" TEXT NOT NULL, FOREIGN KEY(id, kind) REFERENCES content_entries(id, kind) ON DELETE CASCADE);

CREATE TABLE entry_responsibilities (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "text" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_actions (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "text" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_deliverables (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "text" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_outcomes (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "text" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_metrics (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "label" TEXT NOT NULL, "baseline" TEXT NOT NULL, "result" TEXT NOT NULL, "unit" TEXT NOT NULL, "period" TEXT NOT NULL, "context" TEXT NOT NULL, "proof_url" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_skills (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE entry_technologies (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES technologies(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, "release" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE entry_links (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "label" TEXT NOT NULL, "url" TEXT NOT NULL, "kind" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_locations (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "label" TEXT NOT NULL, "city" TEXT NOT NULL, "region" TEXT NOT NULL, "country" TEXT NOT NULL, "mode" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_media (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, "role" TEXT NOT NULL, "alt" TEXT NOT NULL, "decorative" INTEGER NOT NULL, "caption" TEXT NOT NULL, "transcript" TEXT NOT NULL, "subtitles_url" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE entry_tags (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES taxonomies(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE project_experiences (entry_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES experiences(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE project_educations (entry_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES educations(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE project_services (entry_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE project_testimonials (entry_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES testimonials(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE entry_aliases (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "text" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_benefits (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "text" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_steps (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "text" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_languages (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "name" TEXT NOT NULL, "level" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_packages (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "name" TEXT NOT NULL, "scope" TEXT NOT NULL, "pricing" TEXT NOT NULL, "amount" TEXT NOT NULL, "currency" TEXT NOT NULL, "unit" TEXT NOT NULL, "tax_note" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_faq (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "question" TEXT NOT NULL, "answer" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE service_testimonials (entry_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES testimonials(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE posts_projects (entry_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE posts_services (entry_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE publications_projects (entry_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE publications_services (entry_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE testimonials_experiences (entry_id INTEGER NOT NULL REFERENCES testimonials(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES experiences(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE awards_projects (entry_id INTEGER NOT NULL REFERENCES awards(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE awards_educations (entry_id INTEGER NOT NULL REFERENCES awards(id) ON DELETE CASCADE, ref_id INTEGER NOT NULL REFERENCES educations(id) ON DELETE RESTRICT, position_a INTEGER NOT NULL, position_b INTEGER NOT NULL DEFAULT 0, "context" TEXT NOT NULL, PRIMARY KEY(entry_id, ref_id));

CREATE TABLE entry_interests (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "text" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE entry_roles (entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE, position INTEGER NOT NULL, "role" TEXT NOT NULL, PRIMARY KEY(entry_id,position));

CREATE TABLE media_files (entry_id INTEGER PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE, storage_name TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, width INTEGER, height INTEGER);
