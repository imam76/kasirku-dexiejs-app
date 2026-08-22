CREATE TABLE IF NOT EXISTS pos_stock_discrepancies (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    transaction_number TEXT NOT NULL,
    transaction_item_id TEXT NOT NULL,
    cashier_session_id TEXT,
    restaurant_session_id TEXT,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sku TEXT,
    system_quantity_snapshot DOUBLE PRECISION NOT NULL,
    requested_quantity DOUBLE PRECISION NOT NULL,
    shortage_quantity DOUBLE PRECISION NOT NULL CHECK (shortage_quantity > 0),
    stock_unit TEXT NOT NULL,
    observation TEXT NOT NULL CHECK (observation = 'PHYSICAL_ITEM_PRESENT'),
    cashier_note TEXT,
    cashier_user_id TEXT,
    cashier_user_name TEXT,
    device_id TEXT,
    device_name TEXT,
    status TEXT NOT NULL CHECK (status IN ('PENDING_REVIEW', 'REVIEWED', 'NEEDS_INVESTIGATION')),
    reviewed_by TEXT,
    reviewed_by_name TEXT,
    reviewed_at TIMESTAMPTZ,
    investigation_cause TEXT,
    investigation_note TEXT,
    stock_opname_id TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_discrepancies_updated_at_id
    ON pos_stock_discrepancies (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_pos_stock_discrepancies_status
    ON pos_stock_discrepancies (status);
CREATE INDEX IF NOT EXISTS idx_pos_stock_discrepancies_product
    ON pos_stock_discrepancies (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_stock_discrepancies_cashier_session
    ON pos_stock_discrepancies (cashier_session_id);

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON pos_stock_discrepancies;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON pos_stock_discrepancies
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();

INSERT INTO role_permissions (
    id, role_id, permission_code, created_at, updated_at
)
SELECT
    role.id || ':POS_STOCK_DISCREPANCY_REVIEW',
    role.id,
    'POS_STOCK_DISCREPANCY_REVIEW',
    NOW(),
    NOW()
FROM roles role
WHERE role.is_owner = TRUE OR role.code IN ('OWNER', 'ADMIN')
ON CONFLICT (role_id, permission_code) DO UPDATE SET
    deleted_at = NULL,
    updated_at = EXCLUDED.updated_at;
