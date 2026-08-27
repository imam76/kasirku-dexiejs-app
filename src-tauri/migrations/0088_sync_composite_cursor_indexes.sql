-- Complete the `(updated_at, id)` keyset rollout. Earlier migrations already created matching
-- composite indexes for the other incremental endpoints; these tables still had either a
-- timestamp-only index or no delta-fetch index.

CREATE INDEX IF NOT EXISTS idx_fixed_assets_updated_at_id
    ON fixed_assets (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_runs_updated_at_id
    ON fixed_asset_depreciation_runs (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_updated_at_id
    ON journal_entries (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_updated_at_id
    ON payroll_runs (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advances_updated_at_id
    ON employee_cash_advances (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_opening_balance_batches_updated_at_id
    ON opening_balance_batches (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_promos_updated_at_id
    ON promos (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_production_orders_updated_at_id
    ON production_orders (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_updated_at_id
    ON pos_transactions (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_sales_documents_updated_at_id
    ON sales_documents (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_updated_at_id
    ON stock_opnames (updated_at, id);
