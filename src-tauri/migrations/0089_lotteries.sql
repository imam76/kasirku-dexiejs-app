CREATE TABLE IF NOT EXISTS lotteries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    min_total DOUBLE PRECISION NOT NULL,
    max_total DOUBLE PRECISION,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lotteries_updated_at ON lotteries (updated_at);
CREATE INDEX IF NOT EXISTS idx_lotteries_active ON lotteries (active);

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON lotteries;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON lotteries
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
