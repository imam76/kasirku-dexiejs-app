use crate::models::product::ProductDto;
use sqlx::PgPool;

pub async fn list_products(pool: &PgPool) -> Result<Vec<ProductDto>, sqlx::Error> {
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
            sku,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM products
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        "#,
    )
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
            sku,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
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
            sku,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM products
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_product(pool: &PgPool, input: ProductDto) -> Result<ProductDto, sqlx::Error> {
    let product_id = input.id.clone();
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
            sku,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, $11::JSONB, $12::JSONB, $13::TIMESTAMPTZ, $14::TIMESTAMPTZ, $15::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            purchase_unit = EXCLUDED.purchase_unit,
            selling_unit = EXCLUDED.selling_unit,
            purchase_price = EXCLUDED.purchase_price,
            selling_price = EXCLUDED.selling_price,
            stock = EXCLUDED.stock,
            sku = EXCLUDED.sku,
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
            sku,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.name)
    .bind(input.category)
    .bind(input.purchase_unit)
    .bind(input.selling_unit)
    .bind(input.purchase_price)
    .bind(input.selling_price)
    .bind(input.stock)
    .bind(input.sku)
    .bind(input.wholesale_prices)
    .bind(input.sellable_units)
    .bind(input.unit_mappings)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(product) = upserted_product {
        return Ok(product);
    }

    get_product_including_deleted(pool, product_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
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
            sku,
            wholesale_prices,
            sellable_units,
            unit_mappings,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
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
