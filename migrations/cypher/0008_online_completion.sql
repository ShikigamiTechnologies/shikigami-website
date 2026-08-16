PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS document_line_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_index INTEGER NOT NULL CHECK(line_index >= 0),
  part_number TEXT,
  quantity TEXT,
  description TEXT,
  po_line_price_minor INTEGER,
  invoice_line_price_minor INTEGER,
  variance_minor INTEGER,
  match_status TEXT NOT NULL DEFAULT 'pending' CHECK(match_status IN ('pending','matched','variance','incomplete')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id,document_id,line_index)
);

CREATE TABLE IF NOT EXISTS tenant_field_definitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  is_required INTEGER NOT NULL DEFAULT 0 CHECK(is_required IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id,field_key)
);

CREATE INDEX IF NOT EXISTS idx_line_items_document ON document_line_items(tenant_id,document_id,line_index);
CREATE INDEX IF NOT EXISTS idx_field_definitions_tenant ON tenant_field_definitions(tenant_id,active,field_label);

CREATE TRIGGER IF NOT EXISTS guard_line_item_tenant_insert BEFORE INSERT ON document_line_items
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: line item'); END;
