CREATE TABLE IF NOT EXISTS product_keys (
  key_hash TEXT PRIMARY KEY,
  key_hint TEXT NOT NULL,
  customer TEXT NOT NULL,
  edition TEXT NOT NULL CHECK(edition IN ('core','operations','enterprise','government','federal')),
  machine_limit INTEGER NOT NULL CHECK(machine_limit BETWEEN 1 AND 500),
  term_days INTEGER NOT NULL CHECK(term_days BETWEEN 1 AND 3650),
  grace_days INTEGER NOT NULL CHECK(grace_days BETWEEN 0 AND 180),
  valid_until TEXT,
  status TEXT NOT NULL CHECK(status IN ('active','suspended','revoked')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activations (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL REFERENCES product_keys(key_hash),
  installation_id TEXT NOT NULL,
  machine_fingerprint TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  deactivated_at TEXT,
  UNIQUE(key_hash,machine_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_activations_key_active ON activations(key_hash,deactivated_at);
CREATE TABLE IF NOT EXISTS activation_attempts (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  success INTEGER NOT NULL CHECK(success IN (0,1)),
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activation_attempts_ip_time ON activation_attempts(ip_hash,attempted_at);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  key_hash TEXT,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_license_audit_created ON audit_events(created_at DESC);
