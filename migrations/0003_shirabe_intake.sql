CREATE TABLE IF NOT EXISTS shirabe_intakes (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = 'shirabe-intake/v1'),
  language TEXT NOT NULL CHECK (language IN ('en','es')),
  mode TEXT NOT NULL CHECK (mode IN ('signal','guided')),
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  industry TEXT NOT NULL,
  company_size TEXT NOT NULL,
  problem_category TEXT NOT NULL,
  frequency TEXT NOT NULL,
  monthly_volume INTEGER NOT NULL DEFAULT 0 CHECK (monthly_volume >= 0),
  sensitivity TEXT NOT NULL,
  completeness INTEGER NOT NULL CHECK (completeness BETWEEN 0 AND 100),
  evidence_quality TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT,
  consent INTEGER NOT NULL CHECK (consent = 1),
  status TEXT NOT NULL CHECK (status IN ('received','clarification_required','qualified_review','closed')),
  notification_message_id TEXT,
  notification_error TEXT,
  notified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_shirabe_intakes_email ON shirabe_intakes(lower(email));
CREATE INDEX IF NOT EXISTS idx_shirabe_intakes_created ON shirabe_intakes(created_at DESC);

CREATE TABLE IF NOT EXISTS shirabe_routing_queue (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES shirabe_intakes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  routing_tier TEXT NOT NULL CHECK (routing_tier IN ('clarification_required','qualified_review')),
  status TEXT NOT NULL CHECK (status IN ('pending','claimed','completed','failed')),
  payload_hash TEXT NOT NULL,
  claimed_at TEXT,
  completed_at TEXT,
  error TEXT,
  UNIQUE(intake_id)
);
