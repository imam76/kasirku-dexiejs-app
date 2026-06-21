CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperative_iptw_single_payout
ON finance_transactions (reference_id)
WHERE category = 'KSP_INSENTIF_PEMBAYARAN_TEPAT_WAKTU'
  AND type = 'EXPENSE'
  AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperative_iptw_single_reversal
ON finance_transactions (reference_id)
WHERE category = 'KSP_INSENTIF_PEMBAYARAN_TEPAT_WAKTU'
  AND type = 'INCOME'
  AND deleted_at IS NULL;
