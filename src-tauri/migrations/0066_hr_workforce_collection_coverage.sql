-- HR workforce, leave, and cooperative collection coverage.
-- This migration is additive: legacy employee access columns and assignments remain readable.

CREATE TABLE IF NOT EXISTS implementation_review_queue (
    id TEXT PRIMARY KEY,
    review_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    payload JSONB,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_implementation_review_queue_status
    ON implementation_review_queue (status, review_type, updated_at);

UPDATE auth_users auth_user
SET employee_id = employee.id,
    updated_at = GREATEST(auth_user.updated_at, NOW())
FROM employees employee
WHERE employee.user_id = auth_user.id
  AND (auth_user.employee_id IS NULL OR auth_user.employee_id = employee.id);

WITH legacy_access AS (
    SELECT
        employee.id AS employee_id,
        COALESCE(NULLIF(employee.user_id, ''), employee.id) AS user_id,
        employee.name,
        employee.email,
        COALESCE(access_profile.login_role_id, employee.login_role_id) AS role_id,
        COALESCE(access_profile.pin_hash, employee.pin_hash) AS pin_hash,
        COALESCE(access_profile.pin_salt, employee.pin_salt) AS pin_salt,
        employee.is_active,
        employee.created_at,
        employee.updated_at
    FROM employees employee
    LEFT JOIN employee_access_profiles access_profile
      ON access_profile.employee_id = employee.id
     AND access_profile.deleted_at IS NULL
    WHERE employee.deleted_at IS NULL
)
INSERT INTO auth_users (
    id, name, email, role, role_id, role_name, employee_id,
    pin_hash, pin_salt, is_active, created_at, updated_at, deleted_at
)
SELECT
    legacy_access.user_id,
    legacy_access.name,
    legacy_access.email,
    COALESCE(NULLIF(role.code, ''), 'KASIR'),
    legacy_access.role_id,
    role.name,
    legacy_access.employee_id,
    legacy_access.pin_hash,
    legacy_access.pin_salt,
    legacy_access.is_active,
    legacy_access.created_at,
    legacy_access.updated_at,
    NULL
FROM legacy_access
LEFT JOIN roles role ON role.id = legacy_access.role_id
WHERE legacy_access.pin_hash IS NOT NULL
  AND legacy_access.pin_salt IS NOT NULL
  AND legacy_access.role_id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET employee_id = COALESCE(auth_users.employee_id, EXCLUDED.employee_id),
    updated_at = GREATEST(auth_users.updated_at, EXCLUDED.updated_at);

INSERT INTO implementation_review_queue (
    id, review_type, entity_type, entity_id, summary, status, payload, created_at, updated_at
)
SELECT
    'employee-access:' || employee_id,
    'EMPLOYEE_ACCESS',
    'employees',
    employee_id,
    'Lebih dari satu auth_user terhubung ke karyawan yang sama.',
    'OPEN',
    JSONB_BUILD_OBJECT('auth_user_ids', JSONB_AGG(id ORDER BY id)),
    NOW(),
    NOW()
FROM auth_users
WHERE employee_id IS NOT NULL
  AND deleted_at IS NULL
GROUP BY employee_id
HAVING COUNT(*) > 1
ON CONFLICT (id) DO UPDATE
SET payload = EXCLUDED.payload,
    summary = EXCLUDED.summary,
    status = 'OPEN',
    updated_at = EXCLUDED.updated_at;

UPDATE auth_users
SET employee_id = NULL,
    updated_at = NOW()
WHERE employee_id IN (
    SELECT employee_id
    FROM auth_users
    WHERE employee_id IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY employee_id
    HAVING COUNT(*) > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_employee_unique
    ON auth_users (employee_id)
    WHERE employee_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE employee_areas
    ADD COLUMN IF NOT EXISTS effective_from DATE,
    ADD COLUMN IF NOT EXISTS effective_until DATE,
    ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE employee_areas
SET effective_from = COALESCE(effective_from, created_at::DATE)
WHERE effective_from IS NULL;

DROP INDEX IF EXISTS idx_employee_areas_employee_area_active;

CREATE INDEX IF NOT EXISTS idx_employee_areas_effective_period
    ON employee_areas (employee_id, effective_from, effective_until);

ALTER TABLE employee_collection_schedules
    ADD COLUMN IF NOT EXISTS is_default_for_new_members BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE employee_collection_schedules
    ALTER COLUMN effective_from TYPE DATE USING effective_from::DATE,
    ALTER COLUMN effective_until TYPE DATE USING effective_until::DATE;

WITH active_area_counts AS (
    SELECT area_id, COUNT(*) AS schedule_count
    FROM employee_collection_schedules
    WHERE deleted_at IS NULL AND is_active = TRUE
    GROUP BY area_id
)
UPDATE employee_collection_schedules schedule
SET is_default_for_new_members = TRUE
FROM active_area_counts counts
WHERE schedule.area_id = counts.area_id
  AND counts.schedule_count = 1
  AND schedule.deleted_at IS NULL
  AND schedule.is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_collection_schedules_area_default_unique
    ON employee_collection_schedules (area_id)
    WHERE deleted_at IS NULL
      AND is_active = TRUE
      AND is_default_for_new_members = TRUE;

ALTER TABLE cooperative_members
    ADD COLUMN IF NOT EXISTS collection_schedule_id TEXT,
    ADD COLUMN IF NOT EXISTS collection_weekday INTEGER,
    ADD COLUMN IF NOT EXISTS collection_assignment_needs_review BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_cooperative_members_collection_schedule_id
    ON cooperative_members (collection_schedule_id);

WITH latest_loan_schedule AS (
    SELECT DISTINCT ON (member_id)
        member_id,
        collection_schedule_id,
        collection_weekday
    FROM cooperative_loans
    WHERE collection_schedule_id IS NOT NULL
    ORDER BY member_id, updated_at DESC, id DESC
),
unique_employee_area_schedule AS (
    SELECT
        employee_id,
        area_id,
        MIN(id) AS collection_schedule_id,
        MIN(weekday) AS collection_weekday,
        COUNT(*) AS schedule_count
    FROM employee_collection_schedules
    WHERE deleted_at IS NULL AND is_active = TRUE
    GROUP BY employee_id, area_id
),
member_schedule_resolution AS (
    SELECT
        member.id AS member_id,
        COALESCE(
            latest.collection_schedule_id,
            CASE WHEN candidate.schedule_count = 1 THEN candidate.collection_schedule_id END
        ) AS collection_schedule_id,
        COALESCE(
            latest.collection_weekday,
            CASE WHEN candidate.schedule_count = 1 THEN candidate.collection_weekday END
        ) AS collection_weekday
    FROM cooperative_members member
    JOIN unique_employee_area_schedule candidate
      ON candidate.employee_id = member.officer_id
     AND candidate.area_id = member.area_id
    LEFT JOIN latest_loan_schedule latest ON latest.member_id = member.id
    WHERE member.collection_schedule_id IS NULL
)
UPDATE cooperative_members member
SET collection_schedule_id = resolution.collection_schedule_id,
    collection_weekday = resolution.collection_weekday,
    collection_assignment_needs_review = (
        resolution.collection_schedule_id IS NULL
        AND member.status = 'ACTIVE'
    )
FROM member_schedule_resolution resolution
WHERE resolution.member_id = member.id;

UPDATE cooperative_members
SET collection_assignment_needs_review = TRUE
WHERE status = 'ACTIVE'
  AND collection_schedule_id IS NULL;

INSERT INTO implementation_review_queue (
    id, review_type, entity_type, entity_id, summary, status, payload, created_at, updated_at
)
SELECT
    'member-collection-schedule:' || member.id,
    'MEMBER_COLLECTION_SCHEDULE',
    'cooperative_members',
    member.id,
    member.member_number || ' - ' || member.name || ' belum memiliki jadwal penagihan tunggal yang valid.',
    'OPEN',
    JSONB_BUILD_OBJECT('area_id', member.area_id, 'officer_id', member.officer_id),
    NOW(),
    NOW()
FROM cooperative_members member
WHERE member.collection_assignment_needs_review = TRUE
ON CONFLICT (id) DO UPDATE
SET payload = EXCLUDED.payload,
    summary = EXCLUDED.summary,
    status = 'OPEN',
    updated_at = EXCLUDED.updated_at;

INSERT INTO implementation_review_queue (
    id, review_type, entity_type, entity_id, summary, status, payload, created_at, updated_at
)
SELECT
    'collection-default:' || area_id,
    'COLLECTION_DEFAULT',
    'cooperative_areas',
    area_id,
    'Area belum memiliki satu jadwal default aktif untuk anggota baru.',
    'OPEN',
    JSONB_BUILD_OBJECT(
        'active_schedule_count', COUNT(*),
        'default_schedule_count', COUNT(*) FILTER (WHERE is_default_for_new_members)
    ),
    NOW(),
    NOW()
FROM employee_collection_schedules
WHERE deleted_at IS NULL
  AND is_active = TRUE
GROUP BY area_id
HAVING COUNT(*) FILTER (WHERE is_default_for_new_members) <> 1
ON CONFLICT (id) DO UPDATE
SET payload = EXCLUDED.payload,
    summary = EXCLUDED.summary,
    status = 'OPEN',
    updated_at = EXCLUDED.updated_at;

CREATE TABLE IF NOT EXISTS work_schedule_templates (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_schedule_templates_code_unique
    ON work_schedule_templates (LOWER(code)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS work_schedule_days (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES work_schedule_templates(id),
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    is_working_day BOOLEAN NOT NULL DEFAULT TRUE,
    start_time TIME,
    end_time TIME,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    UNIQUE (template_id, weekday)
);

CREATE TABLE IF NOT EXISTS employee_work_schedule_assignments (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    template_id TEXT NOT NULL REFERENCES work_schedule_templates(id),
    template_name TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_until DATE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    CHECK (effective_until IS NULL OR effective_until >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_employee_work_schedule_assignments_period
    ON employee_work_schedule_assignments (employee_id, effective_from, effective_until);

CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'employee_work_schedule_assignments_no_overlap'
    ) THEN
        ALTER TABLE employee_work_schedule_assignments
            ADD CONSTRAINT employee_work_schedule_assignments_no_overlap
            EXCLUDE USING GIST (
                employee_id WITH =,
                DATERANGE(effective_from, COALESCE(effective_until, 'infinity'::DATE), '[]') WITH &&
            )
            WHERE (deleted_at IS NULL);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'employee_areas_no_period_overlap'
    ) THEN
        ALTER TABLE employee_areas
            ADD CONSTRAINT employee_areas_no_period_overlap
            EXCLUDE USING GIST (
                employee_id WITH =,
                area_id WITH =,
                DATERANGE(effective_from, COALESCE(effective_until, 'infinity'::DATE), '[]') WITH &&
            )
            WHERE (deleted_at IS NULL);
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION enforce_collection_schedule_period_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.deleted_at IS NULL
       AND NEW.is_active = TRUE
       AND EXISTS (
         SELECT 1
         FROM employee_collection_schedules existing
         WHERE existing.id <> NEW.id
           AND existing.employee_id = NEW.employee_id
           AND existing.area_id = NEW.area_id
           AND existing.weekday = NEW.weekday
           AND existing.deleted_at IS NULL
           AND existing.is_active = TRUE
           AND DATERANGE(
                 COALESCE(existing.effective_from, existing.created_at::DATE),
                 COALESCE(existing.effective_until, 'infinity'::DATE),
                 '[]'
               ) && DATERANGE(
                 COALESCE(NEW.effective_from, NEW.created_at::DATE),
                 COALESCE(NEW.effective_until, 'infinity'::DATE),
                 '[]'
               )
       )
    THEN
        RAISE EXCEPTION 'Periode jadwal penagihan petugas-area-hari bertumpang tindih.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_collection_schedule_period_overlap
    ON employee_collection_schedules;
CREATE TRIGGER trg_enforce_collection_schedule_period_overlap
BEFORE INSERT OR UPDATE ON employee_collection_schedules
FOR EACH ROW
EXECUTE FUNCTION enforce_collection_schedule_period_overlap();

CREATE TABLE IF NOT EXISTS company_calendar_days (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('HOLIDAY', 'WORKING_OVERRIDE')),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_calendar_days_date_unique
    ON company_calendar_days (date) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS leave_types (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    requires_balance BOOLEAN NOT NULL DEFAULT TRUE,
    annual_quota_days DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (annual_quota_days >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_types_code_unique
    ON leave_types (LOWER(code)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    employee_name TEXT NOT NULL,
    leave_type_id TEXT NOT NULL REFERENCES leave_types(id),
    leave_type_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    day_count DOUBLE PRECISION NOT NULL CHECK (day_count > 0),
    reason TEXT NOT NULL,
    status TEXT NOT NULL,
    supervisor_id TEXT,
    supervisor_name TEXT,
    submitted_at TIMESTAMPTZ,
    supervisor_decided_at TIMESTAMPTZ,
    hr_decided_at TIMESTAMPTZ,
    decided_by TEXT,
    decided_by_name TEXT,
    decision_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_status
    ON leave_requests (employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_period
    ON leave_requests (start_date, end_date);

CREATE TABLE IF NOT EXISTS leave_request_actions (
    id TEXT PRIMARY KEY,
    leave_request_id TEXT NOT NULL REFERENCES leave_requests(id),
    action TEXT NOT NULL,
    actor_user_id TEXT,
    actor_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leave_request_actions_request
    ON leave_request_actions (leave_request_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_request_actions_hr_approved_unique
    ON leave_request_actions (leave_request_id, action)
    WHERE action = 'HR_APPROVED';

CREATE TABLE IF NOT EXISTS leave_balance_ledger (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    leave_type_id TEXT NOT NULL REFERENCES leave_types(id),
    year INTEGER NOT NULL,
    movement_kind TEXT NOT NULL,
    available_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
    reserved_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
    used_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
    leave_request_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    created_by TEXT,
    created_by_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_leave_balance_ledger_balance
    ON leave_balance_ledger (employee_id, leave_type_id, year);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_balance_ledger_request_movement_unique
    ON leave_balance_ledger (leave_request_id, movement_kind)
    WHERE leave_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS employee_availability_exceptions (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    date DATE NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_availability_exception_source_date
    ON employee_availability_exceptions (employee_id, date, source_type, source_id)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS collection_coverage_exceptions (
    id TEXT PRIMARY KEY,
    collection_schedule_id TEXT NOT NULL REFERENCES employee_collection_schedules(id),
    area_id TEXT NOT NULL,
    area_name TEXT NOT NULL,
    original_employee_id TEXT NOT NULL REFERENCES employees(id),
    original_employee_name TEXT NOT NULL,
    collection_date DATE NOT NULL,
    source_leave_request_id TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    resolution_type TEXT,
    replacement_employee_id TEXT,
    replacement_employee_name TEXT,
    rescheduled_date DATE,
    reason TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolved_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_coverage_schedule_date_active
    ON collection_coverage_exceptions (collection_schedule_id, collection_date)
    WHERE deleted_at IS NULL AND status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS idx_collection_coverage_status_date
    ON collection_coverage_exceptions (status, collection_date);

INSERT INTO work_schedule_templates
    (id, code, name, timezone, is_active, created_at, updated_at)
VALUES
    ('work-schedule-default-weekdays', 'DEFAULT-WEEKDAYS', 'Senin–Jumat', 'Asia/Jakarta', TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO work_schedule_days
    (id, template_id, weekday, is_working_day, start_time, end_time, created_at, updated_at)
SELECT
    'work-schedule-default-weekdays:' || weekday::TEXT,
    'work-schedule-default-weekdays',
    weekday,
    weekday BETWEEN 1 AND 5,
    CASE WHEN weekday BETWEEN 1 AND 5 THEN TIME '08:00' END,
    CASE WHEN weekday BETWEEN 1 AND 5 THEN TIME '17:00' END,
    NOW(),
    NOW()
FROM GENERATE_SERIES(1, 7) weekday
ON CONFLICT (id) DO NOTHING;

INSERT INTO leave_types
    (id, code, name, is_paid, requires_balance, annual_quota_days, is_active, created_at, updated_at)
VALUES
    ('leave-type-annual', 'ANNUAL', 'Cuti Tahunan', TRUE, TRUE, 12, TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

WITH mappings(source_permission, target_permission) AS (
    VALUES
        ('EMPLOYEE_MANAGE', 'hr.schedule.manage'),
        ('EMPLOYEE_MANAGE', 'hr.leave.supervisor_approve'),
        ('EMPLOYEE_MANAGE', 'hr.leave.hr_approve'),
        ('EMPLOYEE_MANAGE', 'hr.leave.policy.manage'),
        ('COOPERATIVE_MEMBER_MANAGE', 'cooperative.collection.assignment.manage'),
        ('COOPERATIVE_FIELD_CASH_MANAGE', 'cooperative.collection.coverage.manage')
),
grants AS (
    SELECT DISTINCT role_permission.role_id, mappings.target_permission
    FROM role_permissions role_permission
    JOIN mappings ON mappings.source_permission = role_permission.permission_code
    WHERE role_permission.deleted_at IS NULL
)
INSERT INTO role_permissions
    (id, role_id, permission_code, created_at, updated_at, deleted_at)
SELECT
    grants.role_id || ':' || grants.target_permission,
    grants.role_id,
    grants.target_permission,
    NOW(),
    NOW(),
    NULL
FROM grants
ON CONFLICT (role_id, permission_code) DO UPDATE
SET deleted_at = NULL,
    updated_at = EXCLUDED.updated_at;

INSERT INTO role_permissions
    (id, role_id, permission_code, created_at, updated_at, deleted_at)
SELECT
    role.id || ':hr.leave.self_service',
    role.id,
    'hr.leave.self_service',
    NOW(),
    NOW(),
    NULL
FROM roles role
WHERE role.deleted_at IS NULL
ON CONFLICT (role_id, permission_code) DO UPDATE
SET deleted_at = NULL,
    updated_at = EXCLUDED.updated_at;
