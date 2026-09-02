ALTER TABLE shirabe_intakes ADD COLUMN updated_at TEXT;
ALTER TABLE shirabe_intakes ADD COLUMN retention_expires_at TEXT;
ALTER TABLE shirabe_intakes ADD COLUMN deleted_at TEXT;
ALTER TABLE shirabe_intakes ADD COLUMN deletion_reason TEXT;

UPDATE shirabe_intakes
SET updated_at = created_at,
    retention_expires_at = datetime(created_at, '+180 days')
WHERE updated_at IS NULL OR retention_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shirabe_intakes_retention
  ON shirabe_intakes(retention_expires_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS shirabe_notification_outbox (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES shirabe_intakes(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sending','retry','delivered','dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at TEXT NOT NULL,
  locked_at TEXT,
  delivered_at TEXT,
  message_id TEXT,
  last_error TEXT,
  payload_hash TEXT NOT NULL,
  UNIQUE(intake_id)
);

CREATE INDEX IF NOT EXISTS idx_shirabe_notification_due
  ON shirabe_notification_outbox(status,next_attempt_at);

CREATE TABLE IF NOT EXISTS shirabe_rate_limits (
  subject_hash TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(subject_hash,bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_shirabe_rate_limits_updated
  ON shirabe_rate_limits(updated_at);

CREATE TABLE IF NOT EXISTS shirabe_lifecycle_events (
  id TEXT PRIMARY KEY,
  intake_id TEXT,
  payload_hash TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'received','duplicate_replayed','notification_claimed','notification_retry',
    'notification_delivered','notification_dead','routing_transitioned',
    'retention_expired','deleted'
  )),
  from_state TEXT,
  to_state TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shirabe_lifecycle_intake
  ON shirabe_lifecycle_events(intake_id,created_at);
