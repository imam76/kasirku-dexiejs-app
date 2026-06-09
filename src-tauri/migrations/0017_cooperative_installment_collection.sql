ALTER TABLE cooperative_loan_installments
ADD COLUMN IF NOT EXISTS collection_status TEXT DEFAULT 'NONE';

ALTER TABLE cooperative_loan_installments
ADD COLUMN IF NOT EXISTS follow_up_date TEXT;

ALTER TABLE cooperative_loan_installments
ADD COLUMN IF NOT EXISTS collection_notes TEXT;

ALTER TABLE cooperative_loan_installments
ADD COLUMN IF NOT EXISTS last_contacted_at TEXT;

UPDATE cooperative_loan_installments
SET collection_status = 'NONE'
WHERE collection_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_collection_status
ON cooperative_loan_installments (collection_status);

CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_follow_up_date
ON cooperative_loan_installments (follow_up_date);
