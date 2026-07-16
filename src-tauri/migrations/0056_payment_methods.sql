CREATE TABLE IF NOT EXISTS payment_methods (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    posting_account_id TEXT,
    posting_account_code TEXT,
    posting_account_name TEXT,
    requires_reference BOOLEAN NOT NULL DEFAULT FALSE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT payment_methods_category_check CHECK (
        category IN ('CASH', 'QRIS', 'BANK_TRANSFER', 'MARKETPLACE', 'OTHER')
    ),
    CONSTRAINT payment_methods_sort_order_check CHECK (sort_order BETWEEN 0 AND 999),
    CONSTRAINT payment_methods_active_account_check CHECK (
        NOT is_active OR posting_account_id IS NOT NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_methods_code_active
ON payment_methods (UPPER(code))
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_methods_name ON payment_methods (name);
CREATE INDEX IF NOT EXISTS idx_payment_methods_category ON payment_methods (category);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_active ON payment_methods (is_active);
CREATE INDEX IF NOT EXISTS idx_payment_methods_sort_order ON payment_methods (sort_order);

INSERT INTO payment_methods (
    id, code, name, category,
    posting_account_id, posting_account_code, posting_account_name,
    requires_reference, is_system, is_active, sort_order,
    created_at, updated_at, deleted_at
)
SELECT
    'payment-method-cash', 'TUNAI', 'Tunai', 'CASH',
    (SELECT id FROM chart_of_accounts WHERE id = 'cash' OR code = '1010' ORDER BY (id = 'cash') DESC LIMIT 1),
    (SELECT code FROM chart_of_accounts WHERE id = 'cash' OR code = '1010' ORDER BY (id = 'cash') DESC LIMIT 1),
    (SELECT name FROM chart_of_accounts WHERE id = 'cash' OR code = '1010' ORDER BY (id = 'cash') DESC LIMIT 1),
    FALSE, TRUE,
    EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE (id = 'cash' OR code = '1010') AND type = 'ASSET' AND is_active = TRUE AND is_postable = TRUE
    ),
    10, NOW(), NOW(), NULL
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE UPPER(code) = 'TUNAI')
ON CONFLICT DO NOTHING;

INSERT INTO payment_methods (
    id, code, name, category,
    posting_account_id, posting_account_code, posting_account_name,
    requires_reference, is_system, is_active, sort_order,
    created_at, updated_at, deleted_at
)
SELECT
    'payment-method-non-cash-legacy', 'NON_TUNAI', 'Non Tunai', 'OTHER',
    (SELECT id FROM chart_of_accounts WHERE id = 'bank' OR code = '1020' ORDER BY (id = 'bank') DESC LIMIT 1),
    (SELECT code FROM chart_of_accounts WHERE id = 'bank' OR code = '1020' ORDER BY (id = 'bank') DESC LIMIT 1),
    (SELECT name FROM chart_of_accounts WHERE id = 'bank' OR code = '1020' ORDER BY (id = 'bank') DESC LIMIT 1),
    FALSE, TRUE,
    EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE (id = 'bank' OR code = '1020') AND type = 'ASSET' AND is_active = TRUE AND is_postable = TRUE
    ),
    20, NOW(), NOW(), NULL
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE UPPER(code) = 'NON_TUNAI')
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON payment_methods;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON payment_methods
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
