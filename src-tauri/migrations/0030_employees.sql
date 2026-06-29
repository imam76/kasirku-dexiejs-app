CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    position TEXT,
    user_id TEXT,
    user_name TEXT,
    login_role_id TEXT,
    field_cash_account_id TEXT,
    field_cash_account_code TEXT,
    field_cash_account_name TEXT,
    pin_hash TEXT,
    pin_salt TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employees_name ON employees (name);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees (email);
CREATE INDEX IF NOT EXISTS idx_employees_phone ON employees (phone);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees (user_id);
CREATE INDEX IF NOT EXISTS idx_employees_login_role_id ON employees (login_role_id);
CREATE INDEX IF NOT EXISTS idx_employees_field_cash_account_id ON employees (field_cash_account_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON employees (is_active);
CREATE INDEX IF NOT EXISTS idx_employees_updated_at ON employees (updated_at);

CREATE TABLE IF NOT EXISTS employee_areas (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    area_name TEXT NOT NULL,
    area_code TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employee_areas_employee_id ON employee_areas (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_areas_area_id ON employee_areas (area_id);
CREATE INDEX IF NOT EXISTS idx_employee_areas_updated_at ON employee_areas (updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_areas_employee_area_active
ON employee_areas (employee_id, area_id)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS employee_collection_schedules (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    employee_position TEXT,
    area_id TEXT NOT NULL,
    area_name TEXT NOT NULL,
    area_code TEXT,
    weekday INTEGER NOT NULL,
    effective_from TIMESTAMPTZ,
    effective_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employee_collection_schedules_employee_id
ON employee_collection_schedules (employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_collection_schedules_area_id
ON employee_collection_schedules (area_id);

CREATE INDEX IF NOT EXISTS idx_employee_collection_schedules_weekday
ON employee_collection_schedules (weekday);

CREATE INDEX IF NOT EXISTS idx_employee_collection_schedules_employee_area
ON employee_collection_schedules (employee_id, area_id);

CREATE INDEX IF NOT EXISTS idx_employee_collection_schedules_employee_area_weekday
ON employee_collection_schedules (employee_id, area_id, weekday);

CREATE INDEX IF NOT EXISTS idx_employee_collection_schedules_is_active
ON employee_collection_schedules (is_active);

CREATE INDEX IF NOT EXISTS idx_employee_collection_schedules_effective_from
ON employee_collection_schedules (effective_from);

CREATE INDEX IF NOT EXISTS idx_employee_collection_schedules_effective_until
ON employee_collection_schedules (effective_until);

CREATE INDEX IF NOT EXISTS idx_employee_collection_schedules_updated_at
ON employee_collection_schedules (updated_at);
