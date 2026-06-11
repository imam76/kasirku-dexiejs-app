ALTER TABLE cooperative_loans
  ADD COLUMN IF NOT EXISTS interest_calculation_type TEXT,
  ADD COLUMN IF NOT EXISTS billing_frequency TEXT,
  ADD COLUMN IF NOT EXISTS installment_count INTEGER,
  ADD COLUMN IF NOT EXISTS loan_service_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS loan_service_amount DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS admin_fee_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS admin_fee_amount DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mandatory_saving_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mandatory_saving_amount DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS deduction_method TEXT,
  ADD COLUMN IF NOT EXISTS net_disbursement_amount DOUBLE PRECISION;

UPDATE cooperative_loans
SET
  interest_calculation_type = COALESCE(interest_calculation_type, 'MONTHLY_RATE'),
  billing_frequency = COALESCE(billing_frequency, 'MONTHLY'),
  installment_count = COALESCE(installment_count, tenor_months),
  loan_service_rate = COALESCE(loan_service_rate, interest_rate_per_month),
  loan_service_amount = COALESCE(loan_service_amount, total_interest_amount),
  admin_fee_rate = COALESCE(admin_fee_rate, 0),
  admin_fee_amount = COALESCE(admin_fee_amount, 0),
  mandatory_saving_rate = COALESCE(mandatory_saving_rate, 0),
  mandatory_saving_amount = COALESCE(mandatory_saving_amount, 0),
  deduction_method = COALESCE(deduction_method, 'NONE'),
  net_disbursement_amount = COALESCE(net_disbursement_amount, principal_amount);

ALTER TABLE cooperative_loans
  ALTER COLUMN interest_calculation_type SET DEFAULT 'MONTHLY_RATE',
  ALTER COLUMN interest_calculation_type SET NOT NULL,
  ALTER COLUMN billing_frequency SET DEFAULT 'MONTHLY',
  ALTER COLUMN billing_frequency SET NOT NULL,
  ALTER COLUMN installment_count SET DEFAULT 1,
  ALTER COLUMN installment_count SET NOT NULL,
  ALTER COLUMN loan_service_rate SET DEFAULT 0,
  ALTER COLUMN loan_service_rate SET NOT NULL,
  ALTER COLUMN loan_service_amount SET DEFAULT 0,
  ALTER COLUMN loan_service_amount SET NOT NULL,
  ALTER COLUMN admin_fee_rate SET DEFAULT 0,
  ALTER COLUMN admin_fee_rate SET NOT NULL,
  ALTER COLUMN admin_fee_amount SET DEFAULT 0,
  ALTER COLUMN admin_fee_amount SET NOT NULL,
  ALTER COLUMN mandatory_saving_rate SET DEFAULT 0,
  ALTER COLUMN mandatory_saving_rate SET NOT NULL,
  ALTER COLUMN mandatory_saving_amount SET DEFAULT 0,
  ALTER COLUMN mandatory_saving_amount SET NOT NULL,
  ALTER COLUMN deduction_method SET DEFAULT 'NONE',
  ALTER COLUMN deduction_method SET NOT NULL,
  ALTER COLUMN net_disbursement_amount SET DEFAULT 0,
  ALTER COLUMN net_disbursement_amount SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cooperative_loans_interest_calculation_type ON cooperative_loans (interest_calculation_type);
CREATE INDEX IF NOT EXISTS idx_cooperative_loans_billing_frequency ON cooperative_loans (billing_frequency);
