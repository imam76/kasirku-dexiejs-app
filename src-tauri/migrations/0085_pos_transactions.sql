CREATE TABLE IF NOT EXISTS pos_transactions (
    id TEXT PRIMARY KEY,
    transaction_number TEXT NOT NULL,
    business_type TEXT,
    cashier_session_id TEXT,
    cashier_session_number TEXT,
    restaurant_session_id TEXT,
    restaurant_session_number TEXT,
    restaurant_order_id TEXT,
    cashier_user_id TEXT,
    cashier_user_name TEXT,
    member_contact_id TEXT,
    member_number TEXT,
    member_name TEXT,
    member_phone TEXT,
    membership_points_earned DOUBLE PRECISION,
    membership_points_redeemed DOUBLE PRECISION,
    membership_point_discount_amount DOUBLE PRECISION,
    membership_points_balance_after DOUBLE PRECISION,
    subtotal_amount DOUBLE PRECISION,
    discount_amount DOUBLE PRECISION,
    discount_breakdown JSONB,
    applied_promos_snapshot JSONB,
    total_amount DOUBLE PRECISION NOT NULL,
    payment_amount DOUBLE PRECISION NOT NULL,
    change_amount DOUBLE PRECISION NOT NULL,
    payment_mode TEXT,
    payment_method TEXT NOT NULL,
    payment_method_id TEXT,
    payment_method_code TEXT,
    payment_method_name TEXT,
    payment_method_category TEXT,
    payment_reference TEXT,
    payment_posting_account_id TEXT,
    payment_posting_account_code TEXT,
    payment_posting_account_name TEXT,
    status TEXT,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    receipt_status TEXT,
    receipt_printed_at TIMESTAMPTZ,
    receipt_print_error TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pos_transaction_items (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES pos_transactions (id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    selling_price DOUBLE PRECISION,
    original_price DOUBLE PRECISION,
    is_price_edited BOOLEAN,
    price_edited_by TEXT,
    price_edited_at TIMESTAMPTZ,
    purchase_price DOUBLE PRECISION NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    unit TEXT NOT NULL,
    unit_id TEXT,
    unit_label TEXT,
    unit_category TEXT,
    conversion_value DOUBLE PRECISION,
    base_unit TEXT,
    price_before_discount DOUBLE PRECISION,
    subtotal_before_discount DOUBLE PRECISION,
    discount_amount DOUBLE PRECISION,
    subtotal DOUBLE PRECISION NOT NULL,
    profit DOUBLE PRECISION NOT NULL,
    hpp_status TEXT,
    hpp_reconciled_at TIMESTAMPTZ,
    hpp_variance_amount DOUBLE PRECISION,
    profit_status TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_transactions_updated_at ON pos_transactions (updated_at);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_cashier_session_id ON pos_transactions (cashier_session_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_member_contact_id ON pos_transactions (member_contact_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_transaction_number ON pos_transactions (transaction_number);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_transaction_id ON pos_transaction_items (transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_product_id ON pos_transaction_items (product_id);

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON pos_transactions;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON pos_transactions
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON pos_transaction_items;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON pos_transaction_items
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
