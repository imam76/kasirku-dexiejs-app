use crate::models::warehouse::WarehouseDto;
use sqlx::PgPool;

pub async fn list_warehouses(pool: &PgPool) -> Result<Vec<WarehouseDto>, sqlx::Error> {
    sqlx::query_as::<_, WarehouseDto>(
        r#"
        SELECT
            id,
            code,
            name,
            address,
            phone,
            notes,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM warehouses
        WHERE deleted_at IS NULL
        ORDER BY name ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_warehouse(pool: &PgPool, id: String) -> Result<Option<WarehouseDto>, sqlx::Error> {
    sqlx::query_as::<_, WarehouseDto>(
        r#"
        SELECT
            id,
            code,
            name,
            address,
            phone,
            notes,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM warehouses
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_warehouse_including_deleted(
    pool: &PgPool,
    id: String,
) -> Result<Option<WarehouseDto>, sqlx::Error> {
    sqlx::query_as::<_, WarehouseDto>(
        r#"
        SELECT
            id,
            code,
            name,
            address,
            phone,
            notes,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM warehouses
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_warehouse(
    pool: &PgPool,
    input: WarehouseDto,
) -> Result<WarehouseDto, sqlx::Error> {
    let warehouse_id = input.id.clone();
    let upserted_warehouse = sqlx::query_as::<_, WarehouseDto>(
        r#"
        INSERT INTO warehouses (
            id,
            code,
            name,
            address,
            phone,
            notes,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::TIMESTAMPTZ, $9::TIMESTAMPTZ, $10::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            address = EXCLUDED.address,
            phone = EXCLUDED.phone,
            notes = EXCLUDED.notes,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.updated_at >= warehouses.updated_at
        RETURNING
            id,
            code,
            name,
            address,
            phone,
            notes,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.code)
    .bind(input.name)
    .bind(input.address)
    .bind(input.phone)
    .bind(input.notes)
    .bind(input.is_active)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(warehouse) = upserted_warehouse {
        return Ok(warehouse);
    }

    get_warehouse_including_deleted(pool, warehouse_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn delete_warehouse(
    pool: &PgPool,
    id: String,
) -> Result<Option<WarehouseDto>, sqlx::Error> {
    let deleted_warehouse = sqlx::query_as::<_, WarehouseDto>(
        r#"
        UPDATE warehouses
        SET
            is_active = FALSE,
            updated_at = NOW(),
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING
            id,
            code,
            name,
            address,
            phone,
            notes,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(id.clone())
    .fetch_optional(pool)
    .await?;

    if deleted_warehouse.is_some() {
        return Ok(deleted_warehouse);
    }

    get_warehouse_including_deleted(pool, id).await
}
