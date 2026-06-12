ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS collector_id TEXT;

ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS collector_name TEXT;

ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS collector_position TEXT;

ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS received_by TEXT;

ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS received_by_name TEXT;

ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

UPDATE cooperative_loan_payments
SET posted_at = COALESCE(posted_at, created_at)
WHERE posted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_collector_id
ON cooperative_loan_payments (collector_id);

CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_received_by
ON cooperative_loan_payments (received_by);
