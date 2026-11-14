-- Assistant preferences and expiring proposals share the existing backup boundary.
CREATE TABLE assistant_preferences (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE assistant_proposals (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE, thread_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL CHECK (state IN ('pending','applied','cancelled','superseded')), created REAL NOT NULL, expires REAL NOT NULL, payload TEXT NOT NULL, result TEXT);
CREATE INDEX assistant_proposals_owner ON assistant_proposals(owner, thread_id, created);
