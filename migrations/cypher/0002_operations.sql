PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL CHECK(plan_code IN ('pilot','professional','enterprise','private_cloud')),
  status TEXT NOT NULL CHECK(status IN ('trialing','active','past_due','suspended','cancelled')),
  starts_at TEXT NOT NULL,
  renews_at TEXT,
  document_limit_monthly INTEGER NOT NULL DEFAULT 500 CHECK(document_limit_monthly >= 0),
  storage_limit_bytes INTEGER NOT NULL DEFAULT 10737418240 CHECK(storage_limit_bytes >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenant_entitlements (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  limit_value INTEGER,
  source TEXT NOT NULL DEFAULT 'subscription' CHECK(source IN ('subscription','addon','pilot','support')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id,feature_code)
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'USD',
  timezone TEXT NOT NULL DEFAULT 'America/Puerto_Rico',
  language_mode TEXT NOT NULL DEFAULT 'bilingual' CHECK(language_mode IN ('english','spanish','bilingual')),
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK(fiscal_year_start_month BETWEEN 1 AND 12),
  confidence_threshold REAL NOT NULL DEFAULT 0.95 CHECK(confidence_threshold BETWEEN 0.70 AND 0.99),
  auto_match_enabled INTEGER NOT NULL DEFAULT 1 CHECK(auto_match_enabled IN (0,1)),
  retroactive_match_enabled INTEGER NOT NULL DEFAULT 1 CHECK(retroactive_match_enabled IN (0,1)),
  resolution_required_days INTEGER NOT NULL DEFAULT 90 CHECK(resolution_required_days BETWEEN 1 AND 365),
  enabled_document_types TEXT NOT NULL DEFAULT '["invoice","purchase_order"]',
  canonical_supplier TEXT,
  supplier_aliases TEXT NOT NULL DEFAULT '[]',
  report_branding TEXT NOT NULL DEFAULT 'both' CHECK(report_branding IN ('cypher','tenant','both')),
  weekly_summary_enabled INTEGER NOT NULL DEFAULT 0 CHECK(weekly_summary_enabled IN (0,1)),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_preferences (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK(theme IN ('system','light','dark')),
  font_scale REAL NOT NULL DEFAULT 1.0 CHECK(font_scale BETWEEN 0.8 AND 1.5),
  high_contrast INTEGER NOT NULL DEFAULT 0 CHECK(high_contrast IN (0,1)),
  table_density TEXT NOT NULL DEFAULT 'comfortable' CHECK(table_density IN ('compact','comfortable','spacious')),
  locale TEXT NOT NULL DEFAULT 'en-US',
  default_view TEXT NOT NULL DEFAULT 'overview',
  notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK(notifications_enabled IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id,user_id)
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_number TEXT NOT NULL,
  display_name TEXT,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id,store_number)
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  dba_name TEXT,
  vendor_number TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  contact_name TEXT,
  contact_email TEXT,
  website TEXT,
  service_categories TEXT NOT NULL DEFAULT '[]',
  service_areas TEXT NOT NULL DEFAULT '[]',
  certifications TEXT NOT NULL DEFAULT '[]',
  payment_terms TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','review')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id,vendor_number)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id),
  vendor_id TEXT REFERENCES vendors(id),
  document_type TEXT NOT NULL CHECK(document_type IN ('invoice','purchase_order','receipt','other')),
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','quarantined','queued','processing','needs_review','matched','unmatched','validated','rejected','failed','dispatched')),
  original_filename TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  invoice_number TEXT,
  po_number TEXT,
  document_date TEXT,
  invoice_total_minor INTEGER,
  po_total_minor INTEGER,
  tax_total_minor INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  match_status TEXT CHECK(match_status IN ('pending','matched','variance','unmatched','duplicate','resolved')),
  difference_minor INTEGER,
  extraction_confidence REAL CHECK(extraction_confidence BETWEEN 0 AND 1),
  age_anchor_date TEXT,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  validated_by TEXT REFERENCES users(id),
  validated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id,content_sha256)
);

CREATE TABLE IF NOT EXISTS document_artifacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN ('original','extraction','validation_pdf','evidence_manifest','export')),
  object_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id,document_id,artifact_type,version),
  UNIQUE (object_key)
);

CREATE TABLE IF NOT EXISTS document_fields (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  extracted_value TEXT,
  confirmed_value TEXT,
  confidence REAL CHECK(confidence BETWEEN 0 AND 1),
  source_provider TEXT,
  is_required INTEGER NOT NULL DEFAULT 0 CHECK(is_required IN (0,1)),
  confirmed_by TEXT REFERENCES users(id),
  confirmed_at TEXT,
  UNIQUE (tenant_id,document_id,field_key)
);

CREATE TABLE IF NOT EXISTS document_relationships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  related_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK(relationship_type IN ('po_match','duplicate_invoice','reused_po','supersedes','supporting_document')),
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'detected' CHECK(status IN ('detected','confirmed','dismissed','resolved')),
  resolved_by TEXT REFERENCES users(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(source_document_id <> related_document_id),
  UNIQUE (tenant_id,source_document_id,related_document_id,relationship_type)
);

CREATE TABLE IF NOT EXISTS validations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK(decision IN ('approved','approved_with_variance','unmatched','rejected','needs_resolution')),
  notes TEXT,
  evidence_manifest_hash TEXT,
  validation_pdf_hash TEXT,
  validator_user_id TEXT NOT NULL REFERENCES users(id),
  validated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resolutions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','waived')),
  reason TEXT NOT NULL,
  due_at TEXT,
  resolution TEXT,
  owner_user_id TEXT REFERENCES users(id),
  resolved_by TEXT REFERENCES users(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dispatch_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('download','sharepoint','email','api','manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dispatched','failed','cancelled')),
  dispatched_by TEXT REFERENCES users(id),
  dispatched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_status ON documents(tenant_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_store ON documents(tenant_id,store_id,document_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_vendor ON documents(tenant_id,vendor_id,document_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_po ON documents(tenant_id,po_number);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_invoice ON documents(tenant_id,invoice_number);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON document_relationships(tenant_id,source_document_id,status);
CREATE INDEX IF NOT EXISTS idx_resolutions_due ON resolutions(tenant_id,status,due_at);
CREATE INDEX IF NOT EXISTS idx_validations_document ON validations(tenant_id,document_id,validated_at DESC);
