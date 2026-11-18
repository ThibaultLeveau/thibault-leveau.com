-- Technical job data belongs to the sole administrator, independently of session lifetime.
-- No provider secret, reasoning trace or general conversation is retained.
CREATE TABLE assistant_jobs (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 thread_id TEXT NOT NULL,
 owner TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','review','needs_input','paused','failed','completed','cancelled')),
 language TEXT NOT NULL CHECK(language IN ('fr','en')),
 interface_language TEXT NOT NULL CHECK(interface_language IN ('fr','en')),
 include_private INTEGER NOT NULL CHECK(include_private IN (0,1)),
 media_ids TEXT NOT NULL,
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 provider_stamp TEXT NOT NULL,
 preferences TEXT NOT NULL,
 message TEXT NOT NULL DEFAULT '',
 questions TEXT NOT NULL DEFAULT '[]',
 error_key TEXT,
 created REAL NOT NULL,
 updated REAL NOT NULL,
 continuation TEXT NOT NULL DEFAULT '',
 plan_done INTEGER NOT NULL DEFAULT 0 CHECK(plan_done IN (0,1)),
 plan_page INTEGER NOT NULL DEFAULT 0,
 total_tasks INTEGER,
 calls INTEGER NOT NULL DEFAULT 0,
 delegations INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX assistant_jobs_updated ON assistant_jobs(updated DESC, id);
CREATE TABLE assistant_job_inputs (
 job_id TEXT NOT NULL REFERENCES assistant_jobs(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL,
 message TEXT NOT NULL,
 created REAL NOT NULL,
 request_id TEXT,
 PRIMARY KEY(job_id, sequence),
 UNIQUE(job_id, request_id)
);
CREATE TABLE assistant_job_tasks (
 job_id TEXT NOT NULL REFERENCES assistant_jobs(id) ON DELETE CASCADE,
 key TEXT NOT NULL,
 ordinal INTEGER NOT NULL,
 plan_page INTEGER NOT NULL,
 kind TEXT NOT NULL,
 entry_id INTEGER,
 task TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','generated','prepared','applied','cancelled')),
 operation TEXT,
 versions TEXT NOT NULL DEFAULT '{}',
 missing TEXT NOT NULL DEFAULT '[]',
 result_id INTEGER,
 result_version INTEGER,
 PRIMARY KEY(job_id, key),
 UNIQUE(job_id, ordinal),
 UNIQUE(job_id, entry_id)
);
CREATE INDEX assistant_job_tasks_work ON assistant_job_tasks(job_id, state, ordinal);
CREATE TABLE assistant_job_sections (
 job_id TEXT NOT NULL,
 task_key TEXT NOT NULL,
 section TEXT NOT NULL,
 fields TEXT NOT NULL,
 phase TEXT NOT NULL DEFAULT 'content' CHECK(phase IN ('content','links')),
 state TEXT NOT NULL CHECK(state IN ('queued','running','done','needs_input')),
 result TEXT,
 versions TEXT NOT NULL DEFAULT '{}',
 PRIMARY KEY(job_id, task_key, section),
 FOREIGN KEY(job_id, task_key) REFERENCES assistant_job_tasks(job_id, key) ON DELETE CASCADE
);
CREATE INDEX assistant_job_sections_work ON assistant_job_sections(job_id, state);
CREATE TABLE assistant_job_dependencies (
 job_id TEXT NOT NULL,
 task_key TEXT NOT NULL,
 field TEXT NOT NULL,
 target_key TEXT NOT NULL,
 expected_kind TEXT NOT NULL,
 value TEXT NOT NULL,
 versions TEXT NOT NULL DEFAULT '{}',
 state TEXT NOT NULL CHECK(state IN ('waiting','prepared','applied','cancelled')),
 PRIMARY KEY(job_id, task_key, field, target_key),
 FOREIGN KEY(job_id, task_key) REFERENCES assistant_job_tasks(job_id, key) ON DELETE CASCADE
);
CREATE INDEX assistant_job_dependencies_work ON assistant_job_dependencies(job_id, state);
CREATE TABLE assistant_job_batches (
 id TEXT PRIMARY KEY,
 job_id TEXT NOT NULL REFERENCES assistant_jobs(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL CHECK(state IN ('pending','applied','cancelled')),
 phase TEXT NOT NULL CHECK(phase IN ('content','links')),
 created REAL NOT NULL,
 payload TEXT NOT NULL,
 result TEXT,
 UNIQUE(job_id, sequence)
);
CREATE INDEX assistant_job_batches_work ON assistant_job_batches(job_id, state, sequence);
