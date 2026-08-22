CREATE TABLE IF NOT EXISTS promos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    applies_to TEXT NOT NULL,
    product_ids TEXT[],
    categories TEXT[],
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    min_qty DOUBLE PRECISION,
    min_total DOUBLE PRECISION,
    voucher_code TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_promos_updated_at ON promos (updated_at);
CREATE INDEX IF NOT EXISTS idx_promos_active ON promos (active);
CREATE INDEX IF NOT EXISTS idx_promos_voucher_code ON promos (voucher_code);

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON promos;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON promos
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
