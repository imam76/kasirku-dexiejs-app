ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS employee_number TEXT,
    ADD COLUMN IF NOT EXISTS preferred_name TEXT,
    ADD COLUMN IF NOT EXISTS photo_data_url TEXT,
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS birth_place TEXT,
    ADD COLUMN IF NOT EXISTS birth_date DATE,
    ADD COLUMN IF NOT EXISTS marital_status TEXT,
    ADD COLUMN IF NOT EXISTS nationality TEXT,
    ADD COLUMN IF NOT EXISTS personal_email TEXT,
    ADD COLUMN IF NOT EXISTS identity_address TEXT,
    ADD COLUMN IF NOT EXISTS domicile_address TEXT,
    ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
    ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT,
    ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS nik TEXT,
    ADD COLUMN IF NOT EXISTS family_card_number TEXT,
    ADD COLUMN IF NOT EXISTS tax_number TEXT,
    ADD COLUMN IF NOT EXISTS health_bpjs_number TEXT,
    ADD COLUMN IF NOT EXISTS employment_bpjs_number TEXT,
    ADD COLUMN IF NOT EXISTS company_unit TEXT,
    ADD COLUMN IF NOT EXISTS department_id TEXT,
    ADD COLUMN IF NOT EXISTS department_code TEXT,
    ADD COLUMN IF NOT EXISTS department_name TEXT,
    ADD COLUMN IF NOT EXISTS job_position_id TEXT,
    ADD COLUMN IF NOT EXISTS job_position_code TEXT,
    ADD COLUMN IF NOT EXISTS job_position_name TEXT,
    ADD COLUMN IF NOT EXISTS supervisor_id TEXT,
    ADD COLUMN IF NOT EXISTS supervisor_name TEXT,
    ADD COLUMN IF NOT EXISTS work_location TEXT,
    ADD COLUMN IF NOT EXISTS join_date DATE,
    ADD COLUMN IF NOT EXISTS employment_status TEXT,
    ADD COLUMN IF NOT EXISTS active_status TEXT,
    ADD COLUMN IF NOT EXISTS work_schedule_type TEXT,
    ADD COLUMN IF NOT EXISTS contract_start_date DATE,
    ADD COLUMN IF NOT EXISTS contract_end_date DATE,
    ADD COLUMN IF NOT EXISTS permanent_date DATE,
    ADD COLUMN IF NOT EXISTS exit_date DATE,
    ADD COLUMN IF NOT EXISTS exit_reason TEXT,
    ADD COLUMN IF NOT EXISTS salary_payment_method TEXT,
    ADD COLUMN IF NOT EXISTS bank_name TEXT,
    ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
    ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
    ADD COLUMN IF NOT EXISTS base_salary DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS salary_currency TEXT,
    ADD COLUMN IF NOT EXISTS payroll_period TEXT,
    ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN,
    ADD COLUMN IF NOT EXISTS ptkp_status TEXT,
    ADD COLUMN IF NOT EXISTS is_bpjs_participant BOOLEAN;

WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS sequence
    FROM employees
    WHERE employee_number IS NULL OR BTRIM(employee_number) = ''
)
UPDATE employees employee
SET employee_number = 'EMP-' || LPAD(numbered.sequence::TEXT, 5, '0')
FROM numbered
WHERE employee.id = numbered.id;

UPDATE employees
SET personal_email = COALESCE(personal_email, email),
    identity_address = COALESCE(identity_address, address),
    domicile_address = COALESCE(domicile_address, address),
    job_position_name = COALESCE(job_position_name, position),
    employment_status = COALESCE(employment_status, 'PERMANENT'),
    active_status = COALESCE(active_status, CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END),
    work_schedule_type = COALESCE(work_schedule_type, 'FULL_TIME'),
    base_salary = COALESCE(base_salary, 0),
    salary_currency = COALESCE(salary_currency, 'IDR'),
    payroll_period = COALESCE(payroll_period, 'MONTHLY'),
    is_taxable = COALESCE(is_taxable, TRUE),
    is_bpjs_participant = COALESCE(is_bpjs_participant, FALSE);

ALTER TABLE employees ALTER COLUMN employee_number SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_hr_contract_dates_valid'
    ) THEN
        ALTER TABLE employees
            ADD CONSTRAINT employees_hr_contract_dates_valid
            CHECK (
                contract_end_date IS NULL
                OR contract_start_date IS NULL
                OR contract_end_date >= contract_start_date
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_hr_exit_date_valid'
    ) THEN
        ALTER TABLE employees
            ADD CONSTRAINT employees_hr_exit_date_valid
            CHECK (exit_date IS NULL OR join_date IS NULL OR exit_date >= join_date);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_hr_salary_non_negative'
    ) THEN
        ALTER TABLE employees
            ADD CONSTRAINT employees_hr_salary_non_negative
            CHECK (base_salary IS NULL OR base_salary >= 0);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_employee_number_unique
    ON employees (LOWER(employee_number)) WHERE deleted_at IS NULL AND employee_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_nik_unique
    ON employees (nik) WHERE deleted_at IS NULL AND nik IS NOT NULL AND BTRIM(nik) <> '';
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_job_position_id ON employees (job_position_id);
CREATE INDEX IF NOT EXISTS idx_employees_employment_status ON employees (employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_active_status ON employees (active_status);
CREATE INDEX IF NOT EXISTS idx_employees_contract_end_date ON employees (contract_end_date);

ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS head_employee_id TEXT,
    ADD COLUMN IF NOT EXISTS head_employee_name TEXT,
    ADD COLUMN IF NOT EXISTS parent_department_id TEXT,
    ADD COLUMN IF NOT EXISTS parent_department_code TEXT,
    ADD COLUMN IF NOT EXISTS parent_department_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_code_unique_all
    ON departments (LOWER(code)) WHERE deleted_at IS NULL AND code IS NOT NULL AND BTRIM(code) <> '';
CREATE INDEX IF NOT EXISTS idx_departments_parent_department_id ON departments (parent_department_id);
CREATE INDEX IF NOT EXISTS idx_departments_head_employee_id ON departments (head_employee_id);

CREATE TABLE IF NOT EXISTS hr_positions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    department_id TEXT NOT NULL,
    department_code TEXT,
    department_name TEXT,
    level TEXT NOT NULL,
    reports_to_position_id TEXT,
    reports_to_position_code TEXT,
    reports_to_position_name TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_positions_code_unique
    ON hr_positions (LOWER(code)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_positions_department_id ON hr_positions (department_id);
CREATE INDEX IF NOT EXISTS idx_hr_positions_is_active ON hr_positions (is_active);

CREATE TABLE IF NOT EXISTS employment_contracts (
    id TEXT PRIMARY KEY,
    contract_number TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    employee_number TEXT,
    employee_name TEXT NOT NULL,
    contract_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    job_position_id TEXT NOT NULL,
    job_position_code TEXT,
    job_position_name TEXT NOT NULL,
    department_id TEXT NOT NULL,
    department_code TEXT,
    department_name TEXT NOT NULL,
    base_salary DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
    status TEXT NOT NULL,
    notes TEXT,
    renewed_from_contract_id TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT employment_contract_dates_valid CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employment_contracts_number_unique
    ON employment_contracts (LOWER(contract_number)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employment_contracts_employee_id ON employment_contracts (employee_id);
CREATE INDEX IF NOT EXISTS idx_employment_contracts_end_date ON employment_contracts (end_date);
CREATE INDEX IF NOT EXISTS idx_employment_contracts_status ON employment_contracts (status);

CREATE TABLE IF NOT EXISTS salary_components (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    calculation TEXT NOT NULL,
    default_value DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (default_value >= 0),
    is_taxable BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT salary_component_percentage_valid CHECK (calculation <> 'PERCENTAGE' OR default_value <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_components_code_unique
    ON salary_components (LOWER(code)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_salary_components_kind ON salary_components (kind);
CREATE INDEX IF NOT EXISTS idx_salary_components_is_active ON salary_components (is_active);

CREATE TABLE IF NOT EXISTS employee_salary_components (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    salary_component_id TEXT NOT NULL,
    component_code TEXT NOT NULL,
    component_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    calculation TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (value >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_salary_components_unique_active
    ON employee_salary_components (employee_id, salary_component_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_salary_components_employee_id ON employee_salary_components (employee_id);

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS changes JSONB;

INSERT INTO salary_components
    (id, code, name, kind, calculation, default_value, is_taxable, is_active, created_at, updated_at)
VALUES
    ('salary-base', 'GAJI-POKOK', 'Gaji Pokok', 'EARNING', 'FIXED', 0, TRUE, TRUE, NOW(), NOW()),
    ('salary-position', 'TUNJ-JABATAN', 'Tunjangan Jabatan', 'EARNING', 'FIXED', 0, TRUE, TRUE, NOW(), NOW()),
    ('salary-meal', 'TUNJ-MAKAN', 'Tunjangan Makan', 'EARNING', 'FIXED', 0, FALSE, TRUE, NOW(), NOW()),
    ('salary-transport', 'TUNJ-TRANSPORT', 'Tunjangan Transportasi', 'EARNING', 'FIXED', 0, FALSE, TRUE, NOW(), NOW()),
    ('salary-bonus', 'BONUS', 'Bonus', 'EARNING', 'FIXED', 0, TRUE, TRUE, NOW(), NOW()),
    ('salary-overtime', 'LEMBUR', 'Lembur', 'EARNING', 'FIXED', 0, TRUE, TRUE, NOW(), NOW()),
    ('deduction-late', 'POT-TERLAMBAT', 'Potongan Keterlambatan', 'DEDUCTION', 'FIXED', 0, FALSE, TRUE, NOW(), NOW()),
    ('deduction-health-bpjs', 'BPJS-KES', 'BPJS Kesehatan', 'DEDUCTION', 'PERCENTAGE', 1, FALSE, TRUE, NOW(), NOW()),
    ('deduction-employment-bpjs', 'BPJS-TK', 'BPJS Ketenagakerjaan', 'DEDUCTION', 'PERCENTAGE', 2, FALSE, TRUE, NOW(), NOW()),
    ('deduction-tax', 'PPH-21', 'PPh 21', 'DEDUCTION', 'FIXED', 0, FALSE, TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

WITH permission_grants AS (
    SELECT DISTINCT
        source.role_id,
        mapping.target_permission
    FROM role_permissions source
    JOIN (
        VALUES
            ('EMPLOYEE_MANAGE', 'hr.employee.view'),
            ('EMPLOYEE_MANAGE', 'hr.employee.create'),
            ('EMPLOYEE_MANAGE', 'hr.employee.update'),
            ('EMPLOYEE_MANAGE', 'hr.employee.deactivate'),
            ('EMPLOYEE_MANAGE', 'hr.contract.manage'),
            ('DEPARTMENT_MANAGE', 'hr.organization.manage'),
            ('FINANCE_ACCESS', 'hr.payroll.view'),
            ('FINANCE_ACCESS', 'hr.payroll.manage'),
            ('REPORT_PAYROLL_VIEW', 'hr.payroll.view')
    ) AS mapping(source_permission, target_permission)
        ON mapping.source_permission = source.permission_code
    WHERE source.deleted_at IS NULL
)
INSERT INTO role_permissions (id, role_id, permission_code, created_at, updated_at, deleted_at)
SELECT
    permission_grants.role_id || ':' || permission_grants.target_permission,
    permission_grants.role_id,
    permission_grants.target_permission,
    NOW(),
    NOW(),
    NULL
FROM permission_grants
ON CONFLICT (role_id, permission_code) DO UPDATE
SET deleted_at = NULL, updated_at = EXCLUDED.updated_at;
