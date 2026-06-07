CREATE TABLE IF NOT EXISTS taxes (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    rate DOUBLE PRECISION NOT NULL,
    rate_type TEXT NOT NULL,
    calculation_mode TEXT NOT NULL,
    description TEXT,
    effective_from TEXT,
    effective_to TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_taxes_name ON taxes (name);
CREATE INDEX IF NOT EXISTS idx_taxes_code ON taxes (code);
CREATE INDEX IF NOT EXISTS idx_taxes_calculation_mode ON taxes (calculation_mode);
CREATE INDEX IF NOT EXISTS idx_taxes_is_default ON taxes (is_default);
CREATE INDEX IF NOT EXISTS idx_taxes_is_active ON taxes (is_active);
