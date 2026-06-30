-- Sync the foundational accounting seed across devices: finance account mappings,
-- accounting profile setting, enabled modules, and general ledger setting.

CREATE TABLE IF NOT EXISTS finance_account_mappings (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    category TEXT,
    account_id TEXT NOT NULL,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_account_mappings_key ON finance_account_mappings (key);
CREATE INDEX IF NOT EXISTS idx_finance_account_mappings_account_id ON finance_account_mappings (account_id);

CREATE TABLE IF NOT EXISTS accounting_profile_setting (
    id TEXT PRIMARY KEY DEFAULT 'default',
    accounting_profile TEXT NOT NULL,
    industry_extension TEXT NOT NULL,
    template_id TEXT,
    locked_after_transaction BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT accounting_profile_setting_singleton CHECK (id = 'default')
);

CREATE TABLE IF NOT EXISTS enabled_modules (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    source TEXT NOT NULL,
    requires_profile TEXT,
    requires_extension TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enabled_modules_code ON enabled_modules (code);

CREATE TABLE IF NOT EXISTS general_ledger_setting (
    id TEXT PRIMARY KEY DEFAULT 'default',
    is_ready BOOLEAN NOT NULL DEFAULT FALSE,
    cutoff_date TEXT,
    inventory_policy TEXT NOT NULL,
    opening_balance_journal_id TEXT,
    activated_at TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT general_ledger_setting_singleton CHECK (id = 'default')
);

-- Attach realtime change notification triggers (parity with 0034_realtime_notifications.sql).
DO $$
DECLARE
    accounting_table_name TEXT;
BEGIN
    IF TO_REGPROC('kasirku_notify_data_change') IS NOT NULL THEN
        FOREACH accounting_table_name IN ARRAY ARRAY[
            'finance_account_mappings',
            'accounting_profile_setting',
            'enabled_modules',
            'general_ledger_setting'
        ] LOOP
            EXECUTE FORMAT(
                'DROP TRIGGER IF EXISTS kasirku_notify_data_change ON public.%I',
                accounting_table_name
            );
            EXECUTE FORMAT(
                'CREATE TRIGGER kasirku_notify_data_change
                 AFTER INSERT OR UPDATE OR DELETE ON public.%I
                 FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change()',
                accounting_table_name
            );
        END LOOP;
    END IF;
END;
$$;
