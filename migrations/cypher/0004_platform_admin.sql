PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platform_admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK(length(email) BETWEEN 5 AND 254),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 120),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','disabled')),
  webauthn_required INTEGER NOT NULL DEFAULT 1 CHECK(webauthn_required = 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS platform_admin_roles (
  admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('platform_owner','operations_admin','support_engineer','billing_admin','security_auditor','ai_operations')),
  granted_by TEXT REFERENCES platform_admins(id),
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (admin_id,role)
);

CREATE TABLE IF NOT EXISTS platform_webauthn_credentials (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0 CHECK(sign_count >= 0),
  transports TEXT NOT NULL DEFAULT '[]',
  device_type TEXT NOT NULL CHECK(device_type IN ('single_device','multi_device')),
  backed_up INTEGER NOT NULL DEFAULT 0 CHECK(backed_up IN (0,1)),
  device_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS platform_admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  auth_method TEXT NOT NULL CHECK(auth_method IN ('webauthn_passkey','webauthn_security_key','recovery')),
  mfa_verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT
);

CREATE TABLE IF NOT EXISTS platform_webauthn_challenges (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES platform_admins(id) ON DELETE CASCADE,
  challenge_hash TEXT NOT NULL UNIQUE,
  ceremony TEXT NOT NULL CHECK(ceremony IN ('registration','authentication')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_recovery_codes (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS platform_support_access (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES platform_admins(id),
  approved_by TEXT REFERENCES platform_admins(id),
  ticket_reference TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 20 AND 1000),
  access_level TEXT NOT NULL CHECK(access_level IN ('metadata','operations','document_content')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied','expired','revoked')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK(approved_by IS NULL OR approved_by <> requested_by)
);

CREATE TABLE IF NOT EXISTS platform_admin_audit (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES platform_admins(id),
  tenant_id TEXT REFERENCES tenants(id),
  event_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_sessions_token ON platform_admin_sessions(token_hash,revoked_at,expires_at);
CREATE INDEX IF NOT EXISTS idx_platform_credentials_admin ON platform_webauthn_credentials(admin_id,revoked_at);
CREATE INDEX IF NOT EXISTS idx_platform_support_status ON platform_support_access(status,expires_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_time ON platform_admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_tenant ON platform_admin_audit(tenant_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS guard_platform_admin_activation
BEFORE UPDATE OF status ON platform_admins
WHEN NEW.status='active' AND NOT EXISTS (
  SELECT 1 FROM platform_webauthn_credentials c WHERE c.admin_id=NEW.id AND c.revoked_at IS NULL
)
BEGIN SELECT RAISE(ABORT,'active platform administrator requires WebAuthn credential'); END;

CREATE TRIGGER IF NOT EXISTS guard_support_approval
BEFORE UPDATE OF status ON platform_support_access
WHEN NEW.status='approved' AND (NEW.approved_by IS NULL OR NEW.approved_by=NEW.requested_by OR NEW.approved_at IS NULL)
BEGIN SELECT RAISE(ABORT,'support access requires separate approver'); END;
