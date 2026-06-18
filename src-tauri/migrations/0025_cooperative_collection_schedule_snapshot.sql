ALTER TABLE cooperative_loans
  ADD COLUMN IF NOT EXISTS officer_id TEXT,
  ADD COLUMN IF NOT EXISTS officer_name TEXT,
  ADD COLUMN IF NOT EXISTS officer_position TEXT,
  ADD COLUMN IF NOT EXISTS area_id TEXT,
  ADD COLUMN IF NOT EXISTS area_name TEXT,
  ADD COLUMN IF NOT EXISTS area_code TEXT,
  ADD COLUMN IF NOT EXISTS collection_schedule_id TEXT,
  ADD COLUMN IF NOT EXISTS collection_weekday INTEGER;

UPDATE cooperative_loans AS loan
SET
  officer_id = COALESCE(loan.officer_id, member.officer_id),
  officer_name = COALESCE(loan.officer_name, member.officer_name),
  officer_position = COALESCE(loan.officer_position, member.officer_position),
  area_id = COALESCE(loan.area_id, member.area_id),
  area_name = COALESCE(loan.area_name, member.area_name),
  area_code = COALESCE(loan.area_code, member.area_code)
FROM cooperative_members AS member
WHERE loan.member_id = member.id
  AND loan.status IN ('DISBURSED', 'PAID_OFF')
  AND (
    loan.officer_id IS NULL OR
    loan.officer_name IS NULL OR
    loan.officer_position IS NULL OR
    loan.area_id IS NULL OR
    loan.area_name IS NULL OR
    loan.area_code IS NULL
  );

WITH first_installments AS (
  SELECT DISTINCT ON (installment.loan_id)
    installment.loan_id,
    installment.due_date
  FROM cooperative_loan_installments AS installment
  WHERE NULLIF(BTRIM(installment.due_date), '') IS NOT NULL
  ORDER BY
    installment.loan_id,
    installment.installment_number,
    installment.due_date
)
UPDATE cooperative_loans AS loan
SET collection_weekday = EXTRACT(
  ISODOW FROM (first_installment.due_date::TIMESTAMPTZ AT TIME ZONE 'Asia/Jakarta')
)::INTEGER
FROM first_installments AS first_installment
WHERE loan.id = first_installment.loan_id
  AND loan.status IN ('DISBURSED', 'PAID_OFF')
  AND loan.collection_weekday IS NULL;

CREATE INDEX IF NOT EXISTS idx_cooperative_loans_officer_id
ON cooperative_loans (officer_id);

CREATE INDEX IF NOT EXISTS idx_cooperative_loans_area_id
ON cooperative_loans (area_id);

CREATE INDEX IF NOT EXISTS idx_cooperative_loans_collection_schedule_id
ON cooperative_loans (collection_schedule_id);
