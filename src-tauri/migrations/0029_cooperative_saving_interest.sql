ALTER TABLE cooperative_saving_transactions
    ADD COLUMN IF NOT EXISTS withdrawal_source TEXT,
    ADD COLUMN IF NOT EXISTS interest_rate_per_month DOUBLE PRECISION;

UPDATE cooperative_saving_transactions
SET withdrawal_source = 'SAVING'
WHERE transaction_type = 'WITHDRAWAL'
  AND withdrawal_source IS NULL;
