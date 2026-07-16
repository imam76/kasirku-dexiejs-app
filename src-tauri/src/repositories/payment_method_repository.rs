use crate::models::payment_method::PaymentMethodDto;
use sqlx::PgPool;

const PAYMENT_METHOD_COLUMNS: &str = r#"
    id,
    code,
    name,
    category,
    posting_account_id,
    posting_account_code,
    posting_account_name,
    requires_reference,
    is_system,
    is_active,
    sort_order,
    created_at::TEXT AS created_at,
    updated_at::TEXT AS updated_at,
    deleted_at::TEXT AS deleted_at
"#;

pub async fn list_payment_methods(pool: &PgPool) -> Result<Vec<PaymentMethodDto>, sqlx::Error> {
    let query = format!(
        "SELECT {PAYMENT_METHOD_COLUMNS} FROM payment_methods WHERE deleted_at IS NULL ORDER BY sort_order ASC, name ASC"
    );
    sqlx::query_as::<_, PaymentMethodDto>(sqlx::AssertSqlSafe(query))
        .fetch_all(pool)
        .await
}

pub async fn get_payment_method(
    pool: &PgPool,
    id: String,
) -> Result<Option<PaymentMethodDto>, sqlx::Error> {
    let query = format!(
        "SELECT {PAYMENT_METHOD_COLUMNS} FROM payment_methods WHERE id = $1 AND deleted_at IS NULL"
    );
    sqlx::query_as::<_, PaymentMethodDto>(sqlx::AssertSqlSafe(query))
        .bind(id)
        .fetch_optional(pool)
        .await
}

async fn get_payment_method_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<PaymentMethodDto>, sqlx::Error> {
    let query = format!("SELECT {PAYMENT_METHOD_COLUMNS} FROM payment_methods WHERE id = $1");
    sqlx::query_as::<_, PaymentMethodDto>(sqlx::AssertSqlSafe(query))
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn upsert_payment_method(
    pool: &PgPool,
    input: PaymentMethodDto,
) -> Result<PaymentMethodDto, sqlx::Error> {
    let payment_method_id = input.id.clone();
    let query = format!(
        r#"
        INSERT INTO payment_methods (
            id, code, name, category,
            posting_account_id, posting_account_code, posting_account_name,
            requires_reference, is_system, is_active, sort_order,
            created_at, updated_at, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::TIMESTAMPTZ, $13::TIMESTAMPTZ, $14::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            code = CASE WHEN payment_methods.is_system THEN payment_methods.code ELSE EXCLUDED.code END,
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            posting_account_id = EXCLUDED.posting_account_id,
            posting_account_code = EXCLUDED.posting_account_code,
            posting_account_name = EXCLUDED.posting_account_name,
            requires_reference = EXCLUDED.requires_reference,
            is_system = payment_methods.is_system OR EXCLUDED.is_system,
            is_active = EXCLUDED.is_active,
            sort_order = EXCLUDED.sort_order,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= payment_methods.updated_at
        RETURNING {PAYMENT_METHOD_COLUMNS}
        "#
    );
    let result = sqlx::query_as::<_, PaymentMethodDto>(sqlx::AssertSqlSafe(query))
        .bind(input.id)
        .bind(input.code)
        .bind(input.name)
        .bind(input.category)
        .bind(input.posting_account_id)
        .bind(input.posting_account_code)
        .bind(input.posting_account_name)
        .bind(input.requires_reference)
        .bind(input.is_system)
        .bind(input.is_active)
        .bind(input.sort_order)
        .bind(input.created_at)
        .bind(input.updated_at)
        .bind(input.deleted_at)
        .fetch_optional(pool)
        .await?;

    if let Some(method) = result {
        return Ok(method);
    }
    get_payment_method_including_deleted(pool, payment_method_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_payment_method(
    pool: &PgPool,
    id: String,
) -> Result<Option<PaymentMethodDto>, sqlx::Error> {
    let query = format!(
        r#"
        UPDATE payment_methods
        SET is_active = FALSE, updated_at = NOW(), deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL AND is_system = FALSE
        RETURNING {PAYMENT_METHOD_COLUMNS}
        "#
    );
    let deleted = sqlx::query_as::<_, PaymentMethodDto>(sqlx::AssertSqlSafe(query))
        .bind(id.clone())
        .fetch_optional(pool)
        .await?;
    if deleted.is_some() {
        return Ok(deleted);
    }
    get_payment_method_including_deleted(pool, id).await
}
