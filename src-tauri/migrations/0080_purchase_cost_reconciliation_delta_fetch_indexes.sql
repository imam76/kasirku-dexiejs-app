-- Cursor pagination index for the new purchase_cost_reconciliations pull path (append-only
-- table, cursors on created_at like stock_mutations/inventory_lot_consumptions).
-- purchase_cost_reconciliation_items already has an index on reconciliation_id from migration
-- 0018, which is what the bundle's per-parent item lookup uses - no new index needed there.
-- Index only, no schema/data change.

CREATE INDEX IF NOT EXISTS idx_purchase_cost_reconciliations_created_at_id
    ON purchase_cost_reconciliations (created_at, id);
