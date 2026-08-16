PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK(length(slug) BETWEEN 2 AND 64),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 160),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','closed')),
  login_enabled INTEGER NOT NULL DEFAULT 1 CHECK(login_enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK(length(email) BETWEEN 5 AND 254),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 120),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK(password_iterations >= 600000),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','locked')),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0,1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('tenant_admin','secretary','supervisor','viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id,user_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  success INTEGER NOT NULL CHECK(success IN (0,1)),
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cypher_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  actor_user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON tenant_memberships(user_id,status);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON auth_sessions(token_hash,revoked_at,expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id,tenant_id);
CREATE INDEX IF NOT EXISTS idx_attempts_window ON auth_attempts(ip_hash,attempted_at);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON cypher_audit_events(tenant_id,created_at DESC);
