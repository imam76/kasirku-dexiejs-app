CREATE TABLE IF NOT EXISTS stock_opnames (
    id TEXT PRIMARY KEY,
    opname_number TEXT NOT NULL,
    status TEXT NOT NULL,
    counted_at TIMESTAMPTZ NOT NULL,
    reviewed_at TIMESTAMPTZ,
    posted_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    warehouse_id TEXT,
    warehouse_code TEXT,
    warehouse_name TEXT,
    notes TEXT,
    created_by TEXT,
    created_by_name TEXT,
    reviewed_by TEXT,
    reviewed_by_name TEXT,
    posted_by TEXT,
    posted_by_name TEXT,
    cancelled_by TEXT,
    cancelled_by_name TEXT,
    cancel_reason TEXT,
    total_items INTEGER NOT NULL DEFAULT 0,
    total_adjustment_in DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_adjustment_out DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_variance_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_opnames_number ON stock_opnames (opname_number);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_status ON stock_opnames (status);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_counted_at ON stock_opnames (counted_at);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_reviewed_at ON stock_opnames (reviewed_at);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_posted_at ON stock_opnames (posted_at);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_warehouse_id ON stock_opnames (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_updated_at ON stock_opnames (updated_at);

CREATE TABLE IF NOT EXISTS stock_opname_items (
    id TEXT PRIMARY KEY,
    opname_id TEXT NOT NULL REFERENCES stock_opnames (id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sku TEXT,
    category TEXT,
    system_quantity DOUBLE PRECISION NOT NULL,
    counted_quantity DOUBLE PRECISION,
    quantity_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
    unit TEXT NOT NULL,
    cost_per_unit DOUBLE PRECISION NOT NULL DEFAULT 0,
    variance_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_opname_items_opname_id ON stock_opname_items (opname_id);
CREATE INDEX IF NOT EXISTS idx_stock_opname_items_product_id ON stock_opname_items (product_id);
