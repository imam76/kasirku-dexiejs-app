ALTER TABLE taxes ADD COLUMN IF NOT EXISTS tax_flow TEXT;
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS sales_tax_account_id TEXT;
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS sales_tax_account_code TEXT;
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS sales_tax_account_name TEXT;
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS sales_tax_account_type TEXT;
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS purchase_tax_account_id TEXT;
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS purchase_tax_account_code TEXT;
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS purchase_tax_account_name TEXT;
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS purchase_tax_account_type TEXT;

UPDATE taxes
SET tax_flow = COALESCE(tax_flow, 'ADDITIVE');

CREATE INDEX IF NOT EXISTS idx_taxes_tax_flow ON taxes (tax_flow);
CREATE INDEX IF NOT EXISTS idx_taxes_sales_tax_account_id ON taxes (sales_tax_account_id);
CREATE INDEX IF NOT EXISTS idx_taxes_purchase_tax_account_id ON taxes (purchase_tax_account_id);

ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS tax_flow TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS tax_account_id TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS tax_account_code TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS tax_account_name TEXT;
ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS tax_account_type TEXT;

ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS tax_flow TEXT;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS tax_account_id TEXT;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS tax_account_code TEXT;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS tax_account_name TEXT;
ALTER TABLE sales_document_items ADD COLUMN IF NOT EXISTS tax_account_type TEXT;

ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS tax_flow TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS tax_account_id TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS tax_account_code TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS tax_account_name TEXT;
ALTER TABLE purchase_documents ADD COLUMN IF NOT EXISTS tax_account_type TEXT;

ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS tax_flow TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS tax_account_id TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS tax_account_code TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS tax_account_name TEXT;
ALTER TABLE purchase_document_items ADD COLUMN IF NOT EXISTS tax_account_type TEXT;
