CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_type TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    company_name TEXT,
    tax_number TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts (name);
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON contacts (contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_is_active ON contacts (is_active);

CREATE TABLE IF NOT EXISTS warehouses (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_warehouses_name ON warehouses (name);
CREATE INDEX IF NOT EXISTS idx_warehouses_code ON warehouses (code);
CREATE INDEX IF NOT EXISTS idx_warehouses_is_active ON warehouses (is_active);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    purchase_unit TEXT NOT NULL,
    selling_unit TEXT NOT NULL,
    purchase_price DOUBLE PRECISION NOT NULL,
    selling_price DOUBLE PRECISION NOT NULL,
    stock DOUBLE PRECISION NOT NULL DEFAULT 0,
    sku TEXT,
    wholesale_prices JSONB,
    sellable_units JSONB,
    unit_mappings JSONB,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products (sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at);
