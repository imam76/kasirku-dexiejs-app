CREATE TABLE IF NOT EXISTS company_profile_setting (
    id TEXT PRIMARY KEY DEFAULT 'default',
    company_name TEXT,
    logo_data_url TEXT,
    logo_file_name TEXT,
    logo_mime_type TEXT,
    logo_size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT company_profile_setting_singleton CHECK (id = 'default')
);

DO $$
BEGIN
    IF TO_REGCLASS('public.company_profile_setting') IS NOT NULL
       AND TO_REGPROC('kasirku_notify_data_change') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS kasirku_notify_data_change ON public.company_profile_setting;
        CREATE TRIGGER kasirku_notify_data_change
            AFTER INSERT OR UPDATE OR DELETE ON public.company_profile_setting
            FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
    END IF;
END;
$$;
