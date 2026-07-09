ALTER TABLE cooperative_loans
    ADD COLUMN IF NOT EXISTS scheduled_disbursement_date TEXT;

UPDATE cooperative_loans
SET scheduled_disbursement_date = disbursed_at
WHERE scheduled_disbursement_date IS NULL
  AND disbursed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cooperative_loans_scheduled_disbursement_date
    ON cooperative_loans (scheduled_disbursement_date);
