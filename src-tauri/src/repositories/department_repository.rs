use crate::models::department::DepartmentDto;
use sqlx::PgPool;

pub async fn list_departments(pool: &PgPool) -> Result<Vec<DepartmentDto>, sqlx::Error> {
    sqlx::query_as::<_, DepartmentDto>(
        r#"
        SELECT
            id,
            code,
            name,
            description,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM departments
        WHERE deleted_at IS NULL
        ORDER BY name ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_department(
    pool: &PgPool,
    id: String,
) -> Result<Option<DepartmentDto>, sqlx::Error> {
    sqlx::query_as::<_, DepartmentDto>(
        r#"
        SELECT
            id,
            code,
            name,
            description,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM departments
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_department_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<DepartmentDto>, sqlx::Error> {
    sqlx::query_as::<_, DepartmentDto>(
        r#"
        SELECT
            id,
            code,
            name,
            description,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM departments
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_department(
    pool: &PgPool,
    input: DepartmentDto,
) -> Result<DepartmentDto, sqlx::Error> {
    let department_id = input.id.clone();
    let upserted_department = sqlx::query_as::<_, DepartmentDto>(
        r#"
        INSERT INTO departments (
            id,
            code,
            name,
            description,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::TIMESTAMPTZ, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= departments.updated_at
        RETURNING
            id,
            code,
            name,
            description,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.code)
    .bind(input.name)
    .bind(input.description)
    .bind(input.is_active)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(department) = upserted_department {
        return Ok(department);
    }

    get_department_including_deleted(pool, department_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_department(
    pool: &PgPool,
    id: String,
) -> Result<Option<DepartmentDto>, sqlx::Error> {
    let deleted_department = sqlx::query_as::<_, DepartmentDto>(
        r#"
        UPDATE departments
        SET
            is_active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            code,
            name,
            description,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_department.is_some() {
        return Ok(deleted_department);
    }

    get_department_including_deleted(pool, id).await
}
