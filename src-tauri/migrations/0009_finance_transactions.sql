CREATE TABLE IF NOT EXISTS finance_transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    description TEXT NOT NULL,
    reference_id TEXT,
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    payment_method TEXT,
    payment_channel TEXT,
    cash_account_id TEXT,
    cash_account_code TEXT,
    cash_account_name TEXT,
    transfer_group_id TEXT,
    transfer_direction TEXT,
    reversal_of_transfer_group_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_type ON finance_transactions (type);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_category ON finance_transactions (category);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_reference_id ON finance_transactions (reference_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_cash_account_id ON finance_transactions (cash_account_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_transfer_group_id ON finance_transactions (transfer_group_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_created_at ON finance_transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_updated_at ON finance_transactions (updated_at);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_deleted_at ON finance_transactions (deleted_at);
