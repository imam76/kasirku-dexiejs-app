use crate::models::chart_of_account::ChartOfAccountDto;
use sqlx::PgPool;

pub async fn list_chart_of_accounts(pool: &PgPool) -> Result<Vec<ChartOfAccountDto>, sqlx::Error> {
    sqlx::query_as::<_, ChartOfAccountDto>(
        r#"
        SELECT
            id,
            code,
            name,
            type,
            normal_balance,
            parent_id,
            parent_code,
            parent_name,
            is_postable,
            is_system,
            is_active,
            description,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM chart_of_accounts
        WHERE deleted_at IS NULL
        ORDER BY code ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_chart_of_account(
    pool: &PgPool,
    id: String,
) -> Result<Option<ChartOfAccountDto>, sqlx::Error> {
    sqlx::query_as::<_, ChartOfAccountDto>(
        r#"
        SELECT
            id,
            code,
            name,
            type,
            normal_balance,
            parent_id,
            parent_code,
            parent_name,
            is_postable,
            is_system,
            is_active,
            description,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM chart_of_accounts
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_chart_of_account_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<ChartOfAccountDto>, sqlx::Error> {
    sqlx::query_as::<_, ChartOfAccountDto>(
        r#"
        SELECT
            id,
            code,
            name,
            type,
            normal_balance,
            parent_id,
            parent_code,
            parent_name,
            is_postable,
            is_system,
            is_active,
            description,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM chart_of_accounts
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_chart_of_account(
    pool: &PgPool,
    input: ChartOfAccountDto,
) -> Result<ChartOfAccountDto, sqlx::Error> {
    let account_id = input.id.clone();
    let upserted_account = sqlx::query_as::<_, ChartOfAccountDto>(
        r#"
        INSERT INTO chart_of_accounts (
            id,
            code,
            name,
            type,
            normal_balance,
            parent_id,
            parent_code,
            parent_name,
            is_postable,
            is_system,
            is_active,
            description,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13::TIMESTAMPTZ, $14::TIMESTAMPTZ, $15::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            normal_balance = EXCLUDED.normal_balance,
            parent_id = EXCLUDED.parent_id,
            parent_code = EXCLUDED.parent_code,
            parent_name = EXCLUDED.parent_name,
            is_postable = EXCLUDED.is_postable,
            is_system = EXCLUDED.is_system,
            is_active = EXCLUDED.is_active,
            description = EXCLUDED.description,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= chart_of_accounts.updated_at
        RETURNING
            id,
            code,
            name,
            type,
            normal_balance,
            parent_id,
            parent_code,
            parent_name,
            is_postable,
            is_system,
            is_active,
            description,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.code)
    .bind(input.name)
    .bind(input.r#type)
    .bind(input.normal_balance)
    .bind(input.parent_id)
    .bind(input.parent_code)
    .bind(input.parent_name)
    .bind(input.is_postable)
    .bind(input.is_system)
    .bind(input.is_active)
    .bind(input.description)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(account) = upserted_account {
        return Ok(account);
    }

    get_chart_of_account_including_deleted(pool, account_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_chart_of_account(
    pool: &PgPool,
    id: String,
) -> Result<Option<ChartOfAccountDto>, sqlx::Error> {
    let deleted_account = sqlx::query_as::<_, ChartOfAccountDto>(
        r#"
        UPDATE chart_of_accounts
        SET
            is_active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            code,
            name,
            type,
            normal_balance,
            parent_id,
            parent_code,
            parent_name,
            is_postable,
            is_system,
            is_active,
            description,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_account.is_some() {
        return Ok(deleted_account);
    }

    get_chart_of_account_including_deleted(pool, id).await
}
