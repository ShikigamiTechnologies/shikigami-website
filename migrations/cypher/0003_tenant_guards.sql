PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS guard_document_store_insert BEFORE INSERT ON documents
WHEN NEW.store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stores WHERE id=NEW.store_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: store'); END;
CREATE TRIGGER IF NOT EXISTS guard_document_store_update BEFORE UPDATE OF tenant_id,store_id ON documents
WHEN NEW.store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stores WHERE id=NEW.store_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: store'); END;

CREATE TRIGGER IF NOT EXISTS guard_document_vendor_insert BEFORE INSERT ON documents
WHEN NEW.vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendors WHERE id=NEW.vendor_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: vendor'); END;
CREATE TRIGGER IF NOT EXISTS guard_document_vendor_update BEFORE UPDATE OF tenant_id,vendor_id ON documents
WHEN NEW.vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendors WHERE id=NEW.vendor_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: vendor'); END;

CREATE TRIGGER IF NOT EXISTS guard_artifact_tenant_insert BEFORE INSERT ON document_artifacts
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: artifact'); END;
CREATE TRIGGER IF NOT EXISTS guard_field_tenant_insert BEFORE INSERT ON document_fields
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: field'); END;
CREATE TRIGGER IF NOT EXISTS guard_validation_tenant_insert BEFORE INSERT ON validations
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: validation'); END;
CREATE TRIGGER IF NOT EXISTS guard_resolution_tenant_insert BEFORE INSERT ON resolutions
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: resolution'); END;
CREATE TRIGGER IF NOT EXISTS guard_dispatch_tenant_insert BEFORE INSERT ON dispatch_records
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: dispatch'); END;

CREATE TRIGGER IF NOT EXISTS guard_relationship_tenant_insert BEFORE INSERT ON document_relationships
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.source_document_id AND tenant_id=NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.related_document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: relationship'); END;

CREATE TRIGGER IF NOT EXISTS guard_artifact_tenant_update BEFORE UPDATE OF tenant_id,document_id ON document_artifacts
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: artifact'); END;
CREATE TRIGGER IF NOT EXISTS guard_field_tenant_update BEFORE UPDATE OF tenant_id,document_id ON document_fields
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: field'); END;
CREATE TRIGGER IF NOT EXISTS guard_validation_tenant_update BEFORE UPDATE OF tenant_id,document_id ON validations
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: validation'); END;
CREATE TRIGGER IF NOT EXISTS guard_resolution_tenant_update BEFORE UPDATE OF tenant_id,document_id ON resolutions
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: resolution'); END;
CREATE TRIGGER IF NOT EXISTS guard_dispatch_tenant_update BEFORE UPDATE OF tenant_id,document_id ON dispatch_records
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: dispatch'); END;
CREATE TRIGGER IF NOT EXISTS guard_relationship_tenant_update BEFORE UPDATE OF tenant_id,source_document_id,related_document_id ON document_relationships
WHEN NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.source_document_id AND tenant_id=NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM documents WHERE id=NEW.related_document_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'tenant boundary violation: relationship'); END;
