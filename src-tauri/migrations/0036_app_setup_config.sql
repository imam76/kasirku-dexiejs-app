CREATE TABLE IF NOT EXISTS app_setup_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    enabled_modules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    configured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    configured_by TEXT NOT NULL,
    module_catalog_version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT app_setup_config_singleton CHECK (id = 'default')
);
