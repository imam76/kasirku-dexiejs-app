-- Cursor pagination indexes for the delta-fetch rollout of finance_transactions and
-- cashier_sessions (both now paginate on updated_at). Index only, no schema/data change.

CREATE INDEX IF NOT EXISTS idx_finance_transactions_updated_at_id
    ON finance_transactions (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_updated_at_id
    ON cashier_sessions (updated_at, id);
