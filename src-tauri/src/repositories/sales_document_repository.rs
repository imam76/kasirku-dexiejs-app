use crate::models::sales_document::{
    SalesDocumentBundleDto, SalesDocumentDto, SalesDocumentItemDto,
};
use sqlx::{PgPool, Postgres, Transaction};
use std::collections::HashMap;

macro_rules! sales_document_select {
    () => {
        r#"
        SELECT
            id,
            document_number,
            type,
            status,
            contact_id,
            customer_name,
            customer_phone,
            customer_email,
            customer_address,
            customer_company_name,
            customer_tax_number,
            department_id,
            department_code,
            department_name,
            project_id,
            project_code,
            project_name,
            document_date,
            expired_at,
            due_date,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            source_document_id,
            source_document_number,
            source_document_type,
            currency_code,
            currency_name,
            currency_symbol,
            base_currency_code,
            exchange_rate,
            exchange_rate_source,
            exchange_rate_basis,
            exchange_rate_date,
            subtotal_amount,
            foreign_subtotal_amount,
            discount_type,
            discount_value,
            discount_amount,
            foreign_discount_amount,
            discount_account_id,
            discount_account_code,
            discount_account_name,
            tax_id,
            tax_name,
            tax_code,
            tax_rate,
            tax_calculation_mode,
            tax_amount,
            foreign_tax_amount,
            total_amount,
            foreign_total_amount,
            payment_status,
            paid_amount,
            paid_at,
            payment_method,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            finance_transaction_id,
            notes,
            issued_at::TEXT AS issued_at,
            voided_at::TEXT AS voided_at,
            void_reason,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM sales_documents
        "#
    };
}

macro_rules! sales_document_item_select {
    () => {
        r#"
        SELECT
            id,
            document_id,
            product_id,
            product_name,
            sku,
            unit,
            quantity,
            ordered_quantity,
            delivered_quantity,
            price,
            currency_code,
            exchange_rate,
            exchange_rate_source,
            exchange_rate_basis,
            exchange_rate_date,
            foreign_price,
            discount_type,
            discount_value,
            discount_amount,
            foreign_discount_amount,
            tax_id,
            tax_name,
            tax_code,
            tax_rate,
            tax_calculation_mode,
            tax_base_amount,
            foreign_tax_base_amount,
            tax_amount,
            foreign_tax_amount,
            subtotal,
            foreign_subtotal,
            total_amount,
            foreign_total_amount,
            purchase_price,
            original_price,
            is_price_edited,
            price_edited_by,
            price_edited_at::TEXT AS price_edited_at,
            created_at::TEXT AS created_at
        FROM sales_document_items
        "#
    };
}

pub async fn list_sales_document_bundles(
    pool: &PgPool,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<SalesDocumentBundleDto>, sqlx::Error> {
    let limit = limit.unwrap_or(200).clamp(1, 500);
    let documents = sqlx::query_as::<_, SalesDocumentDto>(concat!(
        sales_document_select!(),
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

    let document_ids = documents
        .iter()
        .map(|document| document.id.clone())
        .collect::<Vec<_>>();
    let items = list_sales_document_items_for_documents(pool, document_ids).await?;
    let mut items_by_document_id = HashMap::<String, Vec<SalesDocumentItemDto>>::new();
    for item in items {
        items_by_document_id
            .entry(item.document_id.clone())
            .or_default()
            .push(item);
    }

    let mut bundles = Vec::with_capacity(documents.len());
    for document in documents {
        let items = items_by_document_id
            .remove(&document.id)
            .unwrap_or_default();
        bundles.push(SalesDocumentBundleDto { document, items });
    }

    Ok(bundles)
}

pub async fn get_sales_document_bundle(
    pool: &PgPool,
    id: String,
) -> Result<Option<SalesDocumentBundleDto>, sqlx::Error> {
    let document =
        sqlx::query_as::<_, SalesDocumentDto>(concat!(sales_document_select!(), " WHERE id = $1"))
            .bind(id)
            .fetch_optional(pool)
            .await?;

    if let Some(document) = document {
        let items = list_sales_document_items(pool, &document.id).await?;
        return Ok(Some(SalesDocumentBundleDto { document, items }));
    }

    Ok(None)
}

pub async fn upsert_sales_document_bundle(
    pool: &PgPool,
    input: SalesDocumentBundleDto,
) -> Result<SalesDocumentBundleDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let document_id = input.document.id.clone();

    let upserted_document = upsert_sales_document(&mut tx, input.document).await?;
    if let Some(document) = upserted_document {
        replace_sales_document_items(&mut tx, &document.id, input.items).await?;
        let items = list_sales_document_items_in_tx(&mut tx, &document.id).await?;
        tx.commit().await?;
        return Ok(SalesDocumentBundleDto { document, items });
    }

    let document = get_sales_document_in_tx(&mut tx, &document_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let items = list_sales_document_items_in_tx(&mut tx, &document.id).await?;
    tx.commit().await?;

    Ok(SalesDocumentBundleDto { document, items })
}

async fn list_sales_document_items(
    pool: &PgPool,
    document_id: &str,
) -> Result<Vec<SalesDocumentItemDto>, sqlx::Error> {
    sqlx::query_as::<_, SalesDocumentItemDto>(concat!(
        sales_document_item_select!(),
        " WHERE document_id = $1 ORDER BY created_at ASC, id ASC"
    ))
    .bind(document_id)
    .fetch_all(pool)
    .await
}

async fn list_sales_document_items_for_documents(
    pool: &PgPool,
    document_ids: Vec<String>,
) -> Result<Vec<SalesDocumentItemDto>, sqlx::Error> {
    if document_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as::<_, SalesDocumentItemDto>(concat!(
        sales_document_item_select!(),
        " WHERE document_id = ANY($1) ORDER BY document_id ASC, created_at ASC, id ASC"
    ))
    .bind(document_ids)
    .fetch_all(pool)
    .await
}

async fn list_sales_document_items_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    document_id: &str,
) -> Result<Vec<SalesDocumentItemDto>, sqlx::Error> {
    sqlx::query_as::<_, SalesDocumentItemDto>(concat!(
        sales_document_item_select!(),
        " WHERE document_id = $1 ORDER BY created_at ASC, id ASC"
    ))
    .bind(document_id)
    .fetch_all(&mut **tx)
    .await
}

async fn get_sales_document_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    document_id: &str,
) -> Result<Option<SalesDocumentDto>, sqlx::Error> {
    sqlx::query_as::<_, SalesDocumentDto>(concat!(sales_document_select!(), " WHERE id = $1"))
        .bind(document_id)
        .fetch_optional(&mut **tx)
        .await
}

async fn upsert_sales_document(
    tx: &mut Transaction<'_, Postgres>,
    input: SalesDocumentDto,
) -> Result<Option<SalesDocumentDto>, sqlx::Error> {
    sqlx::query_as::<_, SalesDocumentDto>(
        r#"
        INSERT INTO sales_documents (
            id,
            document_number,
            type,
            status,
            contact_id,
            customer_name,
            customer_phone,
            customer_email,
            customer_address,
            customer_company_name,
            customer_tax_number,
            department_id,
            department_code,
            department_name,
            project_id,
            project_code,
            project_name,
            document_date,
            expired_at,
            due_date,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            source_document_id,
            source_document_number,
            source_document_type,
            subtotal_amount,
            discount_type,
            discount_value,
            discount_amount,
            discount_account_id,
            discount_account_code,
            discount_account_name,
            tax_id,
            tax_name,
            tax_code,
            tax_rate,
            tax_calculation_mode,
            tax_amount,
            total_amount,
            payment_status,
            paid_amount,
            paid_at,
            payment_method,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            finance_transaction_id,
            notes,
            issued_at,
            voided_at,
            void_reason,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at,
            updated_at,
            currency_code,
            currency_name,
            currency_symbol,
            base_currency_code,
            exchange_rate,
            exchange_rate_source,
            exchange_rate_basis,
            exchange_rate_date,
            foreign_subtotal_amount,
            foreign_discount_amount,
            foreign_tax_amount,
            foreign_total_amount
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
            $25,
            $26,
            $27,
            $28,
            $29,
            $30,
            $31,
            $32,
            $33,
            $34,
            $35,
            $36,
            $37,
            $38,
            $39,
            $40,
            $41,
            $42,
            $43,
            $44,
            $45,
            $46,
            $47,
            $48,
            $49,
            $50::TIMESTAMPTZ,
            $51::TIMESTAMPTZ,
            $52,
            $53,
            $54,
            $55,
            $56,
            $57,
            $58::TIMESTAMPTZ,
            $59::TIMESTAMPTZ,
            $60,
            $61,
            $62,
            $63,
            $64,
            $65,
            $66,
            $67,
            $68,
            $69,
            $70,
            $71
        )
        ON CONFLICT (id) DO UPDATE SET
            document_number = EXCLUDED.document_number,
            type = EXCLUDED.type,
            status = EXCLUDED.status,
            contact_id = EXCLUDED.contact_id,
            customer_name = EXCLUDED.customer_name,
            customer_phone = EXCLUDED.customer_phone,
            customer_email = EXCLUDED.customer_email,
            customer_address = EXCLUDED.customer_address,
            customer_company_name = EXCLUDED.customer_company_name,
            customer_tax_number = EXCLUDED.customer_tax_number,
            department_id = EXCLUDED.department_id,
            department_code = EXCLUDED.department_code,
            department_name = EXCLUDED.department_name,
            project_id = EXCLUDED.project_id,
            project_code = EXCLUDED.project_code,
            project_name = EXCLUDED.project_name,
            document_date = EXCLUDED.document_date,
            expired_at = EXCLUDED.expired_at,
            due_date = EXCLUDED.due_date,
            warehouse_id = EXCLUDED.warehouse_id,
            warehouse_code = EXCLUDED.warehouse_code,
            warehouse_name = EXCLUDED.warehouse_name,
            source_document_id = EXCLUDED.source_document_id,
            source_document_number = EXCLUDED.source_document_number,
            source_document_type = EXCLUDED.source_document_type,
            subtotal_amount = EXCLUDED.subtotal_amount,
            discount_type = EXCLUDED.discount_type,
            discount_value = EXCLUDED.discount_value,
            discount_amount = EXCLUDED.discount_amount,
            discount_account_id = EXCLUDED.discount_account_id,
            discount_account_code = EXCLUDED.discount_account_code,
            discount_account_name = EXCLUDED.discount_account_name,
            tax_id = EXCLUDED.tax_id,
            tax_name = EXCLUDED.tax_name,
            tax_code = EXCLUDED.tax_code,
            tax_rate = EXCLUDED.tax_rate,
            tax_calculation_mode = EXCLUDED.tax_calculation_mode,
            tax_amount = EXCLUDED.tax_amount,
            total_amount = EXCLUDED.total_amount,
            payment_status = EXCLUDED.payment_status,
            paid_amount = EXCLUDED.paid_amount,
            paid_at = EXCLUDED.paid_at,
            payment_method = EXCLUDED.payment_method,
            cash_account_id = EXCLUDED.cash_account_id,
            cash_account_code = EXCLUDED.cash_account_code,
            cash_account_name = EXCLUDED.cash_account_name,
            finance_transaction_id = EXCLUDED.finance_transaction_id,
            notes = EXCLUDED.notes,
            issued_at = EXCLUDED.issued_at,
            voided_at = EXCLUDED.voided_at,
            void_reason = EXCLUDED.void_reason,
            version = EXCLUDED.version,
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at,
            currency_code = EXCLUDED.currency_code,
            currency_name = EXCLUDED.currency_name,
            currency_symbol = EXCLUDED.currency_symbol,
            base_currency_code = EXCLUDED.base_currency_code,
            exchange_rate = EXCLUDED.exchange_rate,
            exchange_rate_source = EXCLUDED.exchange_rate_source,
            exchange_rate_basis = EXCLUDED.exchange_rate_basis,
            exchange_rate_date = EXCLUDED.exchange_rate_date,
            foreign_subtotal_amount = EXCLUDED.foreign_subtotal_amount,
            foreign_discount_amount = EXCLUDED.foreign_discount_amount,
            foreign_tax_amount = EXCLUDED.foreign_tax_amount,
            foreign_total_amount = EXCLUDED.foreign_total_amount
        WHERE
            EXCLUDED.version > sales_documents.version OR
            (
                EXCLUDED.version = sales_documents.version AND
                EXCLUDED.updated_at >= sales_documents.updated_at
            )
        RETURNING
            id,
            document_number,
            type,
            status,
            contact_id,
            customer_name,
            customer_phone,
            customer_email,
            customer_address,
            customer_company_name,
            customer_tax_number,
            department_id,
            department_code,
            department_name,
            project_id,
            project_code,
            project_name,
            document_date,
            expired_at,
            due_date,
            warehouse_id,
            warehouse_code,
            warehouse_name,
            source_document_id,
            source_document_number,
            source_document_type,
            subtotal_amount,
            discount_type,
            discount_value,
            discount_amount,
            discount_account_id,
            discount_account_code,
            discount_account_name,
            tax_id,
            tax_name,
            tax_code,
            tax_rate,
            tax_calculation_mode,
            tax_amount,
            total_amount,
            payment_status,
            paid_amount,
            paid_at,
            payment_method,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            finance_transaction_id,
            notes,
            issued_at::TEXT AS issued_at,
            voided_at::TEXT AS voided_at,
            void_reason,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            currency_code,
            currency_name,
            currency_symbol,
            base_currency_code,
            exchange_rate,
            exchange_rate_source,
            exchange_rate_basis,
            exchange_rate_date,
            foreign_subtotal_amount,
            foreign_discount_amount,
            foreign_tax_amount,
            foreign_total_amount
        "#,
    )
    .bind(input.id)
    .bind(input.document_number)
    .bind(input.r#type)
    .bind(input.status)
    .bind(input.contact_id)
    .bind(input.customer_name)
    .bind(input.customer_phone)
    .bind(input.customer_email)
    .bind(input.customer_address)
    .bind(input.customer_company_name)
    .bind(input.customer_tax_number)
    .bind(input.department_id)
    .bind(input.department_code)
    .bind(input.department_name)
    .bind(input.project_id)
    .bind(input.project_code)
    .bind(input.project_name)
    .bind(input.document_date)
    .bind(input.expired_at)
    .bind(input.due_date)
    .bind(input.warehouse_id)
    .bind(input.warehouse_code)
    .bind(input.warehouse_name)
    .bind(input.source_document_id)
    .bind(input.source_document_number)
    .bind(input.source_document_type)
    .bind(input.subtotal_amount)
    .bind(input.discount_type)
    .bind(input.discount_value)
    .bind(input.discount_amount)
    .bind(input.discount_account_id)
    .bind(input.discount_account_code)
    .bind(input.discount_account_name)
    .bind(input.tax_id)
    .bind(input.tax_name)
    .bind(input.tax_code)
    .bind(input.tax_rate)
    .bind(input.tax_calculation_mode)
    .bind(input.tax_amount)
    .bind(input.total_amount)
    .bind(input.payment_status)
    .bind(input.paid_amount)
    .bind(input.paid_at)
    .bind(input.payment_method)
    .bind(input.cash_account_id)
    .bind(input.cash_account_code)
    .bind(input.cash_account_name)
    .bind(input.finance_transaction_id)
    .bind(input.notes)
    .bind(input.issued_at)
    .bind(input.voided_at)
    .bind(input.void_reason)
    .bind(input.version)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.updated_by)
    .bind(input.updated_by_name)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.currency_code)
    .bind(input.currency_name)
    .bind(input.currency_symbol)
    .bind(input.base_currency_code)
    .bind(input.exchange_rate)
    .bind(input.exchange_rate_source)
    .bind(input.exchange_rate_basis)
    .bind(input.exchange_rate_date)
    .bind(input.foreign_subtotal_amount)
    .bind(input.foreign_discount_amount)
    .bind(input.foreign_tax_amount)
    .bind(input.foreign_total_amount)
    .fetch_optional(&mut **tx)
    .await
}

async fn replace_sales_document_items(
    tx: &mut Transaction<'_, Postgres>,
    document_id: &str,
    items: Vec<SalesDocumentItemDto>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM sales_document_items WHERE document_id = $1")
        .bind(document_id)
        .execute(&mut **tx)
        .await?;

    for item in items {
        sqlx::query(
            r#"
            INSERT INTO sales_document_items (
                id,
                document_id,
                product_id,
                product_name,
                sku,
                unit,
                quantity,
                ordered_quantity,
                delivered_quantity,
                price,
                discount_type,
                discount_value,
                discount_amount,
                tax_id,
                tax_name,
                tax_code,
                tax_rate,
                tax_calculation_mode,
                tax_base_amount,
                tax_amount,
                subtotal,
                total_amount,
                purchase_price,
                original_price,
                is_price_edited,
                price_edited_by,
                price_edited_at,
                created_at,
                currency_code,
                exchange_rate,
                exchange_rate_source,
                exchange_rate_basis,
                exchange_rate_date,
                foreign_price,
                foreign_discount_amount,
                foreign_tax_base_amount,
                foreign_tax_amount,
                foreign_subtotal,
                foreign_total_amount
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
                $25,
                $26,
                $27::TIMESTAMPTZ,
                $28::TIMESTAMPTZ,
                $29,
                $30,
                $31,
                $32,
                $33,
                $34,
                $35,
                $36,
                $37,
                $38,
                $39
            )
            "#,
        )
        .bind(item.id)
        .bind(item.document_id)
        .bind(item.product_id)
        .bind(item.product_name)
        .bind(item.sku)
        .bind(item.unit)
        .bind(item.quantity)
        .bind(item.ordered_quantity)
        .bind(item.delivered_quantity)
        .bind(item.price)
        .bind(item.discount_type)
        .bind(item.discount_value)
        .bind(item.discount_amount)
        .bind(item.tax_id)
        .bind(item.tax_name)
        .bind(item.tax_code)
        .bind(item.tax_rate)
        .bind(item.tax_calculation_mode)
        .bind(item.tax_base_amount)
        .bind(item.tax_amount)
        .bind(item.subtotal)
        .bind(item.total_amount)
        .bind(item.purchase_price)
        .bind(item.original_price)
        .bind(item.is_price_edited)
        .bind(item.price_edited_by)
        .bind(item.price_edited_at)
        .bind(item.created_at)
        .bind(item.currency_code)
        .bind(item.exchange_rate)
        .bind(item.exchange_rate_source)
        .bind(item.exchange_rate_basis)
        .bind(item.exchange_rate_date)
        .bind(item.foreign_price)
        .bind(item.foreign_discount_amount)
        .bind(item.foreign_tax_base_amount)
        .bind(item.foreign_tax_amount)
        .bind(item.foreign_subtotal)
        .bind(item.foreign_total_amount)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}
