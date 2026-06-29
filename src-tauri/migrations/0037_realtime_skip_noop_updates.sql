CREATE OR REPLACE FUNCTION kasirku_notify_data_change()
RETURNS trigger AS $$
DECLARE
    changed_row JSONB;
BEGIN
    IF TG_OP = 'UPDATE' AND TO_JSONB(OLD) IS NOT DISTINCT FROM TO_JSONB(NEW) THEN
        RETURN NEW;
    END IF;

    changed_row := CASE
        WHEN TG_OP = 'DELETE' THEN TO_JSONB(OLD)
        ELSE TO_JSONB(NEW)
    END;

    PERFORM PG_NOTIFY(
        'kasirku_data_changes',
        JSON_BUILD_OBJECT(
            'table', TG_TABLE_NAME,
            'operation', LOWER(TG_OP),
            'id', changed_row ->> 'id',
            'updated_at', COALESCE(
                changed_row ->> 'updated_at',
                changed_row ->> 'created_at',
                NOW()::TEXT
            ),
            'emitted_at', NOW()::TEXT
        )::TEXT
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
