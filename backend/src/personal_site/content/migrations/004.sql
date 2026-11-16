CREATE TABLE content_localizations (
 entry_id INTEGER NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE,
 language TEXT NOT NULL CHECK(language IN ('fr', 'en')),
 state TEXT NOT NULL CHECK(state IN ('draft', 'ready')),
 stale INTEGER NOT NULL DEFAULT 0 CHECK(stale IN (0, 1)),
 source_hash TEXT NOT NULL,
 PRIMARY KEY(entry_id, language)
);
CREATE TABLE content_localized_values (
 entry_id INTEGER NOT NULL,
 language TEXT NOT NULL,
 path TEXT NOT NULL,
 value TEXT NOT NULL,
 anchor TEXT NOT NULL,
 PRIMARY KEY(entry_id, language, path),
 FOREIGN KEY(entry_id, language) REFERENCES content_localizations(entry_id, language) ON DELETE CASCADE
);
