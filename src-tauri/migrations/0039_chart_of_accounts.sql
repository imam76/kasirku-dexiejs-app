CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    normal_balance TEXT NOT NULL,
    parent_id TEXT,
    parent_code TEXT,
    parent_name TEXT,
    is_postable BOOLEAN NOT NULL DEFAULT TRUE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_code ON chart_of_accounts (code);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent_id ON chart_of_accounts (parent_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_is_active ON chart_of_accounts (is_active);

-- Attach realtime change notification trigger (parity with 0034_realtime_notifications.sql).
-- 0034 registers a fixed table list that predates this table, so we register it here.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'kasirku_notify_data_change'
    ) THEN
        DROP TRIGGER IF EXISTS kasirku_notify_data_change ON public.chart_of_accounts;
        CREATE TRIGGER kasirku_notify_data_change
            AFTER INSERT OR UPDATE OR DELETE ON public.chart_of_accounts
            FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
    END IF;
END;
$$;
