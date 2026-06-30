use crate::models::stock_opname::{StockOpnameBundleDto, StockOpnameDto, StockOpnameItemDto};
use sqlx::{PgPool, Postgres, Transaction};
use std::collections::HashMap;

macro_rules! stock_opname_select {
    () => {
        r#"
        SELECT
            id,
            opname_number,
            status,
            counted_at::TEXT AS counted_at,
            reviewed_at::TEXT AS reviewed_at,
            posted_at::TEXT AS posted_at,
            cancelled_at::TEXT AS cancelled_at,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            notes,
            created_by,
            created_by_name,
            reviewed_by,
            reviewed_by_name,
            posted_by,
            posted_by_name,
            cancelled_by,
            cancelled_by_name,
            cancel_reason,
            total_items,
            total_adjustment_in,
            total_adjustment_out,
            total_variance_value,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM stock_opnames
        "#
    };
}

macro_rules! stock_opname_item_select {
    () => {
        r#"
        SELECT
            id,
            opname_id,
            product_id,
            product_name,
            sku,
            category,
            system_quantity,
            counted_quantity,
            quantity_delta,
            unit,
            cost_per_unit,
            variance_value,
            notes,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM stock_opname_items
        "#
    };
}

pub async fn list_stock_opname_bundles(
    pool: &PgPool,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<StockOpnameBundleDto>, sqlx::Error> {
    let limit = limit.unwrap_or(200).clamp(1, 500);
    let opnames = sqlx::query_as::<_, StockOpnameDto>(concat!(
        stock_opname_select!(),
        r#"
        WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1::TIMESTAMPTZ)
        ORDER BY updated_at ASC, created_at ASC, id ASC
        LIMIT $2
        "#
    ))
    .bind(updated_after)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let opname_ids = opnames
        .iter()
        .map(|opname| opname.id.clone())
        .collect::<Vec<_>>();
    let items = list_stock_opname_items_for_opnames(pool, opname_ids).await?;
    let mut items_by_opname_id = HashMap::<String, Vec<StockOpnameItemDto>>::new();
    for item in items {
        items_by_opname_id
            .entry(item.opname_id.clone())
            .or_default()
            .push(item);
    }

    let mut bundles = Vec::with_capacity(opnames.len());
    for opname in opnames {
        let items = items_by_opname_id.remove(&opname.id).unwrap_or_default();
        bundles.push(StockOpnameBundleDto { opname, items });
    }

    Ok(bundles)
}

pub async fn get_stock_opname_bundle(
    pool: &PgPool,
    id: String,
) -> Result<Option<StockOpnameBundleDto>, sqlx::Error> {
    let opname =
        sqlx::query_as::<_, StockOpnameDto>(concat!(stock_opname_select!(), " WHERE id = $1"))
            .bind(id)
            .fetch_optional(pool)
            .await?;

    if let Some(opname) = opname {
        let items = list_stock_opname_items(pool, &opname.id).await?;
        return Ok(Some(StockOpnameBundleDto { opname, items }));
    }

    Ok(None)
}

pub async fn upsert_stock_opname_bundle(
    pool: &PgPool,
    input: StockOpnameBundleDto,
) -> Result<StockOpnameBundleDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let opname_id = input.opname.id.clone();

    let upserted_opname = upsert_stock_opname(&mut tx, input.opname).await?;
    if let Some(opname) = upserted_opname {
        replace_stock_opname_items(&mut tx, &opname.id, input.items).await?;
        let items = list_stock_opname_items_in_tx(&mut tx, &opname.id).await?;
        tx.commit().await?;
        return Ok(StockOpnameBundleDto { opname, items });
    }

    let opname = get_stock_opname_in_tx(&mut tx, &opname_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let items = list_stock_opname_items_in_tx(&mut tx, &opname.id).await?;
    tx.commit().await?;

    Ok(StockOpnameBundleDto { opname, items })
}

async fn list_stock_opname_items(
    pool: &PgPool,
    opname_id: &str,
) -> Result<Vec<StockOpnameItemDto>, sqlx::Error> {
    sqlx::query_as::<_, StockOpnameItemDto>(concat!(
        stock_opname_item_select!(),
        " WHERE opname_id = $1 ORDER BY product_name ASC, id ASC"
    ))
    .bind(opname_id)
    .fetch_all(pool)
    .await
}

async fn list_stock_opname_items_for_opnames(
    pool: &PgPool,
    opname_ids: Vec<String>,
) -> Result<Vec<StockOpnameItemDto>, sqlx::Error> {
    if opname_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as::<_, StockOpnameItemDto>(concat!(
        stock_opname_item_select!(),
        " WHERE opname_id = ANY($1) ORDER BY opname_id ASC, product_name ASC, id ASC"
    ))
    .bind(opname_ids)
    .fetch_all(pool)
    .await
}

async fn list_stock_opname_items_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    opname_id: &str,
) -> Result<Vec<StockOpnameItemDto>, sqlx::Error> {
    sqlx::query_as::<_, StockOpnameItemDto>(concat!(
        stock_opname_item_select!(),
        " WHERE opname_id = $1 ORDER BY product_name ASC, id ASC"
    ))
    .bind(opname_id)
    .fetch_all(&mut **tx)
    .await
}

async fn get_stock_opname_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    opname_id: &str,
) -> Result<Option<StockOpnameDto>, sqlx::Error> {
    sqlx::query_as::<_, StockOpnameDto>(concat!(stock_opname_select!(), " WHERE id = $1"))
        .bind(opname_id)
        .fetch_optional(&mut **tx)
        .await
}

async fn upsert_stock_opname(
    tx: &mut Transaction<'_, Postgres>,
    input: StockOpnameDto,
) -> Result<Option<StockOpnameDto>, sqlx::Error> {
    sqlx::query_as::<_, StockOpnameDto>(
        r#"
        INSERT INTO stock_opnames (
            id,
            opname_number,
            status,
            counted_at,
            reviewed_at,
            posted_at,
            cancelled_at,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            notes,
            created_by,
            created_by_name,
            reviewed_by,
            reviewed_by_name,
            posted_by,
            posted_by_name,
            cancelled_by,
            cancelled_by_name,
            cancel_reason,
            total_items,
            total_adjustment_in,
            total_adjustment_out,
            total_variance_value,
            created_at,
            updated_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4::TIMESTAMPTZ,
            $5::TIMESTAMPTZ,
            $6::TIMESTAMPTZ,
            $7::TIMESTAMPTZ,
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
            $21,
            $22,
            $23,
            $24,
            $25::TIMESTAMPTZ,
            $26::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            opname_number = EXCLUDED.opname_number,
            status = EXCLUDED.status,
            counted_at = EXCLUDED.counted_at,
            reviewed_at = EXCLUDED.reviewed_at,
            posted_at = EXCLUDED.posted_at,
            cancelled_at = EXCLUDED.cancelled_at,
            warehouse_id = EXCLUDED.warehouse_id,
            warehouse_code = EXCLUDED.warehouse_code,
            warehouse_name = EXCLUDED.warehouse_name,
            notes = EXCLUDED.notes,
            created_by = EXCLUDED.created_by,
            created_by_name = EXCLUDED.created_by_name,
            reviewed_by = EXCLUDED.reviewed_by,
            reviewed_by_name = EXCLUDED.reviewed_by_name,
            posted_by = EXCLUDED.posted_by,
            posted_by_name = EXCLUDED.posted_by_name,
            cancelled_by = EXCLUDED.cancelled_by,
            cancelled_by_name = EXCLUDED.cancelled_by_name,
            cancel_reason = EXCLUDED.cancel_reason,
            total_items = EXCLUDED.total_items,
            total_adjustment_in = EXCLUDED.total_adjustment_in,
            total_adjustment_out = EXCLUDED.total_adjustment_out,
            total_variance_value = EXCLUDED.total_variance_value,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= stock_opnames.updated_at
        RETURNING
            id,
            opname_number,
            status,
            counted_at::TEXT AS counted_at,
            reviewed_at::TEXT AS reviewed_at,
            posted_at::TEXT AS posted_at,
            cancelled_at::TEXT AS cancelled_at,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            notes,
            created_by,
            created_by_name,
            reviewed_by,
            reviewed_by_name,
            posted_by,
            posted_by_name,
            cancelled_by,
            cancelled_by_name,
            cancel_reason,
            total_items,
            total_adjustment_in,
            total_adjustment_out,
            total_variance_value,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.opname_number)
    .bind(input.status)
    .bind(input.counted_at)
    .bind(input.reviewed_at)
    .bind(input.posted_at)
    .bind(input.cancelled_at)
    .bind(input.warehouse_id)
    .bind(input.warehouse_code)
    .bind(input.warehouse_name)
    .bind(input.notes)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.reviewed_by)
    .bind(input.reviewed_by_name)
    .bind(input.posted_by)
    .bind(input.posted_by_name)
    .bind(input.cancelled_by)
    .bind(input.cancelled_by_name)
    .bind(input.cancel_reason)
    .bind(input.total_items)
    .bind(input.total_adjustment_in)
    .bind(input.total_adjustment_out)
    .bind(input.total_variance_value)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(&mut **tx)
    .await
}

async fn replace_stock_opname_items(
    tx: &mut Transaction<'_, Postgres>,
    opname_id: &str,
    items: Vec<StockOpnameItemDto>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM stock_opname_items WHERE opname_id = $1")
        .bind(opname_id)
        .execute(&mut **tx)
        .await?;

    for item in items {
        sqlx::query(
            r#"
            INSERT INTO stock_opname_items (
                id,
                opname_id,
                product_id,
                product_name,
                sku,
                category,
                system_quantity,
                counted_quantity,
                quantity_delta,
                unit,
                cost_per_unit,
                variance_value,
                notes,
                created_at,
                updated_at
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
                $14::TIMESTAMPTZ,
                $15::TIMESTAMPTZ
            )
            "#,
        )
        .bind(item.id)
        .bind(opname_id)
        .bind(item.product_id)
        .bind(item.product_name)
        .bind(item.sku)
        .bind(item.category)
        .bind(item.system_quantity)
        .bind(item.counted_quantity)
        .bind(item.quantity_delta)
        .bind(item.unit)
        .bind(item.cost_per_unit)
        .bind(item.variance_value)
        .bind(item.notes)
        .bind(item.created_at)
        .bind(item.updated_at)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}
