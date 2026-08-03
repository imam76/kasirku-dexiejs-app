CREATE TABLE IF NOT EXISTS restaurant_sessions (
    id TEXT PRIMARY KEY,
    session_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    operator_user_id TEXT NOT NULL,
    operator_user_name TEXT NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL,
    opening_cash_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    opening_note TEXT,
    closed_at TIMESTAMPTZ,
    closed_by_user_id TEXT,
    closed_by_user_name TEXT,
    closing_cash_amount DOUBLE PRECISION,
    closing_note TEXT,
    expected_cash_amount DOUBLE PRECISION,
    cash_sales_amount DOUBLE PRECISION,
    non_cash_sales_amount DOUBLE PRECISION,
    total_sales_amount DOUBLE PRECISION,
    voided_sales_amount DOUBLE PRECISION,
    transaction_count INTEGER,
    voided_transaction_count INTEGER,
    cash_difference_amount DOUBLE PRECISION,
    balance_status TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT restaurant_sessions_status_check CHECK (status IN ('OPEN', 'CLOSED')),
    CONSTRAINT restaurant_sessions_balance_status_check CHECK (
        balance_status IS NULL OR balance_status IN ('BALANCED', 'NON_BALANCED')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_sessions_one_open_per_user
    ON restaurant_sessions (operator_user_id)
    WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_restaurant_sessions_updated_at
    ON restaurant_sessions (updated_at);

CREATE TABLE IF NOT EXISTS restaurant_tables (
    id TEXT PRIMARY KEY,
    area_id TEXT NOT NULL,
    area_name TEXT NOT NULL,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    status TEXT NOT NULL,
    active_order_id TEXT,
    occupied_since TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT restaurant_tables_status_check CHECK (status IN ('AVAILABLE', 'OCCUPIED'))
);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_area_status
    ON restaurant_tables (area_id, status);

CREATE TABLE IF NOT EXISTS restaurant_orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    restaurant_session_id TEXT NOT NULL REFERENCES restaurant_sessions(id),
    operator_user_id TEXT NOT NULL,
    operator_user_name TEXT NOT NULL,
    mode TEXT NOT NULL,
    order_type TEXT NOT NULL,
    table_id TEXT REFERENCES restaurant_tables(id),
    table_name TEXT,
    guest_count INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL,
    transaction_id TEXT,
    opened_at TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT restaurant_orders_mode_check CHECK (mode IN ('TABLE_SERVICE', 'COUNTER_SERVICE')),
    CONSTRAINT restaurant_orders_type_check CHECK (order_type IN ('DINE_IN', 'TAKEAWAY')),
    CONSTRAINT restaurant_orders_status_check CHECK (status IN ('DRAFT', 'SENT_TO_KITCHEN', 'PAID', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_restaurant_orders_session_status
    ON restaurant_orders (restaurant_session_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_orders_one_open_per_table
    ON restaurant_orders (restaurant_session_id, table_id)
    WHERE table_id IS NOT NULL AND status IN ('DRAFT', 'SENT_TO_KITCHEN');

CREATE TABLE IF NOT EXISTS restaurant_kitchen_tickets (
    id TEXT PRIMARY KEY,
    restaurant_session_id TEXT NOT NULL REFERENCES restaurant_sessions(id),
    order_id TEXT NOT NULL REFERENCES restaurant_orders(id),
    order_number TEXT NOT NULL,
    destination_label TEXT NOT NULL,
    status TEXT NOT NULL,
    lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT restaurant_kitchen_tickets_status_check CHECK (
        status IN ('NEW', 'PREPARING', 'READY', 'COMPLETED')
    )
);

CREATE INDEX IF NOT EXISTS idx_restaurant_kitchen_tickets_session_status
    ON restaurant_kitchen_tickets (restaurant_session_id, status);
CREATE INDEX IF NOT EXISTS idx_restaurant_kitchen_tickets_order
    ON restaurant_kitchen_tickets (order_id);

DO $$
DECLARE
    table_name TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'kasirku_notify_data_change'
    ) THEN
        FOREACH table_name IN ARRAY ARRAY[
            'restaurant_sessions',
            'restaurant_tables',
            'restaurant_orders',
            'restaurant_kitchen_tickets'
        ]
        LOOP
            EXECUTE format('DROP TRIGGER IF EXISTS kasirku_notify_data_change ON public.%I', table_name);
            EXECUTE format(
                'CREATE TRIGGER kasirku_notify_data_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change()',
                table_name
            );
        END LOOP;
    END IF;
END;
$$;
