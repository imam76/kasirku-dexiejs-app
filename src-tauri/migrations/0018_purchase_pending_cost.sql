ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS cost_status TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS delivery_note_number TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS delivery_note_date TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS supplier_invoice_number TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS supplier_invoice_date TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS additional_cost_treatment TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS additional_cost_amount DOUBLE PRECISION;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS supplier_discount_amount DOUBLE PRECISION;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS supplier_tax_amount DOUBLE PRECISION;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS cost_finalized_at TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS cost_finalized_by TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS cost_finalized_by_name TEXT;

UPDATE purchase_documents
SET cost_status = 'FINAL'
WHERE cost_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_documents_cost_status
ON purchase_documents (cost_status);

ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS cost_status TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS estimate_source TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS estimated_price DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS final_price DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS invoiced_quantity DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS quantity_variance DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS additional_cost_allocation DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS supplier_discount_allocation DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS supplier_tax_allocation DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS final_landed_cost_per_unit DOUBLE PRECISION;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS cost_finalized_at TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS cost_variance_amount DOUBLE PRECISION;

UPDATE purchase_document_items
SET cost_status = 'FINAL'
WHERE cost_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_document_items_cost_status
ON purchase_document_items (cost_status);

CREATE TABLE IF NOT EXISTS inventory_lots (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sku TEXT,
    source_type TEXT NOT NULL,
    source_id TEXT,
    source_line_id TEXT,
    quantity_received DOUBLE PRECISION NOT NULL DEFAULT 0,
    quantity_remaining DOUBLE PRECISION NOT NULL DEFAULT 0,
    cost_per_unit DOUBLE PRECISION NOT NULL DEFAULT 0,
    cost_status TEXT DEFAULT 'FINAL',
    estimate_source TEXT,
    estimated_cost_per_unit DOUBLE PRECISION,
    final_cost_per_unit DOUBLE PRECISION,
    cost_finalized_at TEXT,
    cost_reconciliation_id TEXT,
    received_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_product_id
ON inventory_lots (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_cost_status
ON inventory_lots (cost_status);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_source
ON inventory_lots (source_type, source_id, source_line_id);

CREATE TABLE IF NOT EXISTS inventory_lot_consumptions (
    id TEXT PRIMARY KEY,
    lot_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_line_id TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    cost_per_unit_at_consumption DOUBLE PRECISION NOT NULL,
    cost_status_at_consumption TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_lot_consumptions_lot_id
ON inventory_lot_consumptions (lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lot_consumptions_source
ON inventory_lot_consumptions (source_type, source_id, source_line_id);

CREATE TABLE IF NOT EXISTS purchase_cost_reconciliations (
    id TEXT PRIMARY KEY,
    purchase_document_id TEXT NOT NULL REFERENCES purchase_documents (id) ON DELETE CASCADE,
    purchase_document_number TEXT NOT NULL,
    supplier_invoice_number TEXT,
    supplier_invoice_date TEXT,
    additional_cost_treatment TEXT NOT NULL,
    additional_cost_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    supplier_discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    supplier_tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_estimated_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_final_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_variance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    sold_cost_variance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    remaining_stock_variance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    notes TEXT,
    created_by TEXT,
    created_by_name TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_cost_reconciliations_document_id
ON purchase_cost_reconciliations (purchase_document_id);
CREATE INDEX IF NOT EXISTS idx_purchase_cost_reconciliations_supplier_invoice
ON purchase_cost_reconciliations (supplier_invoice_number);

CREATE TABLE IF NOT EXISTS purchase_cost_reconciliation_items (
    id TEXT PRIMARY KEY,
    reconciliation_id TEXT NOT NULL REFERENCES purchase_cost_reconciliations (id) ON DELETE CASCADE,
    purchase_document_item_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    received_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
    invoiced_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
    quantity_variance DOUBLE PRECISION NOT NULL DEFAULT 0,
    sold_quantity_at_reconciliation DOUBLE PRECISION NOT NULL DEFAULT 0,
    remaining_quantity_at_reconciliation DOUBLE PRECISION NOT NULL DEFAULT 0,
    estimated_price DOUBLE PRECISION NOT NULL DEFAULT 0,
    final_price DOUBLE PRECISION NOT NULL DEFAULT 0,
    additional_cost_allocation DOUBLE PRECISION NOT NULL DEFAULT 0,
    supplier_discount_allocation DOUBLE PRECISION NOT NULL DEFAULT 0,
    supplier_tax_allocation DOUBLE PRECISION NOT NULL DEFAULT 0,
    final_landed_cost_per_unit DOUBLE PRECISION NOT NULL DEFAULT 0,
    variance_per_unit DOUBLE PRECISION NOT NULL DEFAULT 0,
    sold_cost_variance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    remaining_stock_variance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_cost_reconciliation_items_reconciliation_id
ON purchase_cost_reconciliation_items (reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_purchase_cost_reconciliation_items_product_id
ON purchase_cost_reconciliation_items (product_id);
