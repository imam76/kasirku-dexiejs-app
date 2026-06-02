CREATE TABLE IF NOT EXISTS sales_documents (
    id TEXT PRIMARY KEY,
    document_number TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    contact_id TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_email TEXT,
    customer_address TEXT,
    customer_company_name TEXT,
    customer_tax_number TEXT,
    department_id TEXT,
    department_code TEXT,
    department_name TEXT,
    project_id TEXT,
    project_code TEXT,
    project_name TEXT,
    document_date TEXT NOT NULL,
    expired_at TEXT,
    due_date TEXT,
    warehouse_id TEXT,
    warehouse_code TEXT,
    warehouse_name TEXT,
    source_document_id TEXT,
    source_document_number TEXT,
    source_document_type TEXT,
    subtotal_amount DOUBLE PRECISION,
    discount_type TEXT,
    discount_value DOUBLE PRECISION,
    discount_amount DOUBLE PRECISION,
    discount_account_id TEXT,
    discount_account_code TEXT,
    discount_account_name TEXT,
    tax_id TEXT,
    tax_name TEXT,
    tax_code TEXT,
    tax_rate DOUBLE PRECISION,
    tax_calculation_mode TEXT,
    tax_amount DOUBLE PRECISION,
    total_amount DOUBLE PRECISION,
    payment_status TEXT,
    paid_amount DOUBLE PRECISION,
    paid_at TEXT,
    payment_method TEXT,
    cash_account_id TEXT,
    cash_account_code TEXT,
    cash_account_name TEXT,
    finance_transaction_id TEXT,
    notes TEXT,
    issued_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_documents_document_number ON sales_documents (document_number);
CREATE INDEX IF NOT EXISTS idx_sales_documents_type ON sales_documents (type);
CREATE INDEX IF NOT EXISTS idx_sales_documents_status ON sales_documents (status);
CREATE INDEX IF NOT EXISTS idx_sales_documents_contact_id ON sales_documents (contact_id);
CREATE INDEX IF NOT EXISTS idx_sales_documents_document_date ON sales_documents (document_date);
CREATE INDEX IF NOT EXISTS idx_sales_documents_due_date ON sales_documents (due_date);
CREATE INDEX IF NOT EXISTS idx_sales_documents_payment_status ON sales_documents (payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_documents_source_document_id ON sales_documents (source_document_id);
CREATE INDEX IF NOT EXISTS idx_sales_documents_project_id ON sales_documents (project_id);
CREATE INDEX IF NOT EXISTS idx_sales_documents_department_id ON sales_documents (department_id);
CREATE INDEX IF NOT EXISTS idx_sales_documents_updated_at ON sales_documents (updated_at);

CREATE TABLE IF NOT EXISTS sales_document_items (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES sales_documents (id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sku TEXT,
    unit TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    ordered_quantity DOUBLE PRECISION,
    delivered_quantity DOUBLE PRECISION,
    price DOUBLE PRECISION,
    discount_type TEXT,
    discount_value DOUBLE PRECISION,
    discount_amount DOUBLE PRECISION,
    tax_id TEXT,
    tax_name TEXT,
    tax_code TEXT,
    tax_rate DOUBLE PRECISION,
    tax_calculation_mode TEXT,
    tax_base_amount DOUBLE PRECISION,
    tax_amount DOUBLE PRECISION,
    subtotal DOUBLE PRECISION,
    total_amount DOUBLE PRECISION,
    purchase_price DOUBLE PRECISION,
    original_price DOUBLE PRECISION,
    is_price_edited BOOLEAN,
    price_edited_by TEXT,
    price_edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_document_items_document_id ON sales_document_items (document_id);
CREATE INDEX IF NOT EXISTS idx_sales_document_items_product_id ON sales_document_items (product_id);
