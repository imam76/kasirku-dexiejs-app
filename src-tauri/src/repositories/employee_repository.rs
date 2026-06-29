use crate::models::employee::{EmployeeDto, EmployeeAreaDto, EmployeeCollectionScheduleDto};
use sqlx::PgPool;

pub async fn list_employees(pool: &PgPool) -> Result<Vec<EmployeeDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeDto>(
        r#"
        SELECT
            id,
            name,
            phone,
            email,
            address,
            position,
            user_id,
            user_name,
            login_role_id,
            field_cash_account_id,
            field_cash_account_code,
            field_cash_account_name,
            pin_hash,
            pin_salt,
            notes,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM employees
        WHERE deleted_at IS NULL
        ORDER BY name ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_employee(
    pool: &PgPool,
    id: String,
) -> Result<Option<EmployeeDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeDto>(
        r#"
        SELECT
            id,
            name,
            phone,
            email,
            address,
            position,
            user_id,
            user_name,
            login_role_id,
            field_cash_account_id,
            field_cash_account_code,
            field_cash_account_name,
            pin_hash,
            pin_salt,
            notes,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM employees
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_employee(
    pool: &PgPool,
    input: EmployeeDto,
) -> Result<EmployeeDto, sqlx::Error> {
    sqlx::query_as::<_, EmployeeDto>(
        r#"
        INSERT INTO employees (
            id,
            name,
            phone,
            email,
            address,
            position,
            user_id,
            user_name,
            login_role_id,
            field_cash_account_id,
            field_cash_account_code,
            field_cash_account_name,
            pin_hash,
            pin_salt,
            notes,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::TIMESTAMPTZ, $18::TIMESTAMPTZ, $19::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            address = EXCLUDED.address,
            position = EXCLUDED.position,
            user_id = EXCLUDED.user_id,
            user_name = EXCLUDED.user_name,
            login_role_id = EXCLUDED.login_role_id,
            field_cash_account_id = EXCLUDED.field_cash_account_id,
            field_cash_account_code = EXCLUDED.field_cash_account_code,
            field_cash_account_name = EXCLUDED.field_cash_account_name,
            pin_hash = EXCLUDED.pin_hash,
            pin_salt = EXCLUDED.pin_salt,
            notes = EXCLUDED.notes,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= employees.updated_at
        RETURNING
            id,
            name,
            phone,
            email,
            address,
            position,
            user_id,
            user_name,
            login_role_id,
            field_cash_account_id,
            field_cash_account_code,
            field_cash_account_name,
            pin_hash,
            pin_salt,
            notes,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(&input.id)
    .bind(&input.name)
    .bind(&input.phone)
    .bind(&input.email)
    .bind(&input.address)
    .bind(&input.position)
    .bind(&input.user_id)
    .bind(&input.user_name)
    .bind(&input.login_role_id)
    .bind(&input.field_cash_account_id)
    .bind(&input.field_cash_account_code)
    .bind(&input.field_cash_account_name)
    .bind(&input.pin_hash)
    .bind(&input.pin_salt)
    .bind(&input.notes)
    .bind(input.is_active)
    .bind(&input.created_at)
    .bind(&input.updated_at)
    .bind(&input.deleted_at)
    .fetch_one(pool)
    .await
}

pub async fn list_employee_areas(pool: &PgPool) -> Result<Vec<EmployeeAreaDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeAreaDto>(
        r#"
        SELECT
            id,
            employee_id,
            area_id,
            area_name,
            area_code,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM employee_areas
        WHERE deleted_at IS NULL
        ORDER BY employee_id, area_name ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_employee_area(
    pool: &PgPool,
    input: EmployeeAreaDto,
) -> Result<EmployeeAreaDto, sqlx::Error> {
    sqlx::query_as::<_, EmployeeAreaDto>(
        r#"
        INSERT INTO employee_areas (
            id,
            employee_id,
            area_id,
            area_name,
            area_code,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::TIMESTAMPTZ, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            employee_id = EXCLUDED.employee_id,
            area_id = EXCLUDED.area_id,
            area_name = EXCLUDED.area_name,
            area_code = EXCLUDED.area_code,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= employee_areas.updated_at
        RETURNING
            id,
            employee_id,
            area_id,
            area_name,
            area_code,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(&input.id)
    .bind(&input.employee_id)
    .bind(&input.area_id)
    .bind(&input.area_name)
    .bind(&input.area_code)
    .bind(&input.created_at)
    .bind(&input.updated_at)
    .bind(&input.deleted_at)
    .fetch_one(pool)
    .await
}

pub async fn list_employee_collection_schedules(
    pool: &PgPool,
) -> Result<Vec<EmployeeCollectionScheduleDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeCollectionScheduleDto>(
        r#"
        SELECT
            id,
            employee_id,
            employee_name,
            employee_position,
            area_id,
            area_name,
            area_code,
            weekday,
            effective_from::TEXT AS effective_from,
            effective_until::TEXT AS effective_until,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM employee_collection_schedules
        WHERE deleted_at IS NULL
        ORDER BY employee_id, area_id, weekday ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_employee_collection_schedule(
    pool: &PgPool,
    input: EmployeeCollectionScheduleDto,
) -> Result<EmployeeCollectionScheduleDto, sqlx::Error> {
    sqlx::query_as::<_, EmployeeCollectionScheduleDto>(
        r#"
        INSERT INTO employee_collection_schedules (
            id,
            employee_id,
            employee_name,
            employee_position,
            area_id,
            area_name,
            area_code,
            weekday,
            effective_from,
            effective_until,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::TIMESTAMPTZ, $10::TIMESTAMPTZ, $11, $12::TIMESTAMPTZ, $13::TIMESTAMPTZ, $14::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            employee_id = EXCLUDED.employee_id,
            employee_name = EXCLUDED.employee_name,
            employee_position = EXCLUDED.employee_position,
            area_id = EXCLUDED.area_id,
            area_name = EXCLUDED.area_name,
            area_code = EXCLUDED.area_code,
            weekday = EXCLUDED.weekday,
            effective_from = EXCLUDED.effective_from,
            effective_until = EXCLUDED.effective_until,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= employee_collection_schedules.updated_at
        RETURNING
            id,
            employee_id,
            employee_name,
            employee_position,
            area_id,
            area_name,
            area_code,
            weekday,
            effective_from::TEXT AS effective_from,
            effective_until::TEXT AS effective_until,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(&input.id)
    .bind(&input.employee_id)
    .bind(&input.employee_name)
    .bind(&input.employee_position)
    .bind(&input.area_id)
    .bind(&input.area_name)
    .bind(&input.area_code)
    .bind(input.weekday)
    .bind(&input.effective_from)
    .bind(&input.effective_until)
    .bind(input.is_active)
    .bind(&input.created_at)
    .bind(&input.updated_at)
    .bind(&input.deleted_at)
    .fetch_one(pool)
    .await
}
