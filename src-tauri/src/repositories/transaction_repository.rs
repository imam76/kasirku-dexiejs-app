use crate::models::transaction::{TransactionBundleDto, TransactionDto, TransactionItemDto};
use sqlx::{PgPool, Postgres, Transaction};

macro_rules! transaction_select {
    () => {
        r#"
        SELECT
            id,
            transaction_number,
            business_type,
            cashier_session_id,
            cashier_session_number,
            restaurant_session_id,
            restaurant_session_number,
            restaurant_order_id,
            cashier_user_id,
            cashier_user_name,
            member_contact_id,
            member_number,
            member_name,
            member_phone,
            membership_points_earned,
            membership_points_redeemed,
            membership_point_discount_amount,
            membership_points_balance_after,
            subtotal_amount,
            discount_amount,
            discount_breakdown,
            applied_promos_snapshot,
            total_amount,
            payment_amount,
            change_amount,
            payment_mode,
            payment_method,
            payment_method_id,
            payment_method_code,
            payment_method_name,
            payment_method_category,
            payment_reference,
            payment_posting_account_id,
            payment_posting_account_code,
            payment_posting_account_name,
            status,
            voided_at,
            void_reason,
            receipt_status,
            receipt_printed_at,
            receipt_print_error,
            created_at,
            updated_at
        FROM pos_transactions
        "#
    };
}

macro_rules! transaction_item_select {
    () => {
        r#"
        SELECT
            id,
            transaction_id,
            product_id,
            product_name,
            price,
            selling_price,
            original_price,
            is_price_edited,
            price_edited_by,
            price_edited_at,
            purchase_price,
            quantity,
            unit,
            unit_id,
            unit_label,
            unit_category,
            conversion_value,
            base_unit,
            price_before_discount,
            subtotal_before_discount,
            discount_amount,
            subtotal,
            profit,
            hpp_status,
            hpp_reconciled_at,
            hpp_variance_amount,
            profit_status,
            created_at
        FROM pos_transaction_items
        "#
    };
}

pub async fn list_transaction_bundles(
    pool: &PgPool,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<TransactionBundleDto>, sqlx::Error> {
    let limit = limit.unwrap_or(200).clamp(1, 500);
    let transactions = sqlx::query_as::<_, TransactionDto>(concat!(
        transaction_select!(),
        r#"
        WHERE ($1::TIMESTAMPTZ IS NULL OR (updated_at, id) > ($1::TIMESTAMPTZ, COALESCE($2::TEXT, '')))
        ORDER BY updated_at ASC, id ASC
        LIMIT $3
        "#
    ))
    .bind(updated_after)
    .bind(cursor_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let transaction_ids: Vec<String> = transactions.iter().map(|t| t.id.clone()).collect();
    let items = list_transaction_items_for_transactions(pool, transaction_ids).await?;

    let mut items_by_transaction: std::collections::HashMap<String, Vec<TransactionItemDto>> =
        std::collections::HashMap::new();
    for item in items {
        items_by_transaction
            .entry(item.transaction_id.clone())
            .or_default()
            .push(item);
    }

    Ok(transactions
        .into_iter()
        .map(|transaction| {
            let items = items_by_transaction
                .remove(&transaction.id)
                .unwrap_or_default();
            TransactionBundleDto { transaction, items }
        })
        .collect())
}

pub async fn get_transaction_bundle(
    pool: &PgPool,
    id: String,
) -> Result<Option<TransactionBundleDto>, sqlx::Error> {
    let transaction =
        sqlx::query_as::<_, TransactionDto>(concat!(transaction_select!(), " WHERE id = $1"))
            .bind(&id)
            .fetch_optional(pool)
            .await?;

    let Some(transaction) = transaction else {
        return Ok(None);
    };

    let items = list_transaction_items(pool, &transaction.id).await?;
    Ok(Some(TransactionBundleDto { transaction, items }))
}

async fn list_transaction_items(
    pool: &PgPool,
    transaction_id: &str,
) -> Result<Vec<TransactionItemDto>, sqlx::Error> {
    sqlx::query_as::<_, TransactionItemDto>(concat!(
        transaction_item_select!(),
        " WHERE transaction_id = $1 ORDER BY created_at ASC, id ASC"
    ))
    .bind(transaction_id)
    .fetch_all(pool)
    .await
}

async fn list_transaction_items_for_transactions(
    pool: &PgPool,
    transaction_ids: Vec<String>,
) -> Result<Vec<TransactionItemDto>, sqlx::Error> {
    if transaction_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as::<_, TransactionItemDto>(concat!(
        transaction_item_select!(),
        " WHERE transaction_id = ANY($1) ORDER BY transaction_id ASC, created_at ASC, id ASC"
    ))
    .bind(transaction_ids)
    .fetch_all(pool)
    .await
}

async fn list_transaction_items_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    transaction_id: &str,
) -> Result<Vec<TransactionItemDto>, sqlx::Error> {
    sqlx::query_as::<_, TransactionItemDto>(concat!(
        transaction_item_select!(),
        " WHERE transaction_id = $1 ORDER BY created_at ASC, id ASC"
    ))
    .bind(transaction_id)
    .fetch_all(&mut **tx)
    .await
}

async fn get_transaction_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    transaction_id: &str,
) -> Result<Option<TransactionDto>, sqlx::Error> {
    sqlx::query_as::<_, TransactionDto>(concat!(transaction_select!(), " WHERE id = $1"))
        .bind(transaction_id)
        .fetch_optional(&mut **tx)
        .await
}

pub async fn upsert_transaction_bundle(
    pool: &PgPool,
    input: TransactionBundleDto,
) -> Result<TransactionBundleDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let transaction_id = input.transaction.id.clone();

    let upserted_transaction = upsert_transaction(&mut tx, input.transaction).await?;
    if let Some(transaction) = upserted_transaction {
        replace_transaction_items(&mut tx, &transaction.id, input.items).await?;
        let items = list_transaction_items_in_tx(&mut tx, &transaction.id).await?;
        tx.commit().await?;
        return Ok(TransactionBundleDto { transaction, items });
    }

    let transaction = get_transaction_in_tx(&mut tx, &transaction_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let items = list_transaction_items_in_tx(&mut tx, &transaction.id).await?;
    tx.commit().await?;

    Ok(TransactionBundleDto { transaction, items })
}

async fn upsert_transaction(
    tx: &mut Transaction<'_, Postgres>,
    input: TransactionDto,
) -> Result<Option<TransactionDto>, sqlx::Error> {
    sqlx::query_as::<_, TransactionDto>(
        r#"
        INSERT INTO pos_transactions (
            id,
            transaction_number,
            business_type,
            cashier_session_id,
            cashier_session_number,
            restaurant_session_id,
            restaurant_session_number,
            restaurant_order_id,
            cashier_user_id,
            cashier_user_name,
            member_contact_id,
            member_number,
            member_name,
            member_phone,
            membership_points_earned,
            membership_points_redeemed,
            membership_point_discount_amount,
            membership_points_balance_after,
            subtotal_amount,
            discount_amount,
            discount_breakdown,
            applied_promos_snapshot,
            total_amount,
            payment_amount,
            change_amount,
            payment_mode,
            payment_method,
            payment_method_id,
            payment_method_code,
            payment_method_name,
            payment_method_category,
            payment_reference,
            payment_posting_account_id,
            payment_posting_account_code,
            payment_posting_account_name,
            status,
            voided_at,
            void_reason,
            receipt_status,
            receipt_printed_at,
            receipt_print_error,
            created_at,
            updated_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, $37::TIMESTAMPTZ, $38, $39,
            $40::TIMESTAMPTZ, $41, $42::TIMESTAMPTZ, $43::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            transaction_number = EXCLUDED.transaction_number,
            business_type = EXCLUDED.business_type,
            cashier_session_id = EXCLUDED.cashier_session_id,
            cashier_session_number = EXCLUDED.cashier_session_number,
            restaurant_session_id = EXCLUDED.restaurant_session_id,
            restaurant_session_number = EXCLUDED.restaurant_session_number,
            restaurant_order_id = EXCLUDED.restaurant_order_id,
            cashier_user_id = EXCLUDED.cashier_user_id,
            cashier_user_name = EXCLUDED.cashier_user_name,
            member_contact_id = EXCLUDED.member_contact_id,
            member_number = EXCLUDED.member_number,
            member_name = EXCLUDED.member_name,
            member_phone = EXCLUDED.member_phone,
            membership_points_earned = EXCLUDED.membership_points_earned,
            membership_points_redeemed = EXCLUDED.membership_points_redeemed,
            membership_point_discount_amount = EXCLUDED.membership_point_discount_amount,
            membership_points_balance_after = EXCLUDED.membership_points_balance_after,
            subtotal_amount = EXCLUDED.subtotal_amount,
            discount_amount = EXCLUDED.discount_amount,
            discount_breakdown = EXCLUDED.discount_breakdown,
            applied_promos_snapshot = EXCLUDED.applied_promos_snapshot,
            total_amount = EXCLUDED.total_amount,
            payment_amount = EXCLUDED.payment_amount,
            change_amount = EXCLUDED.change_amount,
            payment_mode = EXCLUDED.payment_mode,
            payment_method = EXCLUDED.payment_method,
            payment_method_id = EXCLUDED.payment_method_id,
            payment_method_code = EXCLUDED.payment_method_code,
            payment_method_name = EXCLUDED.payment_method_name,
            payment_method_category = EXCLUDED.payment_method_category,
            payment_reference = EXCLUDED.payment_reference,
            payment_posting_account_id = EXCLUDED.payment_posting_account_id,
            payment_posting_account_code = EXCLUDED.payment_posting_account_code,
            payment_posting_account_name = EXCLUDED.payment_posting_account_name,
            status = EXCLUDED.status,
            voided_at = EXCLUDED.voided_at,
            void_reason = EXCLUDED.void_reason,
            receipt_status = EXCLUDED.receipt_status,
            receipt_printed_at = EXCLUDED.receipt_printed_at,
            receipt_print_error = EXCLUDED.receipt_print_error,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= pos_transactions.updated_at
        RETURNING
            id,
            transaction_number,
            business_type,
            cashier_session_id,
            cashier_session_number,
            restaurant_session_id,
            restaurant_session_number,
            restaurant_order_id,
            cashier_user_id,
            cashier_user_name,
            member_contact_id,
            member_number,
            member_name,
            member_phone,
            membership_points_earned,
            membership_points_redeemed,
            membership_point_discount_amount,
            membership_points_balance_after,
            subtotal_amount,
            discount_amount,
            discount_breakdown,
            applied_promos_snapshot,
            total_amount,
            payment_amount,
            change_amount,
            payment_mode,
            payment_method,
            payment_method_id,
            payment_method_code,
            payment_method_name,
            payment_method_category,
            payment_reference,
            payment_posting_account_id,
            payment_posting_account_code,
            payment_posting_account_name,
            status,
            voided_at,
            void_reason,
            receipt_status,
            receipt_printed_at,
            receipt_print_error,
            created_at,
            updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.transaction_number)
    .bind(input.business_type)
    .bind(input.cashier_session_id)
    .bind(input.cashier_session_number)
    .bind(input.restaurant_session_id)
    .bind(input.restaurant_session_number)
    .bind(input.restaurant_order_id)
    .bind(input.cashier_user_id)
    .bind(input.cashier_user_name)
    .bind(input.member_contact_id)
    .bind(input.member_number)
    .bind(input.member_name)
    .bind(input.member_phone)
    .bind(input.membership_points_earned)
    .bind(input.membership_points_redeemed)
    .bind(input.membership_point_discount_amount)
    .bind(input.membership_points_balance_after)
    .bind(input.subtotal_amount)
    .bind(input.discount_amount)
    .bind(input.discount_breakdown)
    .bind(input.applied_promos_snapshot)
    .bind(input.total_amount)
    .bind(input.payment_amount)
    .bind(input.change_amount)
    .bind(input.payment_mode)
    .bind(input.payment_method)
    .bind(input.payment_method_id)
    .bind(input.payment_method_code)
    .bind(input.payment_method_name)
    .bind(input.payment_method_category)
    .bind(input.payment_reference)
    .bind(input.payment_posting_account_id)
    .bind(input.payment_posting_account_code)
    .bind(input.payment_posting_account_name)
    .bind(input.status)
    .bind(input.voided_at)
    .bind(input.void_reason)
    .bind(input.receipt_status)
    .bind(input.receipt_printed_at)
    .bind(input.receipt_print_error)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(&mut **tx)
    .await
}

async fn replace_transaction_items(
    tx: &mut Transaction<'_, Postgres>,
    transaction_id: &str,
    items: Vec<TransactionItemDto>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM pos_transaction_items WHERE transaction_id = $1")
        .bind(transaction_id)
        .execute(&mut **tx)
        .await?;

    for item in items {
        sqlx::query(
            r#"
            INSERT INTO pos_transaction_items (
                id,
                transaction_id,
                product_id,
                product_name,
                price,
                selling_price,
                original_price,
                is_price_edited,
                price_edited_by,
                price_edited_at,
                purchase_price,
                quantity,
                unit,
                unit_id,
                unit_label,
                unit_category,
                conversion_value,
                base_unit,
                price_before_discount,
                subtotal_before_discount,
                discount_amount,
                subtotal,
                profit,
                hpp_status,
                hpp_reconciled_at,
                hpp_variance_amount,
                profit_status,
                created_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::TIMESTAMPTZ,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25::TIMESTAMPTZ, $26, $27, $28::TIMESTAMPTZ
            )
            "#,
        )
        .bind(item.id)
        .bind(item.transaction_id)
        .bind(item.product_id)
        .bind(item.product_name)
        .bind(item.price)
        .bind(item.selling_price)
        .bind(item.original_price)
        .bind(item.is_price_edited)
        .bind(item.price_edited_by)
        .bind(item.price_edited_at)
        .bind(item.purchase_price)
        .bind(item.quantity)
        .bind(item.unit)
        .bind(item.unit_id)
        .bind(item.unit_label)
        .bind(item.unit_category)
        .bind(item.conversion_value)
        .bind(item.base_unit)
        .bind(item.price_before_discount)
        .bind(item.subtotal_before_discount)
        .bind(item.discount_amount)
        .bind(item.subtotal)
        .bind(item.profit)
        .bind(item.hpp_status)
        .bind(item.hpp_reconciled_at)
        .bind(item.hpp_variance_amount)
        .bind(item.profit_status)
        .bind(item.created_at)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}
