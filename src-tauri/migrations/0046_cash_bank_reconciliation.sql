CREATE TABLE IF NOT EXISTS cash_bank_reconciliations (
    id TEXT PRIMARY KEY,
    reconciliation_number TEXT NOT NULL,
    cash_account_id TEXT NOT NULL,
    cash_account_code TEXT,
    cash_account_name TEXT NOT NULL,
    statement_date TIMESTAMPTZ NOT NULL,
    statement_reference TEXT,
    statement_ending_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
    book_balance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    cleared_balance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    selected_transaction_total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    selected_transaction_count INTEGER NOT NULL DEFAULT 0,
    selected_transaction_ids TEXT[] NOT NULL DEFAULT '{}',
    difference_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    notes TEXT,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cash_bank_reconciliations_number
ON cash_bank_reconciliations (reconciliation_number);

CREATE INDEX IF NOT EXISTS idx_cash_bank_reconciliations_cash_account_id
ON cash_bank_reconciliations (cash_account_id);

CREATE INDEX IF NOT EXISTS idx_cash_bank_reconciliations_statement_date
ON cash_bank_reconciliations (statement_date);

CREATE INDEX IF NOT EXISTS idx_cash_bank_reconciliations_status
ON cash_bank_reconciliations (status);

CREATE INDEX IF NOT EXISTS idx_cash_bank_reconciliations_updated_at
ON cash_bank_reconciliations (updated_at);

ALTER TABLE finance_transactions
ADD COLUMN IF NOT EXISTS cash_bank_reconciliation_id TEXT,
ADD COLUMN IF NOT EXISTS cash_bank_reconciled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cash_bank_reconciled_by TEXT,
ADD COLUMN IF NOT EXISTS cash_bank_reconciled_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_cash_bank_reconciliation_id
ON finance_transactions (cash_bank_reconciliation_id);

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON cash_bank_reconciliations;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON cash_bank_reconciliations
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
