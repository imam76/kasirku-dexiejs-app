CREATE TABLE IF NOT EXISTS cooperative_areas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cooperative_areas_name ON cooperative_areas (name);
CREATE INDEX IF NOT EXISTS idx_cooperative_areas_code ON cooperative_areas (code);
CREATE INDEX IF NOT EXISTS idx_cooperative_areas_is_active ON cooperative_areas (is_active);
CREATE INDEX IF NOT EXISTS idx_cooperative_areas_updated_at ON cooperative_areas (updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperative_areas_code_active
ON cooperative_areas (code)
WHERE code IS NOT NULL AND is_active = TRUE AND deleted_at IS NULL;
