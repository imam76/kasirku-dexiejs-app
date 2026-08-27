use crate::models::pos_stock_discrepancy::PosStockDiscrepancyDto;
use sqlx::PgPool;

pub async fn list(
    pool: &PgPool,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<PosStockDiscrepancyDto>, sqlx::Error> {
    sqlx::query_as::<_, PosStockDiscrepancyDto>(
        r#"
        SELECT id, transaction_id, transaction_number, transaction_item_id,
            cashier_session_id, restaurant_session_id, product_id, product_name, sku,
            system_quantity_snapshot, requested_quantity, shortage_quantity, stock_unit,
            observation, cashier_note, cashier_user_id, cashier_user_name, device_id,
            device_name, status, reviewed_by, reviewed_by_name,
            reviewed_at, investigation_cause, investigation_note,
            stock_opname_id, created_at, updated_at
        FROM pos_stock_discrepancies
        WHERE ($1::TIMESTAMPTZ IS NULL OR (updated_at, id) > ($1::TIMESTAMPTZ, COALESCE($2::TEXT, '')))
        ORDER BY updated_at, id LIMIT $3
    "#,
    )
    .bind(updated_after)
    .bind(cursor_id)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

pub async fn get(pool: &PgPool, id: String) -> Result<Option<PosStockDiscrepancyDto>, sqlx::Error> {
    sqlx::query_as::<_, PosStockDiscrepancyDto>(
        r#"
        SELECT id, transaction_id, transaction_number, transaction_item_id,
            cashier_session_id, restaurant_session_id, product_id, product_name, sku,
            system_quantity_snapshot, requested_quantity, shortage_quantity, stock_unit,
            observation, cashier_note, cashier_user_id, cashier_user_name, device_id,
            device_name, status, reviewed_by, reviewed_by_name,
            reviewed_at, investigation_cause, investigation_note,
            stock_opname_id, created_at, updated_at
        FROM pos_stock_discrepancies WHERE id = $1
    "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert(
    pool: &PgPool,
    input: PosStockDiscrepancyDto,
) -> Result<PosStockDiscrepancyDto, sqlx::Error> {
    if input.observation != "PHYSICAL_ITEM_PRESENT" || input.shortage_quantity <= 0.0 {
        return Err(sqlx::Error::Protocol(
            "Kasus selisih stok POS tidak valid.".into(),
        ));
    }
    if !matches!(
        input.status.as_str(),
        "PENDING_REVIEW" | "REVIEWED" | "NEEDS_INVESTIGATION"
    ) {
        return Err(sqlx::Error::Protocol(
            "Status kasus selisih stok POS tidak valid.".into(),
        ));
    }

    sqlx::query_as::<_, PosStockDiscrepancyDto>(
        r#"
        INSERT INTO pos_stock_discrepancies (
            id, transaction_id, transaction_number, transaction_item_id,
            cashier_session_id, restaurant_session_id, product_id, product_name, sku,
            system_quantity_snapshot, requested_quantity, shortage_quantity, stock_unit,
            observation, cashier_note, cashier_user_id, cashier_user_name, device_id,
            device_name, status, reviewed_by, reviewed_by_name, reviewed_at,
            investigation_cause, investigation_note, stock_opname_id, created_at, updated_at
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
            $19,$20,$21,$22,$23::TIMESTAMPTZ,$24,$25,$26,$27::TIMESTAMPTZ,$28::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            reviewed_by = EXCLUDED.reviewed_by,
            reviewed_by_name = EXCLUDED.reviewed_by_name,
            reviewed_at = EXCLUDED.reviewed_at,
            investigation_cause = EXCLUDED.investigation_cause,
            investigation_note = EXCLUDED.investigation_note,
            stock_opname_id = EXCLUDED.stock_opname_id,
            updated_at = GREATEST(pos_stock_discrepancies.updated_at, EXCLUDED.updated_at)
        RETURNING id, transaction_id, transaction_number, transaction_item_id,
            cashier_session_id, restaurant_session_id, product_id, product_name, sku,
            system_quantity_snapshot, requested_quantity, shortage_quantity, stock_unit,
            observation, cashier_note, cashier_user_id, cashier_user_name, device_id,
            device_name, status, reviewed_by, reviewed_by_name,
            reviewed_at, investigation_cause, investigation_note,
            stock_opname_id, created_at, updated_at
    "#,
    )
    .bind(input.id)
    .bind(input.transaction_id)
    .bind(input.transaction_number)
    .bind(input.transaction_item_id)
    .bind(input.cashier_session_id)
    .bind(input.restaurant_session_id)
    .bind(input.product_id)
    .bind(input.product_name)
    .bind(input.sku)
    .bind(input.system_quantity_snapshot)
    .bind(input.requested_quantity)
    .bind(input.shortage_quantity)
    .bind(input.stock_unit)
    .bind(input.observation)
    .bind(input.cashier_note)
    .bind(input.cashier_user_id)
    .bind(input.cashier_user_name)
    .bind(input.device_id)
    .bind(input.device_name)
    .bind(input.status)
    .bind(input.reviewed_by)
    .bind(input.reviewed_by_name)
    .bind(input.reviewed_at)
    .bind(input.investigation_cause)
    .bind(input.investigation_note)
    .bind(input.stock_opname_id)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_one(pool)
    .await
}
