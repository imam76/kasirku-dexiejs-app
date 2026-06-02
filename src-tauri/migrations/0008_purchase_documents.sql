CREATE TABLE IF NOT EXISTS purchase_documents (
    id TEXT PRIMARY KEY,
    document_number TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    contact_id TEXT,
    supplier_name TEXT NOT NULL,
    supplier_phone TEXT,
    supplier_email TEXT,
    supplier_address TEXT,
    supplier_company_name TEXT,
    supplier_tax_number TEXT,
    department_id TEXT,
    department_code TEXT,
    department_name TEXT,
    project_id TEXT,
    project_code TEXT,
    project_name TEXT,
    document_date TEXT NOT NULL,
    required_date TEXT,
    quotation_due_date TEXT,
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

CREATE INDEX IF NOT EXISTS idx_purchase_documents_document_number ON purchase_documents (document_number);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_type ON purchase_documents (type);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_status ON purchase_documents (status);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_contact_id ON purchase_documents (contact_id);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_document_date ON purchase_documents (document_date);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_due_date ON purchase_documents (due_date);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_payment_status ON purchase_documents (payment_status);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_source_document_id ON purchase_documents (source_document_id);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_project_id ON purchase_documents (project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_department_id ON purchase_documents (department_id);
CREATE INDEX IF NOT EXISTS idx_purchase_documents_updated_at ON purchase_documents (updated_at);

CREATE TABLE IF NOT EXISTS purchase_document_items (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES purchase_documents (id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sku TEXT,
    unit TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    ordered_quantity DOUBLE PRECISION,
    received_quantity DOUBLE PRECISION,
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
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_document_items_document_id ON purchase_document_items (document_id);
CREATE INDEX IF NOT EXISTS idx_purchase_document_items_product_id ON purchase_document_items (product_id);
