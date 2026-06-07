use crate::models::project::ProjectDto;
use sqlx::PgPool;

pub async fn list_projects(pool: &PgPool) -> Result<Vec<ProjectDto>, sqlx::Error> {
    sqlx::query_as::<_, ProjectDto>(
        r#"
        SELECT
            id,
            code,
            name,
            status,
            contact_id,
            contact_name,
            department_id,
            department_code,
            department_name,
            start_date,
            end_date,
            budget_amount,
            description,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM projects
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_project(pool: &PgPool, id: String) -> Result<Option<ProjectDto>, sqlx::Error> {
    sqlx::query_as::<_, ProjectDto>(
        r#"
        SELECT
            id,
            code,
            name,
            status,
            contact_id,
            contact_name,
            department_id,
            department_code,
            department_name,
            start_date,
            end_date,
            budget_amount,
            description,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM projects
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_project_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<ProjectDto>, sqlx::Error> {
    sqlx::query_as::<_, ProjectDto>(
        r#"
        SELECT
            id,
            code,
            name,
            status,
            contact_id,
            contact_name,
            department_id,
            department_code,
            department_name,
            start_date,
            end_date,
            budget_amount,
            description,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM projects
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_project(pool: &PgPool, input: ProjectDto) -> Result<ProjectDto, sqlx::Error> {
    let project_id = input.id.clone();
    let upserted_project = sqlx::query_as::<_, ProjectDto>(
        r#"
        INSERT INTO projects (
            id,
            code,
            name,
            status,
            contact_id,
            contact_name,
            department_id,
            department_code,
            department_name,
            start_date,
            end_date,
            budget_amount,
            description,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15::TIMESTAMPTZ,
            $16::TIMESTAMPTZ,
            $17::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            contact_id = EXCLUDED.contact_id,
            contact_name = EXCLUDED.contact_name,
            department_id = EXCLUDED.department_id,
            department_code = EXCLUDED.department_code,
            department_name = EXCLUDED.department_name,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            budget_amount = EXCLUDED.budget_amount,
            description = EXCLUDED.description,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= projects.updated_at
        RETURNING
            id,
            code,
            name,
            status,
            contact_id,
            contact_name,
            department_id,
            department_code,
            department_name,
            start_date,
            end_date,
            budget_amount,
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
    .bind(input.status)
    .bind(input.contact_id)
    .bind(input.contact_name)
    .bind(input.department_id)
    .bind(input.department_code)
    .bind(input.department_name)
    .bind(input.start_date)
    .bind(input.end_date)
    .bind(input.budget_amount)
    .bind(input.description)
    .bind(input.is_active)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(project) = upserted_project {
        return Ok(project);
    }

    get_project_including_deleted(pool, project_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_project(pool: &PgPool, id: String) -> Result<Option<ProjectDto>, sqlx::Error> {
    let deleted_project = sqlx::query_as::<_, ProjectDto>(
        r#"
        UPDATE projects
        SET
            is_active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            code,
            name,
            status,
            contact_id,
            contact_name,
            department_id,
            department_code,
            department_name,
            start_date,
            end_date,
            budget_amount,
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

    if deleted_project.is_some() {
        return Ok(deleted_project);
    }

    get_project_including_deleted(pool, id).await
}
