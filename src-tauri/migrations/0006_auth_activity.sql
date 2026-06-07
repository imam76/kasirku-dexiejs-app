CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users (role);
CREATE INDEX IF NOT EXISTS idx_auth_users_is_active ON auth_users (is_active);
CREATE INDEX IF NOT EXISTS idx_auth_users_updated_at ON auth_users (updated_at);

CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_name TEXT,
    role TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs (action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs (entity);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at);
