ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS payment_group_id TEXT;

ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS payment_group_number TEXT;

ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS payment_group_sequence INTEGER;

ALTER TABLE cooperative_loan_payments
ADD COLUMN IF NOT EXISTS payment_group_total INTEGER;

ALTER TABLE cooperative_loan_payments
ADD CONSTRAINT cooperative_loan_payment_group_sequence_check
CHECK (
  (
    payment_group_id IS NULL AND
    payment_group_number IS NULL AND
    payment_group_sequence IS NULL AND
    payment_group_total IS NULL
  ) OR (
    payment_group_id IS NOT NULL AND
    payment_group_number IS NOT NULL AND
    payment_group_sequence IS NOT NULL AND
    payment_group_total IS NOT NULL AND
    payment_group_sequence >= 1 AND
    payment_group_total >= payment_group_sequence
  )
) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_payment_group_id
ON cooperative_loan_payments (payment_group_id)
WHERE payment_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_payment_group_number
ON cooperative_loan_payments (payment_group_number)
WHERE payment_group_number IS NOT NULL;
