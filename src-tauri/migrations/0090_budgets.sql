CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    budget_type TEXT NOT NULL,
    category TEXT NOT NULL,
    period_type TEXT NOT NULL,
    period_key TEXT NOT NULL,
    planned_amount DOUBLE PRECISION NOT NULL,
    warning_threshold_percent DOUBLE PRECISION NOT NULL DEFAULT 80,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_budgets_updated_at ON budgets (updated_at);
CREATE INDEX IF NOT EXISTS idx_budgets_is_active ON budgets (is_active);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets (category);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets (period_type, period_key);

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON budgets;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON budgets
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
