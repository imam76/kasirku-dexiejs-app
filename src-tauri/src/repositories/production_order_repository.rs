use crate::models::production_order::{
    ProductionOrderBundleDto, ProductionOrderCostDto, ProductionOrderDto, ProductionOrderItemDto,
};
use sqlx::{PgPool, Postgres, Transaction};
use std::collections::HashMap;

macro_rules! production_order_select {
    () => {
        r#"
        SELECT
            id,
            production_number,
            status,
            finished_product_id,
            finished_product_name,
            quantity_produced,
            unit,
            material_cost,
            additional_cost,
            total_cost,
            unit_cost,
            produced_at::TEXT AS produced_at,
            posted_at::TEXT AS posted_at,
            voided_at::TEXT AS voided_at,
            void_reason,
            notes,
            created_by,
            created_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM production_orders
        "#
    };
}

macro_rules! production_order_item_select {
    () => {
        r#"
        SELECT
            id,
            production_order_id,
            material_product_id,
            material_product_name,
            sku,
            quantity_used,
            unit,
            stock_quantity_used,
            stock_unit,
            cost_per_unit,
            total_cost,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM production_order_items
        "#
    };
}

macro_rules! production_order_cost_select {
    () => {
        r#"
        SELECT
            id,
            production_order_id,
            name,
            amount,
            account_id,
            account_code,
            account_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM production_order_costs
        "#
    };
}

pub async fn list_production_order_bundles(
    pool: &PgPool,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ProductionOrderBundleDto>, sqlx::Error> {
    let limit = limit.unwrap_or(200).clamp(1, 500);
    let orders = sqlx::query_as::<_, ProductionOrderDto>(concat!(
        production_order_select!(),
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

    let order_ids = orders.iter().map(|order| order.id.clone()).collect::<Vec<_>>();
    let items = list_production_order_items_for_orders(pool, order_ids.clone()).await?;
    let costs = list_production_order_costs_for_orders(pool, order_ids).await?;

    let mut items_by_order_id = HashMap::<String, Vec<ProductionOrderItemDto>>::new();
    for item in items {
        items_by_order_id
            .entry(item.production_order_id.clone())
            .or_default()
            .push(item);
    }

    let mut costs_by_order_id = HashMap::<String, Vec<ProductionOrderCostDto>>::new();
    for cost in costs {
        costs_by_order_id
            .entry(cost.production_order_id.clone())
            .or_default()
            .push(cost);
    }

    let mut bundles = Vec::with_capacity(orders.len());
    for order in orders {
        let items = items_by_order_id.remove(&order.id).unwrap_or_default();
        let costs = costs_by_order_id.remove(&order.id).unwrap_or_default();
        bundles.push(ProductionOrderBundleDto { order, items, costs });
    }

    Ok(bundles)
}

pub async fn get_production_order_bundle(
    pool: &PgPool,
    id: String,
) -> Result<Option<ProductionOrderBundleDto>, sqlx::Error> {
    let order =
        sqlx::query_as::<_, ProductionOrderDto>(concat!(production_order_select!(), " WHERE id = $1"))
            .bind(id)
            .fetch_optional(pool)
            .await?;

    if let Some(order) = order {
        let items = list_production_order_items(pool, &order.id).await?;
        let costs = list_production_order_costs(pool, &order.id).await?;
        return Ok(Some(ProductionOrderBundleDto { order, items, costs }));
    }

    Ok(None)
}

pub async fn upsert_production_order_bundle(
    pool: &PgPool,
    input: ProductionOrderBundleDto,
) -> Result<ProductionOrderBundleDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let order_id = input.order.id.clone();

    let upserted_order = upsert_production_order(&mut tx, input.order).await?;
    if let Some(order) = upserted_order {
        replace_production_order_items(&mut tx, &order.id, input.items).await?;
        replace_production_order_costs(&mut tx, &order.id, input.costs).await?;
        let items = list_production_order_items_in_tx(&mut tx, &order.id).await?;
        let costs = list_production_order_costs_in_tx(&mut tx, &order.id).await?;
        tx.commit().await?;
        return Ok(ProductionOrderBundleDto { order, items, costs });
    }

    let order = get_production_order_in_tx(&mut tx, &order_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let items = list_production_order_items_in_tx(&mut tx, &order.id).await?;
    let costs = list_production_order_costs_in_tx(&mut tx, &order.id).await?;
    tx.commit().await?;

    Ok(ProductionOrderBundleDto { order, items, costs })
}

async fn list_production_order_items(
    pool: &PgPool,
    order_id: &str,
) -> Result<Vec<ProductionOrderItemDto>, sqlx::Error> {
    sqlx::query_as::<_, ProductionOrderItemDto>(concat!(
        production_order_item_select!(),
        " WHERE production_order_id = $1 ORDER BY material_product_name ASC, id ASC"
    ))
    .bind(order_id)
    .fetch_all(pool)
    .await
}

async fn list_production_order_costs(
    pool: &PgPool,
    order_id: &str,
) -> Result<Vec<ProductionOrderCostDto>, sqlx::Error> {
    sqlx::query_as::<_, ProductionOrderCostDto>(concat!(
        production_order_cost_select!(),
        " WHERE production_order_id = $1 ORDER BY name ASC, id ASC"
    ))
    .bind(order_id)
    .fetch_all(pool)
    .await
}

async fn list_production_order_items_for_orders(
    pool: &PgPool,
    order_ids: Vec<String>,
) -> Result<Vec<ProductionOrderItemDto>, sqlx::Error> {
    if order_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as::<_, ProductionOrderItemDto>(concat!(
        production_order_item_select!(),
        " WHERE production_order_id = ANY($1) ORDER BY production_order_id ASC, material_product_name ASC, id ASC"
    ))
    .bind(order_ids)
    .fetch_all(pool)
    .await
}

async fn list_production_order_costs_for_orders(
    pool: &PgPool,
    order_ids: Vec<String>,
) -> Result<Vec<ProductionOrderCostDto>, sqlx::Error> {
    if order_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as::<_, ProductionOrderCostDto>(concat!(
        production_order_cost_select!(),
        " WHERE production_order_id = ANY($1) ORDER BY production_order_id ASC, name ASC, id ASC"
    ))
    .bind(order_ids)
    .fetch_all(pool)
    .await
}

async fn list_production_order_items_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    order_id: &str,
) -> Result<Vec<ProductionOrderItemDto>, sqlx::Error> {
    sqlx::query_as::<_, ProductionOrderItemDto>(concat!(
        production_order_item_select!(),
        " WHERE production_order_id = $1 ORDER BY material_product_name ASC, id ASC"
    ))
    .bind(order_id)
    .fetch_all(&mut **tx)
    .await
}

async fn list_production_order_costs_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    order_id: &str,
) -> Result<Vec<ProductionOrderCostDto>, sqlx::Error> {
    sqlx::query_as::<_, ProductionOrderCostDto>(concat!(
        production_order_cost_select!(),
        " WHERE production_order_id = $1 ORDER BY name ASC, id ASC"
    ))
    .bind(order_id)
    .fetch_all(&mut **tx)
    .await
}

async fn get_production_order_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    order_id: &str,
) -> Result<Option<ProductionOrderDto>, sqlx::Error> {
    sqlx::query_as::<_, ProductionOrderDto>(concat!(production_order_select!(), " WHERE id = $1"))
        .bind(order_id)
        .fetch_optional(&mut **tx)
        .await
}

async fn upsert_production_order(
    tx: &mut Transaction<'_, Postgres>,
    input: ProductionOrderDto,
) -> Result<Option<ProductionOrderDto>, sqlx::Error> {
    sqlx::query_as::<_, ProductionOrderDto>(
        r#"
        INSERT INTO production_orders (
            id,
            production_number,
            status,
            finished_product_id,
            finished_product_name,
            quantity_produced,
            unit,
            material_cost,
            additional_cost,
            total_cost,
            unit_cost,
            produced_at,
            posted_at,
            voided_at,
            void_reason,
            notes,
            created_by,
            created_by_name,
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
            $12::TIMESTAMPTZ,
            $13::TIMESTAMPTZ,
            $14::TIMESTAMPTZ,
            $15,
            $16,
            $17,
            $18,
            $19::TIMESTAMPTZ,
            $20::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            production_number = EXCLUDED.production_number,
            status = EXCLUDED.status,
            finished_product_id = EXCLUDED.finished_product_id,
            finished_product_name = EXCLUDED.finished_product_name,
            quantity_produced = EXCLUDED.quantity_produced,
            unit = EXCLUDED.unit,
            material_cost = EXCLUDED.material_cost,
            additional_cost = EXCLUDED.additional_cost,
            total_cost = EXCLUDED.total_cost,
            unit_cost = EXCLUDED.unit_cost,
            produced_at = EXCLUDED.produced_at,
            posted_at = EXCLUDED.posted_at,
            voided_at = EXCLUDED.voided_at,
            void_reason = EXCLUDED.void_reason,
            notes = EXCLUDED.notes,
            created_by = EXCLUDED.created_by,
            created_by_name = EXCLUDED.created_by_name,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= production_orders.updated_at
        RETURNING
            id,
            production_number,
            status,
            finished_product_id,
            finished_product_name,
            quantity_produced,
            unit,
            material_cost,
            additional_cost,
            total_cost,
            unit_cost,
            produced_at::TEXT AS produced_at,
            posted_at::TEXT AS posted_at,
            voided_at::TEXT AS voided_at,
            void_reason,
            notes,
            created_by,
            created_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        "#
    )
    .bind(input.id)
    .bind(input.production_number)
    .bind(input.status)
    .bind(input.finished_product_id)
    .bind(input.finished_product_name)
    .bind(input.quantity_produced)
    .bind(input.unit)
    .bind(input.material_cost)
    .bind(input.additional_cost)
    .bind(input.total_cost)
    .bind(input.unit_cost)
    .bind(input.produced_at)
    .bind(input.posted_at)
    .bind(input.voided_at)
    .bind(input.void_reason)
    .bind(input.notes)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(&mut **tx)
    .await
}

async fn replace_production_order_items(
    tx: &mut Transaction<'_, Postgres>,
    order_id: &str,
    items: Vec<ProductionOrderItemDto>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM production_order_items WHERE production_order_id = $1")
        .bind(order_id)
        .execute(&mut **tx)
        .await?;

    for item in items {
        sqlx::query(
            r#"
            INSERT INTO production_order_items (
                id,
                production_order_id,
                material_product_id,
                material_product_name,
                sku,
                quantity_used,
                unit,
                stock_quantity_used,
                stock_unit,
                cost_per_unit,
                total_cost,
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
                $12::TIMESTAMPTZ,
                $13::TIMESTAMPTZ
            )
            "#
        )
        .bind(item.id)
        .bind(order_id)
        .bind(item.material_product_id)
        .bind(item.material_product_name)
        .bind(item.sku)
        .bind(item.quantity_used)
        .bind(item.unit)
        .bind(item.stock_quantity_used)
        .bind(item.stock_unit)
        .bind(item.cost_per_unit)
        .bind(item.total_cost)
        .bind(item.created_at)
        .bind(item.updated_at)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

async fn replace_production_order_costs(
    tx: &mut Transaction<'_, Postgres>,
    order_id: &str,
    costs: Vec<ProductionOrderCostDto>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM production_order_costs WHERE production_order_id = $1")
        .bind(order_id)
        .execute(&mut **tx)
        .await?;

    for cost in costs {
        sqlx::query(
            r#"
            INSERT INTO production_order_costs (
                id,
                production_order_id,
                name,
                amount,
                account_id,
                account_code,
                account_name,
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
                $8::TIMESTAMPTZ,
                $9::TIMESTAMPTZ
            )
            "#
        )
        .bind(cost.id)
        .bind(order_id)
        .bind(cost.name)
        .bind(cost.amount)
        .bind(cost.account_id)
        .bind(cost.account_code)
        .bind(cost.account_name)
        .bind(cost.created_at)
        .bind(cost.updated_at)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}
