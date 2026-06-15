CREATE TABLE IF NOT EXISTS product_recipes (
    id TEXT PRIMARY KEY,
    finished_product_id TEXT NOT NULL REFERENCES products(id),
    finished_product_name TEXT NOT NULL,
    output_quantity DOUBLE PRECISION NOT NULL,
    output_unit TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_recipes_finished_product_id ON product_recipes (finished_product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_updated_at ON product_recipes (updated_at);

CREATE TABLE IF NOT EXISTS product_recipe_items (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES product_recipes(id) ON DELETE CASCADE,
    material_product_id TEXT NOT NULL REFERENCES products(id),
    material_product_name TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    unit TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_recipe_items_recipe_id ON product_recipe_items (recipe_id);
CREATE INDEX IF NOT EXISTS idx_product_recipe_items_material_product_id ON product_recipe_items (material_product_id);

CREATE TABLE IF NOT EXISTS production_orders (
    id TEXT PRIMARY KEY,
    production_number TEXT NOT NULL,
    status TEXT NOT NULL,
    finished_product_id TEXT NOT NULL REFERENCES products(id),
    finished_product_name TEXT NOT NULL,
    quantity_produced DOUBLE PRECISION NOT NULL,
    unit TEXT NOT NULL,
    material_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    additional_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    unit_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    produced_at TIMESTAMPTZ NOT NULL,
    posted_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    notes TEXT,
    created_by TEXT,
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_orders_number ON production_orders (production_number);
CREATE INDEX IF NOT EXISTS idx_production_orders_status ON production_orders (status);
CREATE INDEX IF NOT EXISTS idx_production_orders_finished_product_id ON production_orders (finished_product_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_produced_at ON production_orders (produced_at);
CREATE INDEX IF NOT EXISTS idx_production_orders_updated_at ON production_orders (updated_at);

CREATE TABLE IF NOT EXISTS production_order_items (
    id TEXT PRIMARY KEY,
    production_order_id TEXT NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    material_product_id TEXT NOT NULL REFERENCES products(id),
    material_product_name TEXT NOT NULL,
    sku TEXT,
    quantity_used DOUBLE PRECISION NOT NULL,
    unit TEXT NOT NULL,
    stock_quantity_used DOUBLE PRECISION NOT NULL,
    stock_unit TEXT NOT NULL,
    cost_per_unit DOUBLE PRECISION NOT NULL,
    total_cost DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_production_order_items_order_id ON production_order_items (production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_order_items_material_product_id ON production_order_items (material_product_id);

CREATE TABLE IF NOT EXISTS production_order_costs (
    id TEXT PRIMARY KEY,
    production_order_id TEXT NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_production_order_costs_order_id ON production_order_costs (production_order_id);
