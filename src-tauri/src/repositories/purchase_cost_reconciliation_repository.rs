use crate::models::purchase_cost_reconciliation::{
    PurchaseCostReconciliationBundleDto, PurchaseCostReconciliationDto,
    PurchaseCostReconciliationItemDto,
};
use sqlx::{PgPool, Postgres, Transaction};
use std::collections::HashMap;

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
            created_at::TEXT AS created_at,
            server_created_at::TEXT AS server_created_at
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

/// Delta fetch cursors on `(server_created_at, id)`, not `created_at`. `created_at` is
/// client-supplied business time and can arrive at the server long after it was set (offline
/// device, sync-queue backlog), so cursoring on it lets a late push get permanently skipped once
/// other devices' cursors have already advanced past that earlier timestamp. `server_created_at`
/// is assigned by Postgres at INSERT time (see migration 0081), so it reflects true arrival
/// order and is immune to that race. The `id` tiebreaker guards against rows that share the same
/// `server_created_at` (same statement batch / clock tick) from being skipped or duplicated
/// across a page boundary - a plain `>` on the timestamp alone would miss rows tied with the
/// cursor value.
pub async fn list_purchase_cost_reconciliation_bundles(
    pool: &PgPool,
    cursor_server_created_at: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<PurchaseCostReconciliationBundleDto>, sqlx::Error> {
    let reconciliations = sqlx::query_as::<_, PurchaseCostReconciliationDto>(concat!(
        reconciliation_select!(),
        " WHERE $1::TIMESTAMPTZ IS NULL
             OR (server_created_at, id) > ($1::TIMESTAMPTZ, $2)
          ORDER BY server_created_at, id
          LIMIT $3"
    ))
    .bind(cursor_server_created_at)
    .bind(cursor_id)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await?;

    if reconciliations.is_empty() {
        return Ok(Vec::new());
    }

    // Fetch every page's items in a single round trip, grouped by reconciliation_id, instead of
    // one query per reconciliation (N+1).
    let ids: Vec<String> = reconciliations.iter().map(|r| r.id.clone()).collect();
    let mut items_by_reconciliation = list_purchase_cost_reconciliation_items_for_ids(pool, &ids).await?;

    Ok(reconciliations
        .into_iter()
        .map(|reconciliation| {
            let items = items_by_reconciliation
                .remove(&reconciliation.id)
                .unwrap_or_default();
            PurchaseCostReconciliationBundleDto { reconciliation, items }
        })
        .collect())
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

async fn list_purchase_cost_reconciliation_items_for_ids(
    pool: &PgPool,
    reconciliation_ids: &[String],
) -> Result<HashMap<String, Vec<PurchaseCostReconciliationItemDto>>, sqlx::Error> {
    let items = sqlx::query_as::<_, PurchaseCostReconciliationItemDto>(concat!(
        reconciliation_item_select!(),
        " WHERE reconciliation_id = ANY($1) ORDER BY reconciliation_id, created_at ASC, id ASC"
    ))
    .bind(reconciliation_ids)
    .fetch_all(pool)
    .await?;

    let mut grouped: HashMap<String, Vec<PurchaseCostReconciliationItemDto>> = HashMap::new();
    for item in items {
        grouped
            .entry(item.reconciliation_id.clone())
            .or_default()
            .push(item);
    }
    Ok(grouped)
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

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    async fn test_pool() -> Option<PgPool> {
        let database_url = std::env::var("TEST_DATABASE_URL").ok()?;
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await
            .expect("TEST_DATABASE_URL must point to a reachable disposable PostgreSQL database");
        sqlx::migrate!()
            .run(&pool)
            .await
            .expect("purchase_cost_reconciliation migrations must succeed");
        Some(pool)
    }

    async fn seed_purchase_document(pool: &PgPool, id: &str) {
        sqlx::query(
            r#"
            INSERT INTO purchase_documents (
                id, document_number, type, status, supplier_name, document_date, created_at, updated_at
            )
            VALUES ($1, $2, 'purchase_receipt', 'completed', 'Supplier Uji', '2026-08-01', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(id)
        .bind(format!("PO-{id}"))
        .execute(pool)
        .await
        .unwrap();
    }

    /// Deletes every reconciliation/purchase_document row whose id starts with `prefix`. Items
    /// cascade via `ON DELETE CASCADE`. Each test uses its own prefix so parallel `#[tokio::test]`
    /// runs against the same TEST_DATABASE_URL never collide.
    async fn cleanup(pool: &PgPool, prefix: &str) {
        sqlx::query("DELETE FROM purchase_cost_reconciliations WHERE id LIKE $1")
            .bind(format!("{prefix}%"))
            .execute(pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM purchase_documents WHERE id LIKE $1")
            .bind(format!("{prefix}%"))
            .execute(pool)
            .await
            .unwrap();
    }

    fn reconciliation_dto(
        id: &str,
        purchase_document_id: &str,
        created_at: &str,
    ) -> PurchaseCostReconciliationDto {
        PurchaseCostReconciliationDto {
            id: id.to_string(),
            purchase_document_id: purchase_document_id.to_string(),
            purchase_document_number: format!("PO-{purchase_document_id}"),
            supplier_invoice_number: None,
            supplier_invoice_date: None,
            additional_cost_treatment: "proportional".to_string(),
            additional_cost_amount: 0.0,
            supplier_discount_amount: 0.0,
            supplier_tax_amount: 0.0,
            total_estimated_cost: 100.0,
            total_final_cost: 105.0,
            total_variance_amount: 5.0,
            sold_cost_variance_amount: 2.0,
            remaining_stock_variance_amount: 3.0,
            notes: None,
            created_by: None,
            created_by_name: None,
            created_at: created_at.to_string(),
            server_created_at: None,
        }
    }

    fn item_dto(
        id: &str,
        reconciliation_id: &str,
        product_id: &str,
        created_at: &str,
    ) -> PurchaseCostReconciliationItemDto {
        PurchaseCostReconciliationItemDto {
            id: id.to_string(),
            reconciliation_id: reconciliation_id.to_string(),
            purchase_document_item_id: format!("{id}-line"),
            product_id: product_id.to_string(),
            product_name: format!("Produk {product_id}"),
            received_quantity: 10.0,
            invoiced_quantity: 10.0,
            quantity_variance: 0.0,
            sold_quantity_at_reconciliation: 4.0,
            remaining_quantity_at_reconciliation: 6.0,
            estimated_price: 10.0,
            final_price: 10.5,
            additional_cost_allocation: 0.0,
            supplier_discount_allocation: 0.0,
            supplier_tax_allocation: 0.0,
            final_landed_cost_per_unit: 10.5,
            variance_per_unit: 0.5,
            sold_cost_variance_amount: 2.0,
            remaining_stock_variance_amount: 3.0,
            created_at: created_at.to_string(),
        }
    }

    /// Forces `server_created_at` to an explicit value. Production code never does this (it's
    /// always DEFAULT NOW() at INSERT time) - tests use it to deterministically control arrival
    /// order and to create timestamp ties, independent of wall-clock time and of whatever other
    /// tests are concurrently inserting rows with real NOW() values.
    async fn force_server_created_at(pool: &PgPool, id: &str, server_created_at: &str) {
        sqlx::query("UPDATE purchase_cost_reconciliations SET server_created_at = $1::TIMESTAMPTZ WHERE id = $2")
            .bind(server_created_at)
            .bind(id)
            .execute(pool)
            .await
            .unwrap();
    }

    /// Highest `(server_created_at, id)` currently in the table, used as a pull starting point so
    /// assertions only look at rows created by (or after) this test, ignoring whatever rows other
    /// concurrently-running tests may have already committed.
    async fn capture_cursor(pool: &PgPool) -> (Option<String>, Option<String>) {
        let row: Option<(String, String)> = sqlx::query_as(
            "SELECT server_created_at::TEXT, id FROM purchase_cost_reconciliations
             ORDER BY server_created_at DESC, id DESC LIMIT 1",
        )
        .fetch_optional(pool)
        .await
        .unwrap();

        match row {
            Some((server_created_at, id)) => (Some(server_created_at), Some(id)),
            None => (None, None),
        }
    }

    async fn pull_all_from(
        pool: &PgPool,
        mut cursor: (Option<String>, Option<String>),
        page_limit: i64,
    ) -> Vec<PurchaseCostReconciliationBundleDto> {
        let mut all = Vec::new();
        loop {
            let page = list_purchase_cost_reconciliation_bundles(
                pool,
                cursor.0.clone(),
                cursor.1.clone(),
                Some(page_limit),
            )
            .await
            .unwrap();

            if page.is_empty() {
                break;
            }

            let last = page.last().unwrap();
            cursor = (
                last.reconciliation.server_created_at.clone(),
                Some(last.reconciliation.id.clone()),
            );
            let returned_full_page = page.len() as i64 == page_limit;
            all.extend(page);
            if !returned_full_page {
                break;
            }
        }
        all
    }

    #[tokio::test]
    async fn postgres_push_bundle_persists_parent_and_items() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let prefix = "TEST-PCR-PUSH-";
        cleanup(&pool, prefix).await;

        let doc_id = format!("{prefix}DOC");
        seed_purchase_document(&pool, &doc_id).await;

        let reconciliation_id = format!("{prefix}1");
        let item_id = format!("{prefix}1-ITEM-1");
        let bundle = PurchaseCostReconciliationBundleDto {
            reconciliation: reconciliation_dto(&reconciliation_id, &doc_id, "2026-08-01T00:00:00.000Z"),
            items: vec![item_dto(&item_id, &reconciliation_id, "PRODUCT-1", "2026-08-01T00:00:00.000Z")],
        };

        let result = upsert_purchase_cost_reconciliation_bundle(&pool, bundle)
            .await
            .unwrap();
        assert_eq!(result.reconciliation.id, reconciliation_id);
        assert_eq!(result.items.len(), 1);
        assert!(
            result.reconciliation.server_created_at.is_some(),
            "server_created_at must be assigned by Postgres at insert time"
        );

        let stored = get_purchase_cost_reconciliation_bundle(&pool, reconciliation_id.clone())
            .await
            .unwrap()
            .expect("reconciliation must exist after push");
        assert_eq!(stored.items.len(), 1);
        assert_eq!(stored.items[0].product_id, "PRODUCT-1");
        assert_eq!(stored.items[0].id, item_id);

        cleanup(&pool, prefix).await;
    }

    #[tokio::test]
    async fn postgres_push_bundle_retry_is_idempotent() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let prefix = "TEST-PCR-RETRY-";
        cleanup(&pool, prefix).await;

        let doc_id = format!("{prefix}DOC");
        seed_purchase_document(&pool, &doc_id).await;

        let reconciliation_id = format!("{prefix}1");
        let item_id = format!("{prefix}1-ITEM-1");
        let bundle = || PurchaseCostReconciliationBundleDto {
            reconciliation: reconciliation_dto(&reconciliation_id, &doc_id, "2026-08-01T00:00:00.000Z"),
            items: vec![item_dto(&item_id, &reconciliation_id, "PRODUCT-1", "2026-08-01T00:00:00.000Z")],
        };

        upsert_purchase_cost_reconciliation_bundle(&pool, bundle())
            .await
            .expect("first push must succeed");
        // Simulates the client retrying after e.g. a dropped response - same queue item, same
        // ids, sent again.
        upsert_purchase_cost_reconciliation_bundle(&pool, bundle())
            .await
            .expect("retried push must not error");

        let reconciliation_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM purchase_cost_reconciliations WHERE id = $1")
                .bind(&reconciliation_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(reconciliation_count, 1, "retry must not create a duplicate reconciliation row");

        let item_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM purchase_cost_reconciliation_items WHERE reconciliation_id = $1",
        )
        .bind(&reconciliation_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(item_count, 1, "retry must not duplicate item rows");

        cleanup(&pool, prefix).await;
    }

    #[tokio::test]
    async fn postgres_pull_finds_bundle_pushed_by_another_device() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let prefix = "TEST-PCR-PULL-";
        cleanup(&pool, prefix).await;

        let doc_id = format!("{prefix}DOC");
        seed_purchase_document(&pool, &doc_id).await;

        // "Device A" is offline and only pushes now, well after the record was created locally.
        let cursor_before_push = capture_cursor(&pool).await;

        let reconciliation_id = format!("{prefix}1");
        let item_id = format!("{prefix}1-ITEM-1");
        upsert_purchase_cost_reconciliation_bundle(
            &pool,
            PurchaseCostReconciliationBundleDto {
                reconciliation: reconciliation_dto(&reconciliation_id, &doc_id, "2026-08-01T00:00:00.000Z"),
                items: vec![item_dto(&item_id, &reconciliation_id, "PRODUCT-1", "2026-08-01T00:00:00.000Z")],
            },
        )
        .await
        .unwrap();

        // "Device B" pulls from wherever it last left off.
        let pulled = pull_all_from(&pool, cursor_before_push, 500).await;
        let found = pulled
            .iter()
            .find(|bundle| bundle.reconciliation.id == reconciliation_id)
            .expect("device B must see device A's pushed bundle");
        assert_eq!(found.items.len(), 1);
        assert_eq!(found.items[0].product_id, "PRODUCT-1");

        cleanup(&pool, prefix).await;
    }

    #[tokio::test]
    async fn postgres_pull_paginates_stably_when_server_created_at_ties() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let prefix = "TEST-PCR-TIE-";
        cleanup(&pool, prefix).await;

        let doc_id = format!("{prefix}DOC");
        seed_purchase_document(&pool, &doc_id).await;

        let cursor_before_insert = capture_cursor(&pool).await;

        // Far enough in the future that no concurrently-running test's real NOW() value can ever
        // exceed it, so these three rows are guaranteed to sort after `cursor_before_insert`
        // regardless of what else is being inserted at the same time.
        let tied_timestamp = "2999-01-01T00:00:00.000Z";
        let mut ids = Vec::new();
        for suffix in ["1", "2", "3"] {
            let reconciliation_id = format!("{prefix}{suffix}");
            upsert_purchase_cost_reconciliation_bundle(
                &pool,
                PurchaseCostReconciliationBundleDto {
                    reconciliation: reconciliation_dto(&reconciliation_id, &doc_id, "2026-08-01T00:00:00.000Z"),
                    items: vec![],
                },
            )
            .await
            .unwrap();
            force_server_created_at(&pool, &reconciliation_id, tied_timestamp).await;
            ids.push(reconciliation_id);
        }

        // limit=1 forces the cursor to land exactly on the tied timestamp between every page.
        let pulled = pull_all_from(&pool, cursor_before_insert, 1).await;
        let pulled_ids: Vec<String> = pulled
            .iter()
            .map(|bundle| bundle.reconciliation.id.clone())
            .filter(|id| id.starts_with(prefix))
            .collect();

        assert_eq!(
            pulled_ids, ids,
            "every tied-timestamp row must be returned exactly once, in id order, none skipped or duplicated"
        );

        cleanup(&pool, prefix).await;
    }

    #[tokio::test]
    async fn postgres_pull_backfills_old_record_pushed_after_newer_data_already_synced() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let prefix = "TEST-PCR-BACKFILL-";
        cleanup(&pool, prefix).await;

        let doc_id = format!("{prefix}DOC");
        seed_purchase_document(&pool, &doc_id).await;

        // "Device Y" creates and pushes a record with a recent business created_at - this is the
        // data every other device will already have synced.
        let newer_id = format!("{prefix}NEWER");
        upsert_purchase_cost_reconciliation_bundle(
            &pool,
            PurchaseCostReconciliationBundleDto {
                reconciliation: reconciliation_dto(&newer_id, &doc_id, "2026-08-10T00:00:00.000Z"),
                items: vec![],
            },
        )
        .await
        .unwrap();
        force_server_created_at(&pool, &newer_id, "2999-01-01T00:00:00.000Z").await;

        // "Device Z" already pulled through the newer record - this is its saved cursor.
        let device_z_cursor = (Some("2999-01-01T00:00:00.000Z".to_string()), Some(newer_id.clone()));

        // "Device X" was offline for a long time. It created this record weeks earlier (older
        // business created_at) but only pushes it to Postgres now - after device Y's record has
        // already been created *and* pulled by device Z.
        let older_id = format!("{prefix}OLDER");
        upsert_purchase_cost_reconciliation_bundle(
            &pool,
            PurchaseCostReconciliationBundleDto {
                reconciliation: reconciliation_dto(&older_id, &doc_id, "2026-06-01T00:00:00.000Z"),
                items: vec![],
            },
        )
        .await
        .unwrap();
        force_server_created_at(&pool, &older_id, "2999-01-02T00:00:00.000Z").await;

        // Device Z pulls again from its saved cursor. Because the cursor is on server_created_at
        // (arrival order), not the older record's business created_at, the late push must still
        // show up - this is the exact case that a created_at-based cursor would have permanently
        // dropped.
        let pulled = pull_all_from(&pool, device_z_cursor, 500).await;
        assert!(
            pulled.iter().any(|bundle| bundle.reconciliation.id == older_id),
            "a record pushed late with an older business created_at must still be delta-fetched \
             once it arrives at the server"
        );

        cleanup(&pool, prefix).await;
    }
}
