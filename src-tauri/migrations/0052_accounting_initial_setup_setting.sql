CREATE TABLE IF NOT EXISTS accounting_initial_setup_setting (
    id TEXT PRIMARY KEY DEFAULT 'default',
    business_template_code TEXT NOT NULL,
    accounting_profile TEXT NOT NULL,
    industry_extension TEXT NOT NULL,
    template_id TEXT NOT NULL,
    cutoff_date DATE NOT NULL,
    fiscal_period_start DATE NOT NULL,
    fiscal_period_end DATE NOT NULL,
    current_period_start DATE NOT NULL,
    current_period_end DATE NOT NULL,
    current_period_id TEXT,
    base_currency_code TEXT NOT NULL,
    inventory_policy TEXT NOT NULL,
    setup_completed_at TIMESTAMPTZ,
    setup_completed_by TEXT,
    setup_completed_by_name TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT accounting_initial_setup_setting_singleton CHECK (id = 'default'),
    CONSTRAINT accounting_initial_setup_setting_version_positive CHECK (version > 0),
    CONSTRAINT accounting_initial_setup_setting_business_template_check CHECK (
        business_template_code IN (
            'RETAIL',
            'COOPERATIVE',
            'GENERAL_TRADING',
            'GENERAL_SERVICE',
            'MANUFACTURING_PREVIEW',
            'CONSTRUCTION_PREVIEW',
            'GOVERNMENT_PREVIEW'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_accounting_initial_setup_setting_business_template
ON accounting_initial_setup_setting (business_template_code);

CREATE INDEX IF NOT EXISTS idx_accounting_initial_setup_setting_updated_at
ON accounting_initial_setup_setting (updated_at);

DO $$
DECLARE
    setup_table_name TEXT;
BEGIN
    IF TO_REGPROC('kasirku_notify_data_change') IS NOT NULL THEN
        FOREACH setup_table_name IN ARRAY ARRAY[
            'accounting_initial_setup_setting',
            'app_setup_config'
        ] LOOP
            IF TO_REGCLASS(FORMAT('public.%I', setup_table_name)) IS NOT NULL THEN
                EXECUTE FORMAT(
                    'DROP TRIGGER IF EXISTS kasirku_notify_data_change ON public.%I',
                    setup_table_name
                );
                EXECUTE FORMAT(
                    'CREATE TRIGGER kasirku_notify_data_change
                     AFTER INSERT OR UPDATE OR DELETE ON public.%I
                     FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change()',
                    setup_table_name
                );
            END IF;
        END LOOP;
    END IF;
END;
$$;
