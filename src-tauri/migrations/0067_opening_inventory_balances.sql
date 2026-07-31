ALTER TABLE opening_balance_lines
    ADD COLUMN IF NOT EXISTS product_id TEXT,
    ADD COLUMN IF NOT EXISTS product_sku TEXT,
    ADD COLUMN IF NOT EXISTS product_name TEXT,
    ADD COLUMN IF NOT EXISTS quantity DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS unit TEXT,
    ADD COLUMN IF NOT EXISTS unit_cost DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS inventory_lot_id TEXT;

ALTER TABLE stock_mutations
    DROP CONSTRAINT IF EXISTS chk_stock_mutations_quantity_delta_non_zero;

ALTER TABLE stock_mutations
    ADD CONSTRAINT chk_stock_mutations_quantity_delta_non_zero
    CHECK (quantity_delta <> 0 OR source_type = 'OPENING_BALANCE');

CREATE INDEX IF NOT EXISTS idx_opening_balance_lines_batch_product_id
    ON opening_balance_lines (batch_id, product_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_opening_balance_lines_inventory_batch_product
    ON opening_balance_lines (batch_id, product_id)
    WHERE module = 'INVENTORY';

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_inventory_opening_source
    ON journal_entries (source_id, source_event)
    WHERE source_type = 'OPENING_BALANCE'
      AND source_event = 'INVENTORY_OPENING_BALANCE_POSTED'
      AND status = 'POSTED'
      AND deleted_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_opening_balance_lines_inventory_fields'
          AND conrelid = 'opening_balance_lines'::REGCLASS
    ) THEN
        ALTER TABLE opening_balance_lines
            ADD CONSTRAINT chk_opening_balance_lines_inventory_fields
            CHECK (
                module <> 'INVENTORY'
                OR (
                    NULLIF(BTRIM(product_id), '') IS NOT NULL
                    AND NULLIF(BTRIM(product_name), '') IS NOT NULL
                    AND quantity > 0
                    AND NULLIF(BTRIM(unit), '') IS NOT NULL
                    AND unit_cost > 0
                    AND NULLIF(BTRIM(inventory_lot_id), '') IS NOT NULL
                    AND base_amount > 0
                    AND debit > 0
                    AND credit = 0
                )
            );
    END IF;
END
$$;
