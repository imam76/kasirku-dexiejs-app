ALTER TABLE cooperative_loans
    ADD COLUMN IF NOT EXISTS reversal_finance_transaction_id TEXT,
    ADD COLUMN IF NOT EXISTS reversal_journal_entry_id TEXT,
    ADD COLUMN IF NOT EXISTS reversed_at TEXT,
    ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_cooperative_loans_reversed_at
    ON cooperative_loans (reversed_at);
