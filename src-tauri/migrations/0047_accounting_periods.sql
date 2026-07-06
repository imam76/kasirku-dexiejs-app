CREATE TABLE IF NOT EXISTS accounting_periods (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    period_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    locked_by_name TEXT,
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

CREATE INDEX IF NOT EXISTS idx_accounting_periods_status
ON accounting_periods (status);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_start_date
ON accounting_periods (start_date);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_end_date
ON accounting_periods (end_date);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_updated_at
ON accounting_periods (updated_at);

-- Cegah dua periode aktif dengan rentang tanggal identik.
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_periods_range
ON accounting_periods (start_date, end_date)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON accounting_periods;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON accounting_periods
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
