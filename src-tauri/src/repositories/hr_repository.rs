use crate::models::hr::{
    EmployeeSalaryComponentDto, EmploymentContractDto, HrPositionDto, SalaryComponentDto,
};
use sqlx::PgPool;

pub async fn list_hr_positions(
    pool: &PgPool,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<HrPositionDto>, sqlx::Error> {
    sqlx::query_as::<_, HrPositionDto>(
        r#"
        SELECT id, code, name, department_id, department_code, department_name, level,
               reports_to_position_id, reports_to_position_code, reports_to_position_name,
               description, is_active, created_at::TEXT AS created_at,
               updated_at::TEXT AS updated_at, deleted_at::TEXT AS deleted_at
        FROM hr_positions
        WHERE ($1::TIMESTAMPTZ IS NULL OR (updated_at, id) > ($1::TIMESTAMPTZ, COALESCE($2::TEXT, '')))
        ORDER BY updated_at, id
        LIMIT $3
        "#,
    )
    .bind(updated_after)
    .bind(cursor_id)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

pub async fn upsert_hr_position(
    pool: &PgPool,
    input: HrPositionDto,
) -> Result<HrPositionDto, sqlx::Error> {
    let id = input.id.clone();
    let payload = serde_json::to_value(input).unwrap_or(serde_json::Value::Null);
    sqlx::query(
        r#"
        INSERT INTO hr_positions
        SELECT (jsonb_populate_record(NULL::hr_positions, $1::JSONB)).*
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            department_id = EXCLUDED.department_id,
            department_code = EXCLUDED.department_code,
            department_name = EXCLUDED.department_name,
            level = EXCLUDED.level,
            reports_to_position_id = EXCLUDED.reports_to_position_id,
            reports_to_position_code = EXCLUDED.reports_to_position_code,
            reports_to_position_name = EXCLUDED.reports_to_position_name,
            description = EXCLUDED.description,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= hr_positions.updated_at
        "#,
    )
    .bind(payload)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, HrPositionDto>(
        r#"
        SELECT id, code, name, department_id, department_code, department_name, level,
               reports_to_position_id, reports_to_position_code, reports_to_position_name,
               description, is_active, created_at::TEXT AS created_at,
               updated_at::TEXT AS updated_at, deleted_at::TEXT AS deleted_at
        FROM hr_positions WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
}

pub async fn list_employment_contracts(
    pool: &PgPool,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<EmploymentContractDto>, sqlx::Error> {
    sqlx::query_as::<_, EmploymentContractDto>(
        r#"
        SELECT id, contract_number, employee_id, employee_number, employee_name, contract_type,
               start_date::TEXT AS start_date, end_date::TEXT AS end_date, job_position_id,
               job_position_code, job_position_name, department_id, department_code,
               department_name, base_salary, status, notes, renewed_from_contract_id,
               created_at::TEXT AS created_at, updated_at::TEXT AS updated_at,
               deleted_at::TEXT AS deleted_at
        FROM employment_contracts
        WHERE ($1::TIMESTAMPTZ IS NULL OR (updated_at, id) > ($1::TIMESTAMPTZ, COALESCE($2::TEXT, '')))
        ORDER BY updated_at, id
        LIMIT $3
        "#,
    )
    .bind(updated_after)
    .bind(cursor_id)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

pub async fn upsert_employment_contract(
    pool: &PgPool,
    input: EmploymentContractDto,
) -> Result<EmploymentContractDto, sqlx::Error> {
    let id = input.id.clone();
    let payload = serde_json::to_value(input).unwrap_or(serde_json::Value::Null);
    sqlx::query(
        r#"
        INSERT INTO employment_contracts
        SELECT (jsonb_populate_record(NULL::employment_contracts, $1::JSONB)).*
        ON CONFLICT (id) DO UPDATE SET
            contract_number = EXCLUDED.contract_number,
            employee_id = EXCLUDED.employee_id,
            employee_number = EXCLUDED.employee_number,
            employee_name = EXCLUDED.employee_name,
            contract_type = EXCLUDED.contract_type,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            job_position_id = EXCLUDED.job_position_id,
            job_position_code = EXCLUDED.job_position_code,
            job_position_name = EXCLUDED.job_position_name,
            department_id = EXCLUDED.department_id,
            department_code = EXCLUDED.department_code,
            department_name = EXCLUDED.department_name,
            base_salary = EXCLUDED.base_salary,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            renewed_from_contract_id = EXCLUDED.renewed_from_contract_id,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= employment_contracts.updated_at
        "#,
    )
    .bind(payload)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, EmploymentContractDto>(
        r#"
        SELECT id, contract_number, employee_id, employee_number, employee_name, contract_type,
               start_date::TEXT AS start_date, end_date::TEXT AS end_date, job_position_id,
               job_position_code, job_position_name, department_id, department_code,
               department_name, base_salary, status, notes, renewed_from_contract_id,
               created_at::TEXT AS created_at, updated_at::TEXT AS updated_at,
               deleted_at::TEXT AS deleted_at
        FROM employment_contracts WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
}

pub async fn list_salary_components(
    pool: &PgPool,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<SalaryComponentDto>, sqlx::Error> {
    sqlx::query_as::<_, SalaryComponentDto>(
        r#"
        SELECT id, code, name, kind, calculation, default_value, is_taxable, is_active,
               created_at::TEXT AS created_at, updated_at::TEXT AS updated_at,
               deleted_at::TEXT AS deleted_at
        FROM salary_components
        WHERE ($1::TIMESTAMPTZ IS NULL OR (updated_at, id) > ($1::TIMESTAMPTZ, COALESCE($2::TEXT, '')))
        ORDER BY updated_at, id
        LIMIT $3
        "#,
    )
    .bind(updated_after)
    .bind(cursor_id)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

pub async fn upsert_salary_component(
    pool: &PgPool,
    input: SalaryComponentDto,
) -> Result<SalaryComponentDto, sqlx::Error> {
    let id = input.id.clone();
    let payload = serde_json::to_value(input).unwrap_or(serde_json::Value::Null);
    sqlx::query(
        r#"
        INSERT INTO salary_components
        SELECT (jsonb_populate_record(NULL::salary_components, $1::JSONB)).*
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            kind = EXCLUDED.kind,
            calculation = EXCLUDED.calculation,
            default_value = EXCLUDED.default_value,
            is_taxable = EXCLUDED.is_taxable,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= salary_components.updated_at
        "#,
    )
    .bind(payload)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, SalaryComponentDto>(
        r#"
        SELECT id, code, name, kind, calculation, default_value, is_taxable, is_active,
               created_at::TEXT AS created_at, updated_at::TEXT AS updated_at,
               deleted_at::TEXT AS deleted_at
        FROM salary_components WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
}

pub async fn list_employee_salary_components(
    pool: &PgPool,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<EmployeeSalaryComponentDto>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeSalaryComponentDto>(
        r#"
        SELECT id, employee_id, salary_component_id, component_code, component_name,
               kind, calculation, value, is_active, created_at::TEXT AS created_at,
               updated_at::TEXT AS updated_at, deleted_at::TEXT AS deleted_at
        FROM employee_salary_components
        WHERE ($1::TIMESTAMPTZ IS NULL OR (updated_at, id) > ($1::TIMESTAMPTZ, COALESCE($2::TEXT, '')))
        ORDER BY updated_at, id
        LIMIT $3
        "#,
    )
    .bind(updated_after)
    .bind(cursor_id)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

pub async fn upsert_employee_salary_component(
    pool: &PgPool,
    input: EmployeeSalaryComponentDto,
) -> Result<EmployeeSalaryComponentDto, sqlx::Error> {
    let id = input.id.clone();
    let payload = serde_json::to_value(input).unwrap_or(serde_json::Value::Null);
    sqlx::query(
        r#"
        INSERT INTO employee_salary_components
        SELECT (jsonb_populate_record(NULL::employee_salary_components, $1::JSONB)).*
        ON CONFLICT (id) DO UPDATE SET
            employee_id = EXCLUDED.employee_id,
            salary_component_id = EXCLUDED.salary_component_id,
            component_code = EXCLUDED.component_code,
            component_name = EXCLUDED.component_name,
            kind = EXCLUDED.kind,
            calculation = EXCLUDED.calculation,
            value = EXCLUDED.value,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= employee_salary_components.updated_at
        "#,
    )
    .bind(payload)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, EmployeeSalaryComponentDto>(
        r#"
        SELECT id, employee_id, salary_component_id, component_code, component_name,
               kind, calculation, value, is_active, created_at::TEXT AS created_at,
               updated_at::TEXT AS updated_at, deleted_at::TEXT AS deleted_at
        FROM employee_salary_components WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
}
