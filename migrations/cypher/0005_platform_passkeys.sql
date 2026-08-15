PRAGMA foreign_keys = ON;

ALTER TABLE platform_webauthn_challenges ADD COLUMN challenge TEXT;
ALTER TABLE platform_webauthn_challenges ADD COLUMN request_origin TEXT;

CREATE INDEX IF NOT EXISTS idx_platform_challenges_admin ON platform_webauthn_challenges(admin_id,ceremony,expires_at,used_at);
