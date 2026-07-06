CREATE TABLE IF NOT EXISTS closing_runs (
    id TEXT PRIMARY KEY,
    period_id TEXT NOT NULL,
    period_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    retained_earning_account_id TEXT NOT NULL,
    retained_earning_account_code TEXT NOT NULL,
    retained_earning_account_name TEXT NOT NULL,
    net_income_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_revenue_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_contra_revenue_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_expense_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    closing_journal_entry_id TEXT,
    posted_at TIMESTAMPTZ,
    reversed_at TIMESTAMPTZ,
    reversed_by TEXT,
    reversed_by_name TEXT,
    reversal_journal_entry_id TEXT,
    reversal_reason TEXT,
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_closing_runs_period_id
ON closing_runs (period_id);

CREATE INDEX IF NOT EXISTS idx_closing_runs_status
ON closing_runs (status);

CREATE INDEX IF NOT EXISTS idx_closing_runs_updated_at
ON closing_runs (updated_at);

-- Hanya boleh ada satu closing run POSTED per periode; mencegah dua device
-- menutup buku periode yang sama secara bersamaan.
CREATE UNIQUE INDEX IF NOT EXISTS uq_closing_runs_period_posted
ON closing_runs (period_id)
WHERE status = 'POSTED' AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON closing_runs;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON closing_runs
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
