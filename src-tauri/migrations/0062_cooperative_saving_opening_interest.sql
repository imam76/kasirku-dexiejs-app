ALTER TABLE cooperative_saving_transactions
    ADD COLUMN IF NOT EXISTS opening_interest_amount DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS opening_interest_applied_amount DOUBLE PRECISION;
