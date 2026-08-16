PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS processing_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK(job_type IN ('extract','match','report','dispatch')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','retrying','failed','cancelled')),
  provider TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 20),
  last_error_code TEXT,
  last_error_message TEXT,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id,document_id,job_type)
);

CREATE TABLE IF NOT EXISTS extraction_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_model TEXT,
  status TEXT NOT NULL CHECK(status IN ('started','completed','failed','superseded')),
  confidence REAL CHECK(confidence BETWEEN 0 AND 1),
  raw_response_object_key TEXT,
  orientation_corrected INTEGER NOT NULL DEFAULT 0 CHECK(orientation_corrected IN (0,1)),
  handwriting_detected INTEGER NOT NULL DEFAULT 0 CHECK(handwriting_detected IN (0,1)),
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS document_exposure (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  classification TEXT NOT NULL CHECK(classification IN ('unmatched','confirmed_outstanding','disputed','overdue','possible_duplicate','cleared')),
  amount_minor INTEGER NOT NULL DEFAULT 0 CHECK(amount_minor >= 0),
  due_at TEXT,
  resolution_required INTEGER NOT NULL DEFAULT 0 CHECK(resolution_required IN (0,1)),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS provider_runtime_state (
  provider_code TEXT PRIMARY KEY CHECK(provider_code IN ('azure_document_intelligence','openai_vision','supabase')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  readiness TEXT NOT NULL DEFAULT 'not_configured' CHECK(readiness IN ('not_configured','standby','ready','degraded','disabled')),
  last_checked_at TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO provider_runtime_state(provider_code,enabled,readiness) VALUES
  ('azure_document_intelligence',0,'not_configured'),
  ('openai_vision',0,'not_configured'),
  ('supabase',0,'disabled');

CREATE INDEX IF NOT EXISTS idx_jobs_status ON processing_jobs(status,queued_at);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_document ON processing_jobs(tenant_id,document_id);
CREATE INDEX IF NOT EXISTS idx_extractions_document ON extraction_runs(tenant_id,document_id,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_exposure_tenant_classification ON document_exposure(tenant_id,classification,due_at);

CREATE TRIGGER IF NOT EXISTS guard_job_tenant_insert BEFORE INSERT ON processing_jobs
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: job'); END;

CREATE TRIGGER IF NOT EXISTS guard_extraction_tenant_insert BEFORE INSERT ON extraction_runs
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM processing_jobs WHERE id=NEW.job_id AND tenant_id=NEW.tenant_id AND document_id=NEW.document_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: extraction'); END;

CREATE TRIGGER IF NOT EXISTS guard_exposure_tenant_insert BEFORE INSERT ON document_exposure
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: exposure'); END;
