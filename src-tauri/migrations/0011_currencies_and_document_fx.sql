CREATE TABLE IF NOT EXISTS currencies (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    symbol TEXT,
    decimal_places INTEGER NOT NULL DEFAULT 2,
    is_base BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_currencies_single_base ON currencies (is_base) WHERE is_base = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_currencies_code ON currencies (code);
CREATE INDEX IF NOT EXISTS idx_currencies_is_active ON currencies (is_active);

INSERT INTO currencies (
    id,
    code,
    name,
    symbol,
    decimal_places,
    is_base,
    is_active,
    created_at,
    updated_at
)
VALUES (
    'IDR',
    'IDR',
    'Rupiah Indonesia',
    'Rp',
    2,
    TRUE,
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS currency_rates (
    id TEXT PRIMARY KEY,
    currency_code TEXT NOT NULL,
    base_currency_code TEXT NOT NULL DEFAULT 'IDR',
    rate_date TEXT NOT NULL,
    source TEXT NOT NULL,
    unit_amount DOUBLE PRECISION NOT NULL DEFAULT 1,
    bi_buy_rate DOUBLE PRECISION,
    bi_sell_rate DOUBLE PRECISION,
    middle_rate DOUBLE PRECISION NOT NULL,
    fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_currency_rates_currency_code ON currency_rates (currency_code);
CREATE INDEX IF NOT EXISTS idx_currency_rates_base_currency_code ON currency_rates (base_currency_code);
CREATE INDEX IF NOT EXISTS idx_currency_rates_rate_date ON currency_rates (rate_date);
CREATE INDEX IF NOT EXISTS idx_currency_rates_source ON currency_rates (source);

INSERT INTO currency_rates (
    id,
    currency_code,
    base_currency_code,
    rate_date,
    source,
    unit_amount,
    bi_buy_rate,
    bi_sell_rate,
    middle_rate,
    fetched_at,
    created_at,
    updated_at
)
VALUES (
    'IDR-' || CURRENT_DATE::TEXT || '-SYSTEM',
    'IDR',
    'IDR',
    CURRENT_DATE::TEXT,
    'SYSTEM',
    1,
    1,
    1,
    1,
    NOW(),
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS currency_code TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS currency_name TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS currency_symbol TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS base_currency_code TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS exchange_rate DOUBLE PRECISION;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS exchange_rate_basis TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS exchange_rate_date TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS foreign_subtotal_amount DOUBLE PRECISION;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS foreign_discount_amount DOUBLE PRECISION;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS foreign_tax_amount DOUBLE PRECISION;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS foreign_total_amount DOUBLE PRECISION;

UPDATE sales_documents
SET
    currency_code = COALESCE(currency_code, 'IDR'),
    currency_name = COALESCE(currency_name, 'Rupiah Indonesia'),
    currency_symbol = COALESCE(currency_symbol, 'Rp'),
    base_currency_code = COALESCE(base_currency_code, 'IDR'),
    exchange_rate = COALESCE(exchange_rate, 1),
    exchange_rate_source = COALESCE(exchange_rate_source, 'SYSTEM'),
    exchange_rate_basis = COALESCE(exchange_rate_basis, 'MID'),
    exchange_rate_date = COALESCE(exchange_rate_date, document_date),
    foreign_subtotal_amount = COALESCE(foreign_subtotal_amount, subtotal_amount),
    foreign_discount_amount = COALESCE(foreign_discount_amount, discount_amount),
    foreign_tax_amount = COALESCE(foreign_tax_amount, tax_amount),
    foreign_total_amount = COALESCE(foreign_total_amount, total_amount);

CREATE INDEX IF NOT EXISTS idx_sales_documents_currency_code ON sales_documents (currency_code);

ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS currency_code TEXT;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS exchange_rate DOUBLE PRECISION;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS exchange_rate_basis TEXT;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS exchange_rate_date TEXT;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS foreign_price DOUBLE PRECISION;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS foreign_discount_amount DOUBLE PRECISION;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS foreign_tax_base_amount DOUBLE PRECISION;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS foreign_tax_amount DOUBLE PRECISION;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS foreign_subtotal DOUBLE PRECISION;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS foreign_total_amount DOUBLE PRECISION;

UPDATE sales_document_items
SET
    currency_code = COALESCE(currency_code, 'IDR'),
    exchange_rate = COALESCE(exchange_rate, 1),
    exchange_rate_source = COALESCE(exchange_rate_source, 'SYSTEM'),
    exchange_rate_basis = COALESCE(exchange_rate_basis, 'MID'),
    exchange_rate_date = COALESCE(exchange_rate_date, created_at::DATE::TEXT),
    foreign_price = COALESCE(foreign_price, price),
    foreign_discount_amount = COALESCE(foreign_discount_amount, discount_amount),
    foreign_tax_base_amount = COALESCE(foreign_tax_base_amount, tax_base_amount),
    foreign_tax_amount = COALESCE(foreign_tax_amount, tax_amount),
    foreign_subtotal = COALESCE(foreign_subtotal, subtotal),
    foreign_total_amount = COALESCE(foreign_total_amount, total_amount);

CREATE INDEX IF NOT EXISTS idx_sales_document_items_currency_code ON sales_document_items (currency_code);

ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS currency_code TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS currency_name TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS currency_symbol TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS base_currency_code TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS exchange_rate DOUBLE PRECISION;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS exchange_rate_basis TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS exchange_rate_date TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS foreign_subtotal_amount DOUBLE PRECISION;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS foreign_discount_amount DOUBLE PRECISION;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS foreign_tax_amount DOUBLE PRECISION;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS foreign_total_amount DOUBLE PRECISION;

UPDATE purchase_documents
SET
    currency_code = COALESCE(currency_code, 'IDR'),
    currency_name = COALESCE(currency_name, 'Rupiah Indonesia'),
    currency_symbol = COALESCE(currency_symbol, 'Rp'),
    base_currency_code = COALESCE(base_currency_code, 'IDR'),
    exchange_rate = COALESCE(exchange_rate, 1),
    exchange_rate_source = COALESCE(exchange_rate_source, 'SYSTEM'),
    exchange_rate_basis = COALESCE(exchange_rate_basis, 'MID'),
    exchange_rate_date = COALESCE(exchange_rate_date, document_date),
    foreign_subtotal_amount = COALESCE(foreign_subtotal_amount, subtotal_amount),
    foreign_discount_amount = COALESCE(foreign_discount_amount, discount_amount),
    foreign_tax_amount = COALESCE(foreign_tax_amount, tax_amount),
    foreign_total_amount = COALESCE(foreign_total_amount, total_amount);

CREATE INDEX IF NOT EXISTS idx_purchase_documents_currency_code ON purchase_documents (currency_code);

ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS currency_code TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS exchange_rate DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS exchange_rate_basis TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS exchange_rate_date TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS foreign_price DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS foreign_discount_amount DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS foreign_tax_base_amount DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS foreign_tax_amount DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS foreign_subtotal DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS foreign_total_amount DOUBLE PRECISION;

UPDATE purchase_document_items
SET
    currency_code = COALESCE(currency_code, 'IDR'),
    exchange_rate = COALESCE(exchange_rate, 1),
    exchange_rate_source = COALESCE(exchange_rate_source, 'SYSTEM'),
    exchange_rate_basis = COALESCE(exchange_rate_basis, 'MID'),
    exchange_rate_date = COALESCE(exchange_rate_date, created_at::DATE::TEXT),
    foreign_price = COALESCE(foreign_price, price),
    foreign_discount_amount = COALESCE(foreign_discount_amount, discount_amount),
    foreign_tax_base_amount = COALESCE(foreign_tax_base_amount, tax_base_amount),
    foreign_tax_amount = COALESCE(foreign_tax_amount, tax_amount),
    foreign_subtotal = COALESCE(foreign_subtotal, subtotal),
    foreign_total_amount = COALESCE(foreign_total_amount, total_amount);

CREATE INDEX IF NOT EXISTS idx_purchase_document_items_currency_code ON purchase_document_items (currency_code);
