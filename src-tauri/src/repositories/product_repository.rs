use crate::models::product::ProductDto;
use sqlx::PgPool;

pub async fn list_products(
    pool: &PgPool,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ProductDto>, sqlx::Error> {
    sqlx::query_as::<_, ProductDto>(
        r#"
        SELECT
            id,
            name,
            category,
            purchase_unit,
            selling_unit,
            purchase_price,
            selling_price,
            stock,
            min_stock,
            sku,
            product_type,
            is_visible_in_pos,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at,
            updated_at,
            deleted_at
        FROM products
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

pub async fn get_product(pool: &PgPool, id: String) -> Result<Option<ProductDto>, sqlx::Error> {
    sqlx::query_as::<_, ProductDto>(
        r#"
        SELECT
            id,
            name,
            category,
            purchase_unit,
            selling_unit,
            purchase_price,
            selling_price,
            stock,
            min_stock,
            sku,
            product_type,
            is_visible_in_pos,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at,
            updated_at,
            deleted_at
        FROM products
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_product_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<ProductDto>, sqlx::Error> {
    sqlx::query_as::<_, ProductDto>(
        r#"
        SELECT
            id,
            name,
            category,
            purchase_unit,
            selling_unit,
            purchase_price,
            selling_price,
            stock,
            min_stock,
            sku,
            product_type,
            is_visible_in_pos,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at,
            updated_at,
            deleted_at
        FROM products
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_product(
    pool: &PgPool,
    input: ProductDto,
    preserve_stock: bool,
) -> Result<ProductDto, sqlx::Error> {
    let product_id = input.id.clone();
    // When stock is ledger-owned, a missing remote product must start at zero.
    // Its queued stock mutations will then materialize the exact balance once.
    let insert_stock = resolve_product_insert_stock(input.stock, preserve_stock);
    let upserted_product = sqlx::query_as::<_, ProductDto>(
        r#"
        INSERT INTO products (
            id,
            name,
            category,
            purchase_unit,
            selling_unit,
            purchase_price,
            selling_price,
            stock,
            min_stock,
            sku,
            product_type,
            is_visible_in_pos,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::JSONB, $14::JSONB, $15::JSONB, $16::TIMESTAMPTZ, $17::TIMESTAMPTZ, $18::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            purchase_unit = EXCLUDED.purchase_unit,
            selling_unit = EXCLUDED.selling_unit,
            purchase_price = EXCLUDED.purchase_price,
            selling_price = EXCLUDED.selling_price,
            stock = CASE WHEN $19 THEN products.stock ELSE EXCLUDED.stock END,
            min_stock = EXCLUDED.min_stock,
            sku = EXCLUDED.sku,
            product_type = EXCLUDED.product_type,
            is_visible_in_pos = EXCLUDED.is_visible_in_pos,
            wholesale_prices = EXCLUDED.wholesale_prices,
            sellable_units = EXCLUDED.sellable_units,
            unit_mappings = EXCLUDED.unit_mappings,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= products.updated_at
        RETURNING
            id,
            name,
            category,
            purchase_unit,
            selling_unit,
            purchase_price,
            selling_price,
            stock,
            min_stock,
            sku,
            product_type,
            is_visible_in_pos,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at,
            updated_at,
            deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.name)
    .bind(input.category)
    .bind(input.purchase_unit)
    .bind(input.selling_unit)
    .bind(input.purchase_price)
    .bind(input.selling_price)
    .bind(insert_stock)
    .bind(input.min_stock)
    .bind(input.sku)
    .bind(input.product_type)
    .bind(input.is_visible_in_pos)
    .bind(input.wholesale_prices)
    .bind(input.sellable_units)
    .bind(input.unit_mappings)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .bind(preserve_stock)
    .fetch_optional(pool)
    .await?;

    if let Some(product) = upserted_product {
        return Ok(product);
    }

    get_product_including_deleted(pool, product_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

const fn resolve_product_insert_stock(stock: f64, preserve_stock: bool) -> f64 {
    if preserve_stock {
        0.0
    } else {
        stock
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_product_insert_stock;

    #[test]
    fn ledger_owned_product_insert_starts_at_zero() {
        assert_eq!(resolve_product_insert_stock(8.0, true), 0.0);
    }

    #[test]
    fn explicit_legacy_snapshot_keeps_its_stock() {
        assert_eq!(resolve_product_insert_stock(8.0, false), 8.0);
    }
}

pub async fn delete_product(pool: &PgPool, id: String) -> Result<Option<ProductDto>, sqlx::Error> {
    let deleted_product = sqlx::query_as::<_, ProductDto>(
        r#"
        UPDATE products
        SET
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            name,
            category,
            purchase_unit,
            selling_unit,
            purchase_price,
            selling_price,
            stock,
            min_stock,
            sku,
            product_type,
            is_visible_in_pos,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at,
            updated_at,
            deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_product.is_some() {
        return Ok(deleted_product);
    }

    get_product_including_deleted(pool, id).await
}
