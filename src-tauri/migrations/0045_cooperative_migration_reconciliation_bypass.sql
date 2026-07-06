-- Angsuran pinjaman MIGRASI ditandai lunas historis (paid_*) sebagai saldo awal,
-- sengaja TANPA CooperativeLoanPayment. Itu melanggar invariant rekonsiliasi
-- pembayaran-vs-angsuran di 0027 sehingga upsert angsuran migrasi ke remote ditolak.
--
-- Perbaikan: lewati rekonsiliasi untuk angsuran yang loan-nya is_migration = TRUE.
-- Trigger & signature fungsi tidak berubah; hanya menambah guard di awal.
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

  -- Pinjaman migrasi: paid_* adalah saldo awal historis tanpa payment. Lewati rekonsiliasi.
  IF EXISTS (
    SELECT 1
    FROM cooperative_loans
    WHERE id = installment_record.loan_id
      AND is_migration IS TRUE
  ) THEN
    RETURN;
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
