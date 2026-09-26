CREATE TABLE visitors (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  digest TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(visitor_id, digest)
);
CREATE INDEX notes_visitor ON notes(visitor_id);

CREATE TABLE promises (
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  core_id INTEGER NOT NULL,
  note_id TEXT NOT NULL REFERENCES notes(id),
  quote TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(visitor_id, core_id),
  UNIQUE(visitor_id, note_id, quote)
);
CREATE INDEX promises_visitor ON promises(visitor_id);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  core_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  web_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX drafts_visitor ON drafts(visitor_id, created_at);

CREATE TABLE inference_requests (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX inference_day ON inference_requests(day);
CREATE INDEX inference_visitor_day ON inference_requests(visitor_id, day);
