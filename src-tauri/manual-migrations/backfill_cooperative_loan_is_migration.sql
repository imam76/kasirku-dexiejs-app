-- ============================================================================
-- BACKFILL: cooperative_loans.is_migration untuk data yang dibuat SEBELUM
-- kolom is_migration ada (nilainya NULL di remote).
-- File ini disimpan di manual-migrations agar tidak dijalankan sqlx::migrate!.
--
-- Jalankan MANUAL di Postgres remote (bukan lewat sqlx migrate) SETELAH
-- migrasi 0044 ter-apply. Aman diulang (idempotent).
--
-- Penanda migrasi: activity_logs action='COOPERATIVE_LOAN_MIGRATED' (otoritatif),
-- dengan sidik struktural sebagai cross-check.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) PRATINJAU (dry-run) — jalankan dulu, cek jumlah & daftar sebelum UPDATE.
-- ----------------------------------------------------------------------------
SELECT
  l.id,
  l.loan_number,
  l.member_name,
  l.status,
  l.net_disbursement_amount,
  l.finance_transaction_id,
  l.cash_account_id,
  l.journal_entry_id,
  l.is_migration AS is_migration_now
FROM cooperative_loans l
WHERE EXISTS (
  SELECT 1 FROM activity_logs a
  WHERE a.entity = 'cooperativeLoans'
    AND a.entity_id = l.id
    AND a.action = 'COOPERATIVE_LOAN_MIGRATED'
)
AND l.is_migration IS DISTINCT FROM TRUE
ORDER BY l.updated_at DESC;

-- ----------------------------------------------------------------------------
-- 2) BACKFILL definitif via activity_logs (otoritatif).
--    Bump updated_at = NOW() supaya client offline menangkapnya saat pull.
-- ----------------------------------------------------------------------------
UPDATE cooperative_loans l
SET is_migration = TRUE,
    updated_at   = NOW()
WHERE EXISTS (
  SELECT 1 FROM activity_logs a
  WHERE a.entity = 'cooperativeLoans'
    AND a.entity_id = l.id
    AND a.action = 'COOPERATIVE_LOAN_MIGRATED'
)
AND l.is_migration IS DISTINCT FROM TRUE;

-- ----------------------------------------------------------------------------
-- 3) CROSS-CHECK struktural — loan migrasi yang activity log-nya BELUM sync
--    ke remote. Tinjau hasilnya dulu; ini heuristik, bukan otoritatif.
--    Sidik migrasi: DISBURSED/PAID_OFF, tanpa kas & tanpa finance txn, net = 0.
-- ----------------------------------------------------------------------------
SELECT
  l.id, l.loan_number, l.member_name, l.status,
  l.net_disbursement_amount, l.is_migration
FROM cooperative_loans l
WHERE l.status IN ('DISBURSED', 'PAID_OFF')
  AND l.finance_transaction_id IS NULL
  AND l.cash_account_id IS NULL
  AND l.journal_entry_id IS NULL
  AND COALESCE(l.net_disbursement_amount, 0) = 0
  AND l.is_migration IS DISTINCT FROM TRUE;

-- Kalau daftar di atas benar semua migrasi, jalankan UPDATE ini:
-- UPDATE cooperative_loans l
-- SET is_migration = TRUE, updated_at = NOW()
-- WHERE l.status IN ('DISBURSED', 'PAID_OFF')
--   AND l.finance_transaction_id IS NULL
--   AND l.cash_account_id IS NULL
--   AND l.journal_entry_id IS NULL
--   AND COALESCE(l.net_disbursement_amount, 0) = 0
--   AND l.is_migration IS DISTINCT FROM TRUE;

-- ----------------------------------------------------------------------------
-- 4) (Opsional, kosmetik) Normalisasi sisa NULL -> FALSE untuk loan non-migrasi,
--    biar konsisten dengan tulisan baru yang push `false`. Tidak wajib —
--    mapper client memperlakukan NULL = false. TIDAK bump updated_at supaya
--    tidak memicu re-sync massal.
-- ----------------------------------------------------------------------------
-- UPDATE cooperative_loans
-- SET is_migration = FALSE
-- WHERE is_migration IS NULL;

-- Cek dulu hasil langkah 1-3 lalu:
-- COMMIT;   -- kalau sudah yakin
-- ROLLBACK; -- kalau mau batal
ROLLBACK;
