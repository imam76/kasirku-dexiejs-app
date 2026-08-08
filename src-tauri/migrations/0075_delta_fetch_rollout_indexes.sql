-- Cursor pagination indexes for the delta-fetch rollout: employees bundle, purchase_documents,
-- finance_account_mappings (all now paginate on updated_at), plus the new stock_mutations,
-- inventory_lots and inventory_lot_consumptions pull paths (stock_mutations/inventory_lot_consumptions
-- cursor on created_at, being append-only ledgers; inventory_lots cursors on updated_at).
-- Index only, no schema/data change.

CREATE INDEX IF NOT EXISTS idx_employees_updated_at_id
    ON employees (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_employee_areas_updated_at_id
    ON employee_areas (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_employee_collection_schedules_updated_at_id
    ON employee_collection_schedules (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_updated_at_id
    ON purchase_documents (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_finance_account_mappings_updated_at_id
    ON finance_account_mappings (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_stock_mutations_created_at_id
    ON stock_mutations (created_at, id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_updated_at_id
    ON inventory_lots (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_inventory_lot_consumptions_created_at_id
    ON inventory_lot_consumptions (created_at, id);
