CREATE SEQUENCE IF NOT EXISTS employees_employee_number_seq AS BIGINT;

DO $$
DECLARE
    highest_employee_number BIGINT;
BEGIN
    SELECT COALESCE(
        MAX((REGEXP_MATCH(employee_number, '^EMP-([0-9]+)$', 'i'))[1]::BIGINT),
        0
    )
    INTO highest_employee_number
    FROM employees;

    IF highest_employee_number > 0 THEN
        PERFORM SETVAL(
            'employees_employee_number_seq',
            highest_employee_number,
            TRUE
        );
    ELSE
        PERFORM SETVAL('employees_employee_number_seq', 1, FALSE);
    END IF;
END $$;

ALTER SEQUENCE employees_employee_number_seq OWNED BY employees.employee_number;

CREATE OR REPLACE FUNCTION generate_employee_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    candidate TEXT;
BEGIN
    LOOP
        candidate := 'EMP-' || LPAD(
            NEXTVAL('employees_employee_number_seq')::TEXT,
            5,
            '0'
        );

        EXIT WHEN NOT EXISTS (
            SELECT 1
            FROM employees
            WHERE LOWER(employee_number) = LOWER(candidate)
                AND deleted_at IS NULL
        );
    END LOOP;

    RETURN candidate;
END;
$$;

ALTER TABLE employees
    ALTER COLUMN employee_number SET DEFAULT generate_employee_number(),
    ALTER COLUMN employment_status SET DEFAULT 'PERMANENT',
    ALTER COLUMN active_status SET DEFAULT 'ACTIVE',
    ALTER COLUMN work_schedule_type SET DEFAULT 'FULL_TIME',
    ALTER COLUMN base_salary SET DEFAULT 0,
    ALTER COLUMN salary_currency SET DEFAULT 'IDR',
    ALTER COLUMN payroll_period SET DEFAULT 'MONTHLY',
    ALTER COLUMN is_taxable SET DEFAULT TRUE,
    ALTER COLUMN is_bpjs_participant SET DEFAULT FALSE;

CREATE OR REPLACE FUNCTION ensure_legacy_employee_hr_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.employment_status := COALESCE(NEW.employment_status, 'PERMANENT');
    NEW.work_schedule_type := COALESCE(NEW.work_schedule_type, 'FULL_TIME');
    NEW.base_salary := COALESCE(NEW.base_salary, 0);
    NEW.salary_currency := COALESCE(NEW.salary_currency, 'IDR');
    NEW.payroll_period := COALESCE(NEW.payroll_period, 'MONTHLY');
    NEW.is_taxable := COALESCE(NEW.is_taxable, TRUE);
    NEW.is_bpjs_participant := COALESCE(NEW.is_bpjs_participant, FALSE);

    IF TG_OP = 'INSERT' OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        NEW.active_status := CASE
            WHEN NEW.is_active THEN 'ACTIVE'
            ELSE 'INACTIVE'
        END;
    ELSE
        NEW.active_status := COALESCE(NEW.active_status, 'INACTIVE');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_legacy_employee_hr_defaults ON employees;
CREATE TRIGGER trg_ensure_legacy_employee_hr_defaults
BEFORE INSERT OR UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION ensure_legacy_employee_hr_defaults();

CREATE TABLE IF NOT EXISTS employee_access_profiles (
    employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    user_id TEXT,
    user_name TEXT,
    login_role_id TEXT,
    pin_hash TEXT,
    pin_salt TEXT,
    is_login_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employee_access_profiles_user_id
    ON employee_access_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_employee_access_profiles_login_role_id
    ON employee_access_profiles (login_role_id);
CREATE INDEX IF NOT EXISTS idx_employee_access_profiles_is_login_enabled
    ON employee_access_profiles (is_login_enabled);
CREATE INDEX IF NOT EXISTS idx_employee_access_profiles_updated_at
    ON employee_access_profiles (updated_at);

INSERT INTO employee_access_profiles (
    employee_id,
    user_id,
    user_name,
    login_role_id,
    pin_hash,
    pin_salt,
    is_login_enabled,
    created_at,
    updated_at,
    deleted_at
)
SELECT
    id,
    user_id,
    user_name,
    login_role_id,
    pin_hash,
    pin_salt,
    (
        is_active
        AND deleted_at IS NULL
        AND (
            user_id IS NOT NULL
            OR (
                login_role_id IS NOT NULL
                AND pin_hash IS NOT NULL
                AND pin_salt IS NOT NULL
            )
        )
    ),
    created_at,
    updated_at,
    deleted_at
FROM employees
ON CONFLICT (employee_id) DO UPDATE
SET
    user_id = EXCLUDED.user_id,
    user_name = EXCLUDED.user_name,
    login_role_id = EXCLUDED.login_role_id,
    pin_hash = EXCLUDED.pin_hash,
    pin_salt = EXCLUDED.pin_salt,
    is_login_enabled = EXCLUDED.is_login_enabled,
    updated_at = EXCLUDED.updated_at,
    deleted_at = EXCLUDED.deleted_at;

CREATE OR REPLACE FUNCTION sync_employee_access_profile_from_legacy_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO employee_access_profiles (
        employee_id,
        user_id,
        user_name,
        login_role_id,
        pin_hash,
        pin_salt,
        is_login_enabled,
        created_at,
        updated_at,
        deleted_at
    )
    VALUES (
        NEW.id,
        NEW.user_id,
        NEW.user_name,
        NEW.login_role_id,
        NEW.pin_hash,
        NEW.pin_salt,
        (
            NEW.is_active
            AND NEW.deleted_at IS NULL
            AND (
                NEW.user_id IS NOT NULL
                OR (
                    NEW.login_role_id IS NOT NULL
                    AND NEW.pin_hash IS NOT NULL
                    AND NEW.pin_salt IS NOT NULL
                )
            )
        ),
        NEW.created_at,
        NEW.updated_at,
        NEW.deleted_at
    )
    ON CONFLICT (employee_id) DO UPDATE
    SET
        user_id = EXCLUDED.user_id,
        user_name = EXCLUDED.user_name,
        login_role_id = EXCLUDED.login_role_id,
        pin_hash = EXCLUDED.pin_hash,
        pin_salt = EXCLUDED.pin_salt,
        is_login_enabled = EXCLUDED.is_login_enabled,
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_employee_access_profile ON employees;
CREATE TRIGGER trg_sync_employee_access_profile
AFTER INSERT OR UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION sync_employee_access_profile_from_legacy_columns();

COMMENT ON TABLE employee_access_profiles IS
    'Login identity, role, and PIN credentials separated from the HR employee profile.';
COMMENT ON COLUMN employees.login_role_id IS
    'Deprecated compatibility column. Canonical access data is stored in employee_access_profiles.';
COMMENT ON COLUMN employees.pin_hash IS
    'Deprecated compatibility column. Canonical access data is stored in employee_access_profiles.';
COMMENT ON COLUMN employees.pin_salt IS
    'Deprecated compatibility column. Canonical access data is stored in employee_access_profiles.';
