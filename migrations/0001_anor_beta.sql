CREATE TABLE IF NOT EXISTS anor_beta_applications (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 5 AND 254),
  company TEXT NOT NULL CHECK(length(company) BETWEEN 2 AND 160),
  role TEXT NOT NULL CHECK(length(role) BETWEEN 2 AND 120),
  company_size TEXT NOT NULL,
  active_contracts TEXT NOT NULL,
  current_tools TEXT NOT NULL CHECK(length(current_tools) BETWEEN 2 AND 500),
  pain_point TEXT NOT NULL CHECK(length(pain_point) BETWEEN 20 AND 2000),
  source TEXT NOT NULL DEFAULT 'anor-landing',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','qualified','pilot','closed')),
  consent INTEGER NOT NULL CHECK(consent = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_anor_beta_email ON anor_beta_applications(lower(email));
CREATE INDEX IF NOT EXISTS idx_anor_beta_created ON anor_beta_applications(created_at DESC);
