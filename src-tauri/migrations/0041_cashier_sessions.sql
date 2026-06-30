CREATE TABLE IF NOT EXISTS cashier_sessions (
    id TEXT PRIMARY KEY,
    session_number TEXT NOT NULL,
    status TEXT NOT NULL,
    cashier_user_id TEXT,
    cashier_user_name TEXT,
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
    CONSTRAINT cashier_sessions_status_check CHECK (status IN ('OPEN', 'CLOSED')),
    CONSTRAINT cashier_sessions_balance_status_check CHECK (
        balance_status IS NULL OR balance_status IN ('BALANCED', 'NON_BALANCED')
    )
);

CREATE INDEX IF NOT EXISTS idx_cashier_sessions_session_number ON cashier_sessions (session_number);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_status ON cashier_sessions (status);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_cashier_user_id ON cashier_sessions (cashier_user_id);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_opened_at ON cashier_sessions (opened_at);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_closed_at ON cashier_sessions (closed_at);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_updated_at ON cashier_sessions (updated_at);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'kasirku_notify_data_change'
    ) THEN
        DROP TRIGGER IF EXISTS kasirku_notify_data_change ON public.cashier_sessions;
        CREATE TRIGGER kasirku_notify_data_change
            AFTER INSERT OR UPDATE OR DELETE ON public.cashier_sessions
            FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
    END IF;
END;
$$;
