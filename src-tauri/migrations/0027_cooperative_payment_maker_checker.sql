CREATE TABLE IF NOT EXISTS cooperative_payment_approval_requests (
    id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payment_id TEXT,
    installment_id TEXT,
    idempotency_key TEXT,
    amount DOUBLE PRECISION,
    payment_date TIMESTAMPTZ,
    payment_method TEXT,
    cash_account_id TEXT,
    payment_channel TEXT,
    collector_id TEXT,
    maker_reason TEXT NOT NULL,
    maker_user_id TEXT NOT NULL,
    maker_user_name TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    checker_user_id TEXT,
    checker_user_name TEXT,
    checker_notes TEXT,
    decided_at TIMESTAMPTZ,
    result_payment_id TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT cooperative_payment_approval_action_check
      CHECK (action_type IN ('BACKDATE', 'REVERSAL')),
    CONSTRAINT cooperative_payment_approval_status_check
      CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT cooperative_payment_approval_reason_check
      CHECK (LENGTH(BTRIM(maker_reason)) >= 3),
    CONSTRAINT cooperative_payment_approval_checker_check
      CHECK (
        (
          status = 'PENDING' AND
          checker_user_id IS NULL AND
          checker_user_name IS NULL AND
          decided_at IS NULL AND
          result_payment_id IS NULL
        ) OR (
          status IN ('APPROVED', 'REJECTED') AND
          checker_user_id IS NOT NULL AND
          checker_user_name IS NOT NULL AND
          decided_at IS NOT NULL AND
          checker_user_id <> maker_user_id AND
          (result_payment_id IS NULL OR status = 'APPROVED')
        )
      ),
    CONSTRAINT cooperative_payment_approval_payload_check
      CHECK (
        (
          action_type = 'BACKDATE' AND
          payment_id IS NULL AND
          installment_id IS NOT NULL AND
          idempotency_key IS NOT NULL AND
          amount > 0 AND
          payment_date IS NOT NULL AND
          payment_method IN ('TUNAI', 'NON_TUNAI') AND
          cash_account_id IS NOT NULL
        ) OR (
          action_type = 'REVERSAL' AND
          payment_id IS NOT NULL
        )
      )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperative_payment_approval_idempotency
ON cooperative_payment_approval_requests (idempotency_key)
WHERE action_type = 'BACKDATE' AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperative_payment_pending_reversal
ON cooperative_payment_approval_requests (payment_id)
WHERE action_type = 'REVERSAL' AND status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_cooperative_payment_approval_status
ON cooperative_payment_approval_requests (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_cooperative_payment_approval_maker
ON cooperative_payment_approval_requests (maker_user_id, requested_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_payment_approval_requests'::regclass
      AND conname = 'cooperative_payment_approval_payment_fk'
  ) THEN
    ALTER TABLE cooperative_payment_approval_requests
    ADD CONSTRAINT cooperative_payment_approval_payment_fk
    FOREIGN KEY (payment_id) REFERENCES cooperative_loan_payments (id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_payment_approval_requests'::regclass
      AND conname = 'cooperative_payment_approval_installment_fk'
  ) THEN
    ALTER TABLE cooperative_payment_approval_requests
    ADD CONSTRAINT cooperative_payment_approval_installment_fk
    FOREIGN KEY (installment_id) REFERENCES cooperative_loan_installments (id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_payment_approval_requests'::regclass
      AND conname = 'cooperative_payment_approval_result_payment_fk'
  ) THEN
    ALTER TABLE cooperative_payment_approval_requests
    ADD CONSTRAINT cooperative_payment_approval_result_payment_fk
    FOREIGN KEY (result_payment_id) REFERENCES cooperative_loan_payments (id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_loan_installments'::regclass
      AND conname = 'cooperative_loan_installments_paid_not_over_billed_check'
  ) THEN
    ALTER TABLE cooperative_loan_installments
    ADD CONSTRAINT cooperative_loan_installments_paid_not_over_billed_check
    CHECK (
      paid_principal_amount <= principal_amount + 0.01 AND
      paid_interest_amount <= interest_amount + 0.01 AND
      paid_penalty_amount <= penalty_amount + 0.01
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cooperative_loan_payments'::regclass
      AND conname = 'cooperative_loan_payments_installment_required_check'
  ) THEN
    ALTER TABLE cooperative_loan_payments
    ADD CONSTRAINT cooperative_loan_payments_installment_required_check
    CHECK (installment_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION validate_cooperative_payment_installment_reconciliation(
  target_installment_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  installment_record RECORD;
  payment_principal DOUBLE PRECISION;
  payment_interest DOUBLE PRECISION;
  payment_penalty DOUBLE PRECISION;
  invalid_loan_count BIGINT;
BEGIN
  IF target_installment_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    id,
    loan_id,
    paid_principal_amount,
    paid_interest_amount,
    paid_penalty_amount
  INTO installment_record
  FROM cooperative_loan_installments
  WHERE id = target_installment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Angsuran % tidak ditemukan untuk rekonsiliasi pembayaran.', target_installment_id;
  END IF;

  SELECT COUNT(*)
  INTO invalid_loan_count
  FROM cooperative_loan_payments
  WHERE installment_id = target_installment_id
    AND loan_id <> installment_record.loan_id;

  SELECT
    COALESCE(SUM(principal_amount), 0),
    COALESCE(SUM(interest_amount), 0),
    COALESCE(SUM(penalty_amount), 0)
  INTO payment_principal, payment_interest, payment_penalty
  FROM cooperative_loan_payments
  WHERE installment_id = target_installment_id
    AND COALESCE(payment_type, 'PAYMENT') = 'PAYMENT'
    AND status = 'POSTED';

  IF invalid_loan_count > 0 THEN
    RAISE EXCEPTION 'Referensi loan pembayaran tidak sama dengan loan angsuran %.', target_installment_id;
  END IF;

  IF
    ABS(payment_principal - installment_record.paid_principal_amount) > 0.01 OR
    ABS(payment_interest - installment_record.paid_interest_amount) > 0.01 OR
    ABS(payment_penalty - installment_record.paid_penalty_amount) > 0.01
  THEN
    RAISE EXCEPTION
      'Rekonsiliasi pembayaran-vs-angsuran gagal untuk %. Payment=(%, %, %), installment=(%, %, %).',
      target_installment_id,
      payment_principal,
      payment_interest,
      payment_penalty,
      installment_record.paid_principal_amount,
      installment_record.paid_interest_amount,
      installment_record.paid_penalty_amount;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_cooperative_payment_installment_reconciliation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'cooperative_loan_payments' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM validate_cooperative_payment_installment_reconciliation(NEW.installment_id);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM validate_cooperative_payment_installment_reconciliation(OLD.installment_id);
    ELSIF
      NEW.installment_id IS DISTINCT FROM OLD.installment_id OR
      NEW.loan_id IS DISTINCT FROM OLD.loan_id OR
      NEW.principal_amount IS DISTINCT FROM OLD.principal_amount OR
      NEW.interest_amount IS DISTINCT FROM OLD.interest_amount OR
      NEW.penalty_amount IS DISTINCT FROM OLD.penalty_amount OR
      NEW.status IS DISTINCT FROM OLD.status OR
      NEW.payment_type IS DISTINCT FROM OLD.payment_type
    THEN
      PERFORM validate_cooperative_payment_installment_reconciliation(OLD.installment_id);
      IF NEW.installment_id IS DISTINCT FROM OLD.installment_id THEN
        PERFORM validate_cooperative_payment_installment_reconciliation(NEW.installment_id);
      END IF;
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      PERFORM validate_cooperative_payment_installment_reconciliation(NEW.id);
    ELSIF
      NEW.loan_id IS DISTINCT FROM OLD.loan_id OR
      NEW.paid_principal_amount IS DISTINCT FROM OLD.paid_principal_amount OR
      NEW.paid_interest_amount IS DISTINCT FROM OLD.paid_interest_amount OR
      NEW.paid_penalty_amount IS DISTINCT FROM OLD.paid_penalty_amount
    THEN
      PERFORM validate_cooperative_payment_installment_reconciliation(NEW.id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS cooperative_payment_reconciliation_from_payment ON cooperative_loan_payments;

CREATE CONSTRAINT TRIGGER cooperative_payment_reconciliation_from_payment
AFTER INSERT OR UPDATE OR DELETE ON cooperative_loan_payments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_cooperative_payment_installment_reconciliation();

DROP TRIGGER IF EXISTS cooperative_payment_reconciliation_from_installment ON cooperative_loan_installments;

CREATE CONSTRAINT TRIGGER cooperative_payment_reconciliation_from_installment
AFTER INSERT OR UPDATE ON cooperative_loan_installments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_cooperative_payment_installment_reconciliation();
