-- Independent global interface languages. No editorial content is rewritten.
CREATE TABLE site_languages (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    public_language TEXT NOT NULL CHECK (public_language IN ('fr', 'en')),
    admin_language TEXT NOT NULL CHECK (admin_language IN ('fr', 'en')),
    version INTEGER NOT NULL CHECK (version >= 1)
);
INSERT INTO site_languages VALUES (1, 'fr', 'fr', 1);
