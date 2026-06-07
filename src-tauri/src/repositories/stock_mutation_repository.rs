use crate::models::stock_mutation::StockMutationDto;
use sqlx::PgPool;

pub async fn list_stock_mutations(pool: &PgPool) -> Result<Vec<StockMutationDto>, sqlx::Error> {
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
        ORDER BY occurred_at DESC, created_at DESC
        "#,
    )
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
    let mutation_id = input.id.clone();
    let product_id = input.product_id.clone();
    let quantity_delta = input.quantity_delta;
    let occurred_at = input.occurred_at.clone();

    let inserted_mutation = sqlx::query_as::<_, StockMutationDto>(
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
    .fetch_optional(&mut *tx)
    .await?;

    if let Some(inserted_mutation) = inserted_mutation {
        let updated_product_count = sqlx::query(
            r#"
            UPDATE products
            SET
                stock = stock + $1,
                updated_at = GREATEST(updated_at, $2::TIMESTAMPTZ)
            WHERE id = $3
            "#,
        )
        .bind(quantity_delta)
        .bind(occurred_at)
        .bind(product_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();

        if updated_product_count == 0 {
            return Err(sqlx::Error::RowNotFound);
        }

        tx.commit().await?;
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
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(sqlx::Error::RowNotFound)?;

    tx.commit().await?;
    Ok(existing_mutation)
}
