CREATE TABLE IF NOT EXISTS app_instance (
    id TEXT PRIMARY KEY DEFAULT 'default',
    instance_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT app_instance_singleton CHECK (id = 'default')
);
