-- Cloudflare Workers Web Crypto currently caps PBKDF2 at 100,000 iterations.
-- Existing hashes cannot be re-derived without the user's password. Fail closed instead of
-- silently changing their iteration metadata and locking every migrated account out.
CREATE TABLE cypher_password_migration_guard (
  empty_user_table INTEGER NOT NULL CHECK(empty_user_table = 1)
);
INSERT INTO cypher_password_migration_guard(empty_user_table)
SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END FROM users;
DROP TABLE cypher_password_migration_guard;

-- Preserve the original field as legacy evidence and make the active work factor explicit.
-- Tenant users must be provisioned only after this migration has completed.
ALTER TABLE users RENAME COLUMN password_iterations TO password_iterations_legacy;
ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 100000
  CHECK(password_iterations >= 100000 AND password_iterations <= 100000);
