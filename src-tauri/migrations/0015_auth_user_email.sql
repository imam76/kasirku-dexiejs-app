ALTER TABLE auth_users
    ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users (email);
