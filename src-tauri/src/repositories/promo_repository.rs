use crate::models::promo::PromoDto;
use sqlx::PgPool;

pub async fn list_promos(
    pool: &PgPool,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<PromoDto>, sqlx::Error> {
    sqlx::query_as::<_, PromoDto>(
        r#"
        SELECT
            id,
            name,
            type,
            value,
            applies_to,
            product_ids,
            categories,
            start_at::TEXT AS start_at,
            end_at::TEXT AS end_at,
            min_qty,
            min_total,
            voucher_code,
            active,
            priority,
            created_by,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM promos
        WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1::TIMESTAMPTZ)
        ORDER BY updated_at, id
        LIMIT $2
        "#,
    )
    .bind(updated_after)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

pub async fn get_promo(pool: &PgPool, id: String) -> Result<Option<PromoDto>, sqlx::Error> {
    sqlx::query_as::<_, PromoDto>(
        r#"
        SELECT
            id,
            name,
            type,
            value,
            applies_to,
            product_ids,
            categories,
            start_at::TEXT AS start_at,
            end_at::TEXT AS end_at,
            min_qty,
            min_total,
            voucher_code,
            active,
            priority,
            created_by,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM promos
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_promo_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<PromoDto>, sqlx::Error> {
    sqlx::query_as::<_, PromoDto>(
        r#"
        SELECT
            id,
            name,
            type,
            value,
            applies_to,
            product_ids,
            categories,
            start_at::TEXT AS start_at,
            end_at::TEXT AS end_at,
            min_qty,
            min_total,
            voucher_code,
            active,
            priority,
            created_by,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM promos
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_promo(pool: &PgPool, input: PromoDto) -> Result<PromoDto, sqlx::Error> {
    let promo_id = input.id.clone();
    let upserted_promo = sqlx::query_as::<_, PromoDto>(
        r#"
        INSERT INTO promos (
            id,
            name,
            type,
            value,
            applies_to,
            product_ids,
            categories,
            start_at,
            end_at,
            min_qty,
            min_total,
            voucher_code,
            active,
            priority,
            created_by,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::TIMESTAMPTZ, $9::TIMESTAMPTZ,
            $10, $11, $12, $13, $14, $15, $16::TIMESTAMPTZ, $17::TIMESTAMPTZ, $18::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            value = EXCLUDED.value,
            applies_to = EXCLUDED.applies_to,
            product_ids = EXCLUDED.product_ids,
            categories = EXCLUDED.categories,
            start_at = EXCLUDED.start_at,
            end_at = EXCLUDED.end_at,
            min_qty = EXCLUDED.min_qty,
            min_total = EXCLUDED.min_total,
            voucher_code = EXCLUDED.voucher_code,
            active = EXCLUDED.active,
            priority = EXCLUDED.priority,
            created_by = EXCLUDED.created_by,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= promos.updated_at
        RETURNING
            id,
            name,
            type,
            value,
            applies_to,
            product_ids,
            categories,
            start_at::TEXT AS start_at,
            end_at::TEXT AS end_at,
            min_qty,
            min_total,
            voucher_code,
            active,
            priority,
            created_by,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.name)
    .bind(input.r#type)
    .bind(input.value)
    .bind(input.applies_to)
    .bind(input.product_ids)
    .bind(input.categories)
    .bind(input.start_at)
    .bind(input.end_at)
    .bind(input.min_qty)
    .bind(input.min_total)
    .bind(input.voucher_code)
    .bind(input.active)
    .bind(input.priority)
    .bind(input.created_by)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(promo) = upserted_promo {
        return Ok(promo);
    }

    get_promo_including_deleted(pool, promo_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_promo(pool: &PgPool, id: String) -> Result<Option<PromoDto>, sqlx::Error> {
    let deleted_promo = sqlx::query_as::<_, PromoDto>(
        r#"
        UPDATE promos
        SET
            active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            name,
            type,
            value,
            applies_to,
            product_ids,
            categories,
            start_at::TEXT AS start_at,
            end_at::TEXT AS end_at,
            min_qty,
            min_total,
            voucher_code,
            active,
            priority,
            created_by,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_promo.is_some() {
        return Ok(deleted_promo);
    }

    get_promo_including_deleted(pool, id).await
}
