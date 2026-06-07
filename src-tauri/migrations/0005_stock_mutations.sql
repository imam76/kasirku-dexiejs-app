CREATE TABLE IF NOT EXISTS stock_mutations (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    sku TEXT,
    warehouse_id TEXT,
    warehouse_code TEXT,
    warehouse_name TEXT,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_number TEXT,
    source_line_id TEXT NOT NULL,
    quantity_delta DOUBLE PRECISION NOT NULL,
    unit TEXT NOT NULL,
    stock_unit TEXT NOT NULL,
    source_quantity DOUBLE PRECISION,
    source_unit TEXT,
    reason TEXT,
    actor_user_id TEXT,
    actor_user_name TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_stock_mutations_quantity_delta_non_zero CHECK (quantity_delta <> 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_mutations_source_event
ON stock_mutations (source_type, source_id, source_line_id);

CREATE INDEX IF NOT EXISTS idx_stock_mutations_product_id ON stock_mutations (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_mutations_source ON stock_mutations (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_stock_mutations_occurred_at ON stock_mutations (occurred_at);
