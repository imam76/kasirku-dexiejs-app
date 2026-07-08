use crate::models::tax::TaxDto;
use sqlx::PgPool;

pub async fn list_taxes(pool: &PgPool) -> Result<Vec<TaxDto>, sqlx::Error> {
    sqlx::query_as::<_, TaxDto>(
        r#"
        SELECT
            id,
            code,
            name,
            rate,
            rate_type,
            calculation_mode,
            tax_flow,
            sales_tax_account_id,
            sales_tax_account_code,
            sales_tax_account_name,
            sales_tax_account_type,
            purchase_tax_account_id,
            purchase_tax_account_code,
            purchase_tax_account_name,
            purchase_tax_account_type,
            description,
            effective_from,
            effective_to,
            is_default,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM taxes
        WHERE deleted_at IS NULL
        ORDER BY is_default DESC, is_active DESC, name ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_tax(pool: &PgPool, id: String) -> Result<Option<TaxDto>, sqlx::Error> {
    sqlx::query_as::<_, TaxDto>(
        r#"
        SELECT
            id,
            code,
            name,
            rate,
            rate_type,
            calculation_mode,
            tax_flow,
            sales_tax_account_id,
            sales_tax_account_code,
            sales_tax_account_name,
            sales_tax_account_type,
            purchase_tax_account_id,
            purchase_tax_account_code,
            purchase_tax_account_name,
            purchase_tax_account_type,
            description,
            effective_from,
            effective_to,
            is_default,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM taxes
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_tax_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<TaxDto>, sqlx::Error> {
    sqlx::query_as::<_, TaxDto>(
        r#"
        SELECT
            id,
            code,
            name,
            rate,
            rate_type,
            calculation_mode,
            tax_flow,
            sales_tax_account_id,
            sales_tax_account_code,
            sales_tax_account_name,
            sales_tax_account_type,
            purchase_tax_account_id,
            purchase_tax_account_code,
            purchase_tax_account_name,
            purchase_tax_account_type,
            description,
            effective_from,
            effective_to,
            is_default,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM taxes
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_tax(pool: &PgPool, input: TaxDto) -> Result<TaxDto, sqlx::Error> {
    let tax_id = input.id.clone();
    let upserted_tax = sqlx::query_as::<_, TaxDto>(
        r#"
        INSERT INTO taxes (
            id,
            code,
            name,
            rate,
            rate_type,
            calculation_mode,
            tax_flow,
            sales_tax_account_id,
            sales_tax_account_code,
            sales_tax_account_name,
            sales_tax_account_type,
            purchase_tax_account_id,
            purchase_tax_account_code,
            purchase_tax_account_name,
            purchase_tax_account_type,
            description,
            effective_from,
            effective_to,
            is_default,
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
            $15,
            $16,
            $17,
            $18,
            $19,
            $20,
            $21::TIMESTAMPTZ,
            $22::TIMESTAMPTZ,
            $23::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            rate = EXCLUDED.rate,
            rate_type = EXCLUDED.rate_type,
            calculation_mode = EXCLUDED.calculation_mode,
            tax_flow = EXCLUDED.tax_flow,
            sales_tax_account_id = EXCLUDED.sales_tax_account_id,
            sales_tax_account_code = EXCLUDED.sales_tax_account_code,
            sales_tax_account_name = EXCLUDED.sales_tax_account_name,
            sales_tax_account_type = EXCLUDED.sales_tax_account_type,
            purchase_tax_account_id = EXCLUDED.purchase_tax_account_id,
            purchase_tax_account_code = EXCLUDED.purchase_tax_account_code,
            purchase_tax_account_name = EXCLUDED.purchase_tax_account_name,
            purchase_tax_account_type = EXCLUDED.purchase_tax_account_type,
            description = EXCLUDED.description,
            effective_from = EXCLUDED.effective_from,
            effective_to = EXCLUDED.effective_to,
            is_default = EXCLUDED.is_default,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= taxes.updated_at
        RETURNING
            id,
            code,
            name,
            rate,
            rate_type,
            calculation_mode,
            tax_flow,
            sales_tax_account_id,
            sales_tax_account_code,
            sales_tax_account_name,
            sales_tax_account_type,
            purchase_tax_account_id,
            purchase_tax_account_code,
            purchase_tax_account_name,
            purchase_tax_account_type,
            description,
            effective_from,
            effective_to,
            is_default,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.code)
    .bind(input.name)
    .bind(input.rate)
    .bind(input.rate_type)
    .bind(input.calculation_mode)
    .bind(input.tax_flow)
    .bind(input.sales_tax_account_id)
    .bind(input.sales_tax_account_code)
    .bind(input.sales_tax_account_name)
    .bind(input.sales_tax_account_type)
    .bind(input.purchase_tax_account_id)
    .bind(input.purchase_tax_account_code)
    .bind(input.purchase_tax_account_name)
    .bind(input.purchase_tax_account_type)
    .bind(input.description)
    .bind(input.effective_from)
    .bind(input.effective_to)
    .bind(input.is_default)
    .bind(input.is_active)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(tax) = upserted_tax {
        return Ok(tax);
    }

    get_tax_including_deleted(pool, tax_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_tax(pool: &PgPool, id: String) -> Result<Option<TaxDto>, sqlx::Error> {
    let deleted_tax = sqlx::query_as::<_, TaxDto>(
        r#"
        UPDATE taxes
        SET
            is_default = FALSE,
            is_active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            code,
            name,
            rate,
            rate_type,
            calculation_mode,
            tax_flow,
            sales_tax_account_id,
            sales_tax_account_code,
            sales_tax_account_name,
            sales_tax_account_type,
            purchase_tax_account_id,
            purchase_tax_account_code,
            purchase_tax_account_name,
            purchase_tax_account_type,
            description,
            effective_from,
            effective_to,
            is_default,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_tax.is_some() {
        return Ok(deleted_tax);
    }

    get_tax_including_deleted(pool, id).await
}
