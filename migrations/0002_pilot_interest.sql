CREATE TABLE IF NOT EXISTS pilot_interest (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  organization TEXT NOT NULL CHECK(length(organization) BETWEEN 2 AND 160),
  role TEXT NOT NULL CHECK(length(role) BETWEEN 2 AND 120),
  workflow TEXT NOT NULL CHECK(length(workflow) BETWEEN 10 AND 2000),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 5 AND 254),
  source TEXT NOT NULL DEFAULT 'homepage-controlled-pilot',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','qualified','pilot','closed')),
  notification_attempts INTEGER NOT NULL DEFAULT 0,
  notification_message_id TEXT,
  notification_error TEXT,
  notified_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_interest_email ON pilot_interest(lower(email));
CREATE INDEX IF NOT EXISTS idx_pilot_interest_created ON pilot_interest(created_at DESC);
