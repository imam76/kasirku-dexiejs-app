use crate::models::stock_mutation::StockMutationDto;
use sqlx::{PgPool, Postgres, Transaction};

/// Delta fetch for the stock_mutations ledger. Unlike other entities this cursors on
/// `created_at`, not `updated_at` - the table is append-only (rows are inserted once via
/// `ON CONFLICT DO NOTHING` in `upsert_stock_mutation_in_tx` and never updated), so `created_at`
/// is the only monotonic column available.
pub async fn list_stock_mutations(
    pool: &PgPool,
    created_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<StockMutationDto>, sqlx::Error> {
    sqlx::query_as::<_, StockMutationDto>(
        r#"
        SELECT
            id,
            product_id,
            product_name,
            sku,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            source_type,
            source_id,
            source_number,
            source_line_id,
            quantity_delta,
            unit,
            stock_unit,
            source_quantity,
            source_unit,
            reason,
            actor_user_id,
            actor_user_name,
            occurred_at::TEXT AS occurred_at,
            created_at::TEXT AS created_at
        FROM stock_mutations
        WHERE ($1::TIMESTAMPTZ IS NULL OR created_at > $1::TIMESTAMPTZ)
        ORDER BY created_at, id
        LIMIT $2
        "#,
    )
    .bind(created_after)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

pub async fn get_stock_mutation(
    pool: &PgPool,
    id: String,
) -> Result<Option<StockMutationDto>, sqlx::Error> {
    sqlx::query_as::<_, StockMutationDto>(
        r#"
        SELECT
            id,
            product_id,
            product_name,
            sku,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            source_type,
            source_id,
            source_number,
            source_line_id,
            quantity_delta,
            unit,
            stock_unit,
            source_quantity,
            source_unit,
            reason,
            actor_user_id,
            actor_user_name,
            occurred_at::TEXT AS occurred_at,
            created_at::TEXT AS created_at
        FROM stock_mutations
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_stock_mutation(
    pool: &PgPool,
    input: StockMutationDto,
) -> Result<StockMutationDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let result = upsert_stock_mutation_in_tx(&mut tx, input).await?;
    tx.commit().await?;
    Ok(result)
}

pub(crate) async fn upsert_stock_mutation_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    input: StockMutationDto,
) -> Result<StockMutationDto, sqlx::Error> {
    if input.source_type == "OPENING_BALANCE"
        && !input
            .source_quantity
            .is_some_and(|quantity| quantity.is_finite() && quantity >= 0.0)
    {
        return Err(sqlx::Error::Protocol(
            "Mutasi OPENING_BALANCE wajib memiliki source_quantity non-negatif.".into(),
        ));
    }

    let expected_input = input.clone();
    let mutation_id = input.id.clone();
    let product_id = input.product_id.clone();
    let source_type = input.source_type.clone();
    let quantity_delta = input.quantity_delta;
    let source_quantity = input.source_quantity;
    let occurred_at = input.occurred_at.clone();

    let locked_product_id =
        sqlx::query_scalar::<_, String>("SELECT id FROM products WHERE id = $1 FOR UPDATE")
            .bind(&product_id)
            .fetch_optional(&mut **tx)
            .await?;
    if locked_product_id.is_none() {
        return Err(sqlx::Error::RowNotFound);
    }

    let mutation_already_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM stock_mutations WHERE id = $1)",
    )
    .bind(&mutation_id)
    .fetch_one(&mut **tx)
    .await?;

    if !mutation_already_exists && source_type == "OPENING_BALANCE" {
        let has_post_cutoff_mutation = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM stock_mutations
                WHERE product_id = $1
                  AND occurred_at > $2::TIMESTAMPTZ
            )
            "#,
        )
        .bind(&product_id)
        .bind(&occurred_at)
        .fetch_one(&mut **tx)
        .await?;
        if has_post_cutoff_mutation {
            return Err(sqlx::Error::Protocol(
                "Saldo awal tidak dapat diterapkan karena sudah ada mutasi stok setelah cutoff."
                    .into(),
            ));
        }
    }

    if !mutation_already_exists && source_type != "OPENING_BALANCE" {
        let has_newer_opening_snapshot = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM stock_mutations
                WHERE product_id = $1
                  AND source_type = 'OPENING_BALANCE'
                  AND occurred_at >= $2::TIMESTAMPTZ
            )
            "#,
        )
        .bind(&product_id)
        .bind(&occurred_at)
        .fetch_one(&mut **tx)
        .await?;
        if has_newer_opening_snapshot {
            return Err(sqlx::Error::Protocol(
                "Mutasi stok bertanggal sebelum cutoff tidak dapat diterapkan setelah saldo awal."
                    .into(),
            ));
        }
    }

    let inserted_mutation = if mutation_already_exists {
        None
    } else {
        sqlx::query_as::<_, StockMutationDto>(
            r#"
        INSERT INTO stock_mutations (
            id,
            product_id,
            product_name,
            sku,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            source_type,
            source_id,
            source_number,
            source_line_id,
            quantity_delta,
            unit,
            stock_unit,
            source_quantity,
            source_unit,
            reason,
            actor_user_id,
            actor_user_name,
            occurred_at,
            created_at
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
            $20::TIMESTAMPTZ,
            $21::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING
            id,
            product_id,
            product_name,
            sku,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            source_type,
            source_id,
            source_number,
            source_line_id,
            quantity_delta,
            unit,
            stock_unit,
            source_quantity,
            source_unit,
            reason,
            actor_user_id,
            actor_user_name,
            occurred_at::TEXT AS occurred_at,
            created_at::TEXT AS created_at
        "#,
        )
        .bind(input.id)
        .bind(input.product_id)
        .bind(input.product_name)
        .bind(input.sku)
        .bind(input.warehouse_id)
        .bind(input.warehouse_code)
        .bind(input.warehouse_name)
        .bind(input.source_type)
        .bind(input.source_id)
        .bind(input.source_number)
        .bind(input.source_line_id)
        .bind(input.quantity_delta)
        .bind(input.unit)
        .bind(input.stock_unit)
        .bind(input.source_quantity)
        .bind(input.source_unit)
        .bind(input.reason)
        .bind(input.actor_user_id)
        .bind(input.actor_user_name)
        .bind(input.occurred_at)
        .bind(input.created_at)
        .fetch_optional(&mut **tx)
        .await?
    };

    if let Some(inserted_mutation) = inserted_mutation {
        let updated_product_count = sqlx::query(
            r#"
            UPDATE products
            SET
                stock = CASE
                    WHEN $1 = 'OPENING_BALANCE' THEN COALESCE($2, stock + $3)
                    ELSE stock + $3
                END,
                updated_at = GREATEST(updated_at, $4::TIMESTAMPTZ)
            WHERE id = $5
            "#,
        )
        .bind(source_type)
        .bind(source_quantity)
        .bind(quantity_delta)
        .bind(occurred_at)
        .bind(product_id)
        .execute(&mut **tx)
        .await?
        .rows_affected();

        if updated_product_count == 0 {
            return Err(sqlx::Error::RowNotFound);
        }

        return Ok(inserted_mutation);
    }

    let existing_mutation = sqlx::query_as::<_, StockMutationDto>(
        r#"
        SELECT
            id,
            product_id,
            product_name,
            sku,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            source_type,
            source_id,
            source_number,
            source_line_id,
            quantity_delta,
            unit,
            stock_unit,
            source_quantity,
            source_unit,
            reason,
            actor_user_id,
            actor_user_name,
            occurred_at::TEXT AS occurred_at,
            created_at::TEXT AS created_at
        FROM stock_mutations
        WHERE id = $1
        "#,
    )
    .bind(mutation_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(sqlx::Error::RowNotFound)?;

    let same_source_quantity = match (
        existing_mutation.source_quantity,
        expected_input.source_quantity,
    ) {
        (Some(existing), Some(expected)) => (existing - expected).abs() <= f64::EPSILON,
        (None, None) => true,
        _ => false,
    };
    let matches_idempotent_payload = existing_mutation.product_id == expected_input.product_id
        && existing_mutation.source_type == expected_input.source_type
        && existing_mutation.source_id == expected_input.source_id
        && existing_mutation.source_line_id == expected_input.source_line_id
        && (expected_input.source_type == "OPENING_BALANCE"
            || (existing_mutation.quantity_delta - expected_input.quantity_delta).abs()
                <= f64::EPSILON)
        && same_source_quantity
        && existing_mutation.stock_unit == expected_input.stock_unit;
    if !matches_idempotent_payload {
        return Err(sqlx::Error::Protocol(
            "ID mutasi stok sudah dipakai dengan payload yang berbeda.".into(),
        ));
    }

    Ok(existing_mutation)
}
