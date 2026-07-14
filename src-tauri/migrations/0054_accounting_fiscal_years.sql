CREATE TABLE IF NOT EXISTS accounting_fiscal_years (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    closed_at TIMESTAMPTZ,
    closed_by TEXT,
    closed_by_name TEXT,
    closing_journal_entry_id TEXT,
    reopened_at TIMESTAMPTZ,
    reopened_by TEXT,
    reopened_by_name TEXT,
    reopen_reason TEXT,
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

CREATE INDEX IF NOT EXISTS idx_accounting_fiscal_years_status
ON accounting_fiscal_years (status);

CREATE INDEX IF NOT EXISTS idx_accounting_fiscal_years_start_date
ON accounting_fiscal_years (start_date);

CREATE INDEX IF NOT EXISTS idx_accounting_fiscal_years_end_date
ON accounting_fiscal_years (end_date);

CREATE INDEX IF NOT EXISTS idx_accounting_fiscal_years_updated_at
ON accounting_fiscal_years (updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_fiscal_years_range
ON accounting_fiscal_years (start_date, end_date)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fiscal_year_closing_runs (
    id TEXT PRIMARY KEY,
    fiscal_year_id TEXT NOT NULL,
    fiscal_year_name TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_fiscal_year_closing_runs_fiscal_year_id
ON fiscal_year_closing_runs (fiscal_year_id);

CREATE INDEX IF NOT EXISTS idx_fiscal_year_closing_runs_status
ON fiscal_year_closing_runs (status);

CREATE INDEX IF NOT EXISTS idx_fiscal_year_closing_runs_updated_at
ON fiscal_year_closing_runs (updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_year_closing_runs_posted
ON fiscal_year_closing_runs (fiscal_year_id)
WHERE status = 'POSTED' AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON accounting_fiscal_years;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON accounting_fiscal_years
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON fiscal_year_closing_runs;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON fiscal_year_closing_runs
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
