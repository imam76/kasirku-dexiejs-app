use crate::models::purchase_cost_reconciliation::{
    PurchaseCostReconciliationBundleDto, PurchaseCostReconciliationDto,
    PurchaseCostReconciliationItemDto,
};
use sqlx::{PgPool, Postgres, Transaction};

macro_rules! reconciliation_select {
    () => {
        r#"
        SELECT
            id,
            purchase_document_id,
            purchase_document_number,
            supplier_invoice_number,
            supplier_invoice_date,
            additional_cost_treatment,
            additional_cost_amount,
            supplier_discount_amount,
            supplier_tax_amount,
            total_estimated_cost,
            total_final_cost,
            total_variance_amount,
            sold_cost_variance_amount,
            remaining_stock_variance_amount,
            notes,
            created_by,
            created_by_name,
            created_at::TEXT AS created_at
        FROM purchase_cost_reconciliations
        "#
    };
}

macro_rules! reconciliation_item_select {
    () => {
        r#"
        SELECT
            id,
            reconciliation_id,
            purchase_document_item_id,
            product_id,
            product_name,
            received_quantity,
            invoiced_quantity,
            quantity_variance,
            sold_quantity_at_reconciliation,
            remaining_quantity_at_reconciliation,
            estimated_price,
            final_price,
            additional_cost_allocation,
            supplier_discount_allocation,
            supplier_tax_allocation,
            final_landed_cost_per_unit,
            variance_per_unit,
            sold_cost_variance_amount,
            remaining_stock_variance_amount,
            created_at::TEXT AS created_at
        FROM purchase_cost_reconciliation_items
        "#
    };
}

/// Delta fetch cursors on `created_at`, not `updated_at` - both tables are append-only (rows are
/// inserted once when a purchase receipt's HPP is finalized in
/// purchaseCostReconciliationService.ts and never updated/deleted afterward), same as
/// stock_mutation_repository.rs.
pub async fn list_purchase_cost_reconciliation_bundles(
    pool: &PgPool,
    created_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<PurchaseCostReconciliationBundleDto>, sqlx::Error> {
    let reconciliations = sqlx::query_as::<_, PurchaseCostReconciliationDto>(concat!(
        reconciliation_select!(),
        " WHERE ($1::TIMESTAMPTZ IS NULL OR created_at > $1::TIMESTAMPTZ)
          ORDER BY created_at, id
          LIMIT $2"
    ))
    .bind(created_after)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await?;

    let mut bundles = Vec::with_capacity(reconciliations.len());
    for reconciliation in reconciliations {
        let items = list_purchase_cost_reconciliation_items(pool, &reconciliation.id).await?;
        bundles.push(PurchaseCostReconciliationBundleDto {
            reconciliation,
            items,
        });
    }

    Ok(bundles)
}

pub async fn get_purchase_cost_reconciliation_bundle(
    pool: &PgPool,
    id: String,
) -> Result<Option<PurchaseCostReconciliationBundleDto>, sqlx::Error> {
    let reconciliation = sqlx::query_as::<_, PurchaseCostReconciliationDto>(concat!(
        reconciliation_select!(),
        " WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;

    if let Some(reconciliation) = reconciliation {
        let items = list_purchase_cost_reconciliation_items(pool, &reconciliation.id).await?;
        return Ok(Some(PurchaseCostReconciliationBundleDto {
            reconciliation,
            items,
        }));
    }

    Ok(None)
}

/// Both tables are insert-only (see module doc comment above), so the upsert is a plain
/// `ON CONFLICT DO NOTHING` for the reconciliation row and each item row - no UPDATE branch is
/// needed since a row's contents never change after creation, unlike
/// `upsert_purchase_document_bundle` which handles genuine edits.
pub async fn upsert_purchase_cost_reconciliation_bundle(
    pool: &PgPool,
    input: PurchaseCostReconciliationBundleDto,
) -> Result<PurchaseCostReconciliationBundleDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let reconciliation_id = input.reconciliation.id.clone();

    insert_purchase_cost_reconciliation(&mut tx, input.reconciliation).await?;
    for item in input.items {
        insert_purchase_cost_reconciliation_item(&mut tx, item).await?;
    }

    let reconciliation = get_purchase_cost_reconciliation_in_tx(&mut tx, &reconciliation_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let items =
        list_purchase_cost_reconciliation_items_in_tx(&mut tx, &reconciliation_id).await?;
    tx.commit().await?;

    Ok(PurchaseCostReconciliationBundleDto {
        reconciliation,
        items,
    })
}

async fn list_purchase_cost_reconciliation_items(
    pool: &PgPool,
    reconciliation_id: &str,
) -> Result<Vec<PurchaseCostReconciliationItemDto>, sqlx::Error> {
    sqlx::query_as::<_, PurchaseCostReconciliationItemDto>(concat!(
        reconciliation_item_select!(),
        " WHERE reconciliation_id = $1 ORDER BY created_at ASC, id ASC"
    ))
    .bind(reconciliation_id)
    .fetch_all(pool)
    .await
}

async fn list_purchase_cost_reconciliation_items_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    reconciliation_id: &str,
) -> Result<Vec<PurchaseCostReconciliationItemDto>, sqlx::Error> {
    sqlx::query_as::<_, PurchaseCostReconciliationItemDto>(concat!(
        reconciliation_item_select!(),
        " WHERE reconciliation_id = $1 ORDER BY created_at ASC, id ASC"
    ))
    .bind(reconciliation_id)
    .fetch_all(&mut **tx)
    .await
}

async fn get_purchase_cost_reconciliation_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    id: &str,
) -> Result<Option<PurchaseCostReconciliationDto>, sqlx::Error> {
    sqlx::query_as::<_, PurchaseCostReconciliationDto>(concat!(
        reconciliation_select!(),
        " WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(&mut **tx)
    .await
}

async fn insert_purchase_cost_reconciliation(
    tx: &mut Transaction<'_, Postgres>,
    input: PurchaseCostReconciliationDto,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO purchase_cost_reconciliations (
            id,
            purchase_document_id,
            purchase_document_number,
            supplier_invoice_number,
            supplier_invoice_date,
            additional_cost_treatment,
            additional_cost_amount,
            supplier_discount_amount,
            supplier_tax_amount,
            total_estimated_cost,
            total_final_cost,
            total_variance_amount,
            sold_cost_variance_amount,
            remaining_stock_variance_amount,
            notes,
            created_by,
            created_by_name,
            created_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(input.id)
    .bind(input.purchase_document_id)
    .bind(input.purchase_document_number)
    .bind(input.supplier_invoice_number)
    .bind(input.supplier_invoice_date)
    .bind(input.additional_cost_treatment)
    .bind(input.additional_cost_amount)
    .bind(input.supplier_discount_amount)
    .bind(input.supplier_tax_amount)
    .bind(input.total_estimated_cost)
    .bind(input.total_final_cost)
    .bind(input.total_variance_amount)
    .bind(input.sold_cost_variance_amount)
    .bind(input.remaining_stock_variance_amount)
    .bind(input.notes)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.created_at)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn insert_purchase_cost_reconciliation_item(
    tx: &mut Transaction<'_, Postgres>,
    input: PurchaseCostReconciliationItemDto,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO purchase_cost_reconciliation_items (
            id,
            reconciliation_id,
            purchase_document_item_id,
            product_id,
            product_name,
            received_quantity,
            invoiced_quantity,
            quantity_variance,
            sold_quantity_at_reconciliation,
            remaining_quantity_at_reconciliation,
            estimated_price,
            final_price,
            additional_cost_allocation,
            supplier_discount_allocation,
            supplier_tax_allocation,
            final_landed_cost_per_unit,
            variance_per_unit,
            sold_cost_variance_amount,
            remaining_stock_variance_amount,
            created_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(input.id)
    .bind(input.reconciliation_id)
    .bind(input.purchase_document_item_id)
    .bind(input.product_id)
    .bind(input.product_name)
    .bind(input.received_quantity)
    .bind(input.invoiced_quantity)
    .bind(input.quantity_variance)
    .bind(input.sold_quantity_at_reconciliation)
    .bind(input.remaining_quantity_at_reconciliation)
    .bind(input.estimated_price)
    .bind(input.final_price)
    .bind(input.additional_cost_allocation)
    .bind(input.supplier_discount_allocation)
    .bind(input.supplier_tax_allocation)
    .bind(input.final_landed_cost_per_unit)
    .bind(input.variance_per_unit)
    .bind(input.sold_cost_variance_amount)
    .bind(input.remaining_stock_variance_amount)
    .bind(input.created_at)
    .execute(&mut **tx)
    .await?;

    Ok(())
}
