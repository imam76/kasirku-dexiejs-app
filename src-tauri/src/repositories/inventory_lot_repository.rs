use crate::models::inventory_lot::{InventoryLotConsumptionDto, InventoryLotDto};
use sqlx::{PgPool, Postgres, Transaction};

macro_rules! inventory_lot_columns {
    () => {
        r#"
            id,
            product_id,
            product_name,
            sku,
            source_type,
            source_id,
            source_line_id,
            quantity_received,
            quantity_remaining,
            cost_per_unit,
            cost_status,
            estimate_source,
            estimated_cost_per_unit,
            final_cost_per_unit,
            cost_finalized_at,
            cost_reconciliation_id,
            received_at,
            created_at,
            updated_at
        "#
    };
}

macro_rules! inventory_lot_consumption_columns {
    () => {
        r#"
            id,
            lot_id,
            product_id,
            product_name,
            source_type,
            source_id,
            source_line_id,
            quantity,
            cost_per_unit_at_consumption,
            cost_status_at_consumption,
            created_at
        "#
    };
}

/// `received_at`/`created_at`/`updated_at` are plain TEXT columns (not TIMESTAMPTZ) in this
/// table's original schema (migration 0018). The app always writes
/// `Date.prototype.toISOString()` values, which are fixed-width and lexicographically sortable,
/// so a plain text comparison gives the same ordering as a timestamp comparison without a cast.
pub async fn list_inventory_lots(
    pool: &PgPool,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<InventoryLotDto>, sqlx::Error> {
    sqlx::query_as::<_, InventoryLotDto>(concat!(
        "SELECT ",
        inventory_lot_columns!(),
        " FROM inventory_lots
          WHERE ($1::TEXT IS NULL OR updated_at > $1)
          ORDER BY updated_at, id
          LIMIT $2"
    ))
    .bind(updated_after)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

/// Creates a lot (idempotent by id) or reapplies a later cost-reconciliation update
/// (purchaseCostReconciliationService.ts finalizes estimated costs into final costs after a
/// purchase closes). `quantity_remaining`/`quantity_received` are intentionally excluded from
/// the UPDATE branch - they must only ever move through
/// `upsert_inventory_lot_consumption`'s atomic decrement below, never overwritten by a
/// last-write-wins upsert, or two devices consuming the same lot concurrently could clobber
/// each other's decrement.
pub async fn upsert_inventory_lot(
    pool: &PgPool,
    input: InventoryLotDto,
) -> Result<InventoryLotDto, sqlx::Error> {
    let lot_id = input.id.clone();
    let upserted = sqlx::query_as::<_, InventoryLotDto>(concat!(
        r#"
        INSERT INTO inventory_lots (
            id, product_id, product_name, sku, source_type, source_id, source_line_id,
            quantity_received, quantity_remaining, cost_per_unit, cost_status, estimate_source,
            estimated_cost_per_unit, final_cost_per_unit, cost_finalized_at,
            cost_reconciliation_id, received_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO UPDATE SET
            cost_status = EXCLUDED.cost_status,
            estimate_source = EXCLUDED.estimate_source,
            estimated_cost_per_unit = EXCLUDED.estimated_cost_per_unit,
            final_cost_per_unit = EXCLUDED.final_cost_per_unit,
            cost_per_unit = EXCLUDED.cost_per_unit,
            cost_finalized_at = EXCLUDED.cost_finalized_at,
            cost_reconciliation_id = EXCLUDED.cost_reconciliation_id,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= inventory_lots.updated_at
        RETURNING
        "#,
        inventory_lot_columns!()
    ))
    .bind(input.id)
    .bind(input.product_id)
    .bind(input.product_name)
    .bind(input.sku)
    .bind(input.source_type)
    .bind(input.source_id)
    .bind(input.source_line_id)
    .bind(input.quantity_received)
    .bind(input.quantity_remaining)
    .bind(input.cost_per_unit)
    .bind(input.cost_status)
    .bind(input.estimate_source)
    .bind(input.estimated_cost_per_unit)
    .bind(input.final_cost_per_unit)
    .bind(input.cost_finalized_at)
    .bind(input.cost_reconciliation_id)
    .bind(input.received_at)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(pool)
    .await?;

    if let Some(lot) = upserted {
        return Ok(lot);
    }

    sqlx::query_as::<_, InventoryLotDto>(concat!(
        "SELECT ",
        inventory_lot_columns!(),
        " FROM inventory_lots WHERE id = $1"
    ))
    .bind(lot_id)
    .fetch_optional(pool)
    .await?
    .ok_or(sqlx::Error::RowNotFound)
}

/// Consumptions are append-only (mirrors stock_mutations): rows are inserted once and never
/// updated, so `created_at` is the cursor column, same rationale as
/// stock_mutation_repository::list_stock_mutations.
pub async fn list_inventory_lot_consumptions(
    pool: &PgPool,
    created_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<InventoryLotConsumptionDto>, sqlx::Error> {
    sqlx::query_as::<_, InventoryLotConsumptionDto>(concat!(
        "SELECT ",
        inventory_lot_consumption_columns!(),
        " FROM inventory_lot_consumptions
          WHERE ($1::TEXT IS NULL OR created_at > $1)
          ORDER BY created_at, id
          LIMIT $2"
    ))
    .bind(created_after)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

pub async fn upsert_inventory_lot_consumption(
    pool: &PgPool,
    input: InventoryLotConsumptionDto,
) -> Result<InventoryLotConsumptionDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let result = upsert_inventory_lot_consumption_in_tx(&mut tx, input).await?;
    tx.commit().await?;
    Ok(result)
}

/// Idempotency-check-then-atomic-decrement, the same shape as
/// stock_mutation_repository::upsert_stock_mutation_in_tx: insert the immutable consumption
/// event once, then apply its quantity as an additive decrement on the lot so concurrent
/// consumptions from different devices sum correctly instead of one clobbering the other.
/// Not clamped to zero - this is an offline-first system, and a lot can legitimately go
/// negative if two devices both consumed from it before either saw the other's change. That is
/// an accepted trade-off of the architecture, not a bug to guard against here.
async fn upsert_inventory_lot_consumption_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    input: InventoryLotConsumptionDto,
) -> Result<InventoryLotConsumptionDto, sqlx::Error> {
    let consumption_id = input.id.clone();
    let lot_id = input.lot_id.clone();
    let quantity = input.quantity;
    let occurred_at = input.created_at.clone();

    let already_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM inventory_lot_consumptions WHERE id = $1)",
    )
    .bind(&consumption_id)
    .fetch_one(&mut **tx)
    .await?;

    if already_exists {
        return sqlx::query_as::<_, InventoryLotConsumptionDto>(concat!(
            "SELECT ",
            inventory_lot_consumption_columns!(),
            " FROM inventory_lot_consumptions WHERE id = $1"
        ))
        .bind(consumption_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(sqlx::Error::RowNotFound);
    }

    let inserted = sqlx::query_as::<_, InventoryLotConsumptionDto>(concat!(
        r#"
        INSERT INTO inventory_lot_consumptions (
            id, lot_id, product_id, product_name, source_type, source_id, source_line_id,
            quantity, cost_per_unit_at_consumption, cost_status_at_consumption, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING
        "#,
        inventory_lot_consumption_columns!()
    ))
    .bind(input.id)
    .bind(&lot_id)
    .bind(input.product_id)
    .bind(input.product_name)
    .bind(input.source_type)
    .bind(input.source_id)
    .bind(input.source_line_id)
    .bind(quantity)
    .bind(input.cost_per_unit_at_consumption)
    .bind(input.cost_status_at_consumption)
    .bind(&occurred_at)
    .fetch_one(&mut **tx)
    .await?;

    let updated_rows = sqlx::query(
        r#"
        UPDATE inventory_lots
        SET
            quantity_remaining = quantity_remaining - $1,
            updated_at = GREATEST(updated_at, $2)
        WHERE id = $3
        "#,
    )
    .bind(quantity)
    .bind(&occurred_at)
    .bind(&lot_id)
    .execute(&mut **tx)
    .await?
    .rows_affected();

    if updated_rows == 0 {
        return Err(sqlx::Error::RowNotFound);
    }

    Ok(inserted)
}
