ALTER TABLE finance_transactions
ADD COLUMN IF NOT EXISTS field_cash_session_id TEXT,
ADD COLUMN IF NOT EXISTS field_cash_session_number TEXT,
ADD COLUMN IF NOT EXISTS field_employee_id TEXT,
ADD COLUMN IF NOT EXISTS field_employee_name TEXT,
ADD COLUMN IF NOT EXISTS field_cash_movement_kind TEXT;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_field_cash_session_id
ON finance_transactions (field_cash_session_id);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_field_employee_id
ON finance_transactions (field_employee_id);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_field_cash_movement_kind
ON finance_transactions (field_cash_movement_kind);
