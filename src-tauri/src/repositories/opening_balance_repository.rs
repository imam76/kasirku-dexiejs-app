use crate::models::opening_balance::{
    OpeningBalanceBatchDto, OpeningBalanceBundleDto, OpeningBalanceLineDto,
};
use sqlx::{PgPool, Postgres, Transaction};
use std::collections::HashMap;

const OPENING_BALANCE_BATCH_HARDENING_COLUMNS_SQL: &str = r#"
ALTER TABLE opening_balance_batches
    ADD COLUMN IF NOT EXISTS batch_number TEXT,
    ADD COLUMN IF NOT EXISTS company_id TEXT,
    ADD COLUMN IF NOT EXISTS company_name TEXT,
    ADD COLUMN IF NOT EXISTS accounting_start_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revision_number INTEGER,
    ADD COLUMN IF NOT EXISTS previous_batch_id TEXT,
    ADD COLUMN IF NOT EXISTS posting_idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS posted_by TEXT,
    ADD COLUMN IF NOT EXISTS posted_by_name TEXT,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversed_by TEXT,
    ADD COLUMN IF NOT EXISTS reversed_by_name TEXT,
    ADD COLUMN IF NOT EXISTS reversal_journal_entry_id TEXT,
    ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS validated_by TEXT,
    ADD COLUMN IF NOT EXISTS validated_by_name TEXT
"#;

macro_rules! opening_balance_batch_select {
    () => {
        r#"
        SELECT
            id,
            batch_number,
            company_id,
            company_name,
            module,
            cutoff_date::TEXT AS cutoff_date,
            accounting_start_date::TEXT AS accounting_start_date,
            status,
            revision_number,
            previous_batch_id,
            total_debit,
            total_credit,
            journal_entry_id,
            posting_idempotency_key,
            posted_at::TEXT AS posted_at,
            posted_by,
            posted_by_name,
            locked_at::TEXT AS locked_at,
            reversed_at::TEXT AS reversed_at,
            reversed_by,
            reversed_by_name,
            reversal_journal_entry_id,
            skipped_at::TEXT AS skipped_at,
            validated_at::TEXT AS validated_at,
            validated_by,
            validated_by_name,
            notes,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM opening_balance_batches
        "#
    };
}

macro_rules! opening_balance_line_select {
    () => {
        r#"
        SELECT
            id,
            batch_id,
            module,
            line_number,
            contact_id,
            party_name,
            document_number,
            document_date::TEXT AS document_date,
            due_date::TEXT AS due_date,
            currency_code,
            currency_name,
            currency_symbol,
            base_currency_code,
            fx_rate,
            amount,
            base_amount,
            paid_amount,
            remaining_amount,
            settlement_status,
            last_paid_at::TEXT AS last_paid_at,
            account_id,
            account_code,
            account_name,
            counter_account_id,
            counter_account_code,
            counter_account_name,
            debit,
            credit,
            notes,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM opening_balance_lines
        "#
    };
}

pub async fn list_opening_balance_bundles(
    pool: &PgPool,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<OpeningBalanceBundleDto>, sqlx::Error> {
    ensure_opening_balance_batch_hardening_columns(pool).await?;

    let limit = limit.unwrap_or(200).clamp(1, 500);
    let batches = sqlx::query_as::<_, OpeningBalanceBatchDto>(concat!(
        opening_balance_batch_select!(),
        r#"
        WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1::TIMESTAMPTZ)
        ORDER BY updated_at ASC, cutoff_date ASC, module ASC, id ASC
        LIMIT $2
        "#
    ))
    .bind(updated_after)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let batch_ids = batches
        .iter()
        .map(|batch| batch.id.clone())
        .collect::<Vec<_>>();
    let lines = list_opening_balance_lines_for_batches(pool, batch_ids).await?;
    let mut lines_by_batch_id = HashMap::<String, Vec<OpeningBalanceLineDto>>::new();
    for line in lines {
        lines_by_batch_id
            .entry(line.batch_id.clone())
            .or_default()
            .push(line);
    }

    let mut bundles = Vec::with_capacity(batches.len());
    for batch in batches {
        let lines = lines_by_batch_id.remove(&batch.id).unwrap_or_default();
        bundles.push(OpeningBalanceBundleDto { batch, lines });
    }

    Ok(bundles)
}

pub async fn get_opening_balance_bundle(
    pool: &PgPool,
    id: String,
) -> Result<Option<OpeningBalanceBundleDto>, sqlx::Error> {
    ensure_opening_balance_batch_hardening_columns(pool).await?;

    let batch = sqlx::query_as::<_, OpeningBalanceBatchDto>(concat!(
        opening_balance_batch_select!(),
        " WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;

    if let Some(batch) = batch {
        let lines = list_opening_balance_lines(pool, &batch.id).await?;
        return Ok(Some(OpeningBalanceBundleDto { batch, lines }));
    }

    Ok(None)
}

pub async fn upsert_opening_balance_bundle(
    pool: &PgPool,
    input: OpeningBalanceBundleDto,
) -> Result<OpeningBalanceBundleDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    ensure_opening_balance_batch_hardening_columns_in_tx(&mut tx).await?;
    let batch_id = input.batch.id.clone();

    let upserted_batch = upsert_opening_balance_batch(&mut tx, input.batch).await?;
    if let Some(batch) = upserted_batch {
        replace_opening_balance_lines(&mut tx, &batch.id, input.lines).await?;
        let lines = list_opening_balance_lines_in_tx(&mut tx, &batch.id).await?;
        tx.commit().await?;
        return Ok(OpeningBalanceBundleDto { batch, lines });
    }

    let batch = get_opening_balance_batch_in_tx(&mut tx, &batch_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let lines = list_opening_balance_lines_in_tx(&mut tx, &batch.id).await?;
    tx.commit().await?;

    Ok(OpeningBalanceBundleDto { batch, lines })
}

async fn ensure_opening_balance_batch_hardening_columns(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(OPENING_BALANCE_BATCH_HARDENING_COLUMNS_SQL)
        .execute(pool)
        .await?;

    Ok(())
}

async fn ensure_opening_balance_batch_hardening_columns_in_tx(
    tx: &mut Transaction<'_, Postgres>,
) -> Result<(), sqlx::Error> {
    sqlx::query(OPENING_BALANCE_BATCH_HARDENING_COLUMNS_SQL)
        .execute(&mut **tx)
        .await?;

    Ok(())
}

async fn list_opening_balance_lines(
    pool: &PgPool,
    batch_id: &str,
) -> Result<Vec<OpeningBalanceLineDto>, sqlx::Error> {
    sqlx::query_as::<_, OpeningBalanceLineDto>(concat!(
        opening_balance_line_select!(),
        " WHERE batch_id = $1 ORDER BY line_number ASC, created_at ASC, id ASC"
    ))
    .bind(batch_id)
    .fetch_all(pool)
    .await
}

async fn list_opening_balance_lines_for_batches(
    pool: &PgPool,
    batch_ids: Vec<String>,
) -> Result<Vec<OpeningBalanceLineDto>, sqlx::Error> {
    if batch_ids.is_empty() {
        return Ok(Vec::new());
    }

    sqlx::query_as::<_, OpeningBalanceLineDto>(concat!(
        opening_balance_line_select!(),
        " WHERE batch_id = ANY($1) ORDER BY batch_id ASC, line_number ASC, created_at ASC, id ASC"
    ))
    .bind(batch_ids)
    .fetch_all(pool)
    .await
}

async fn list_opening_balance_lines_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    batch_id: &str,
) -> Result<Vec<OpeningBalanceLineDto>, sqlx::Error> {
    sqlx::query_as::<_, OpeningBalanceLineDto>(concat!(
        opening_balance_line_select!(),
        " WHERE batch_id = $1 ORDER BY line_number ASC, created_at ASC, id ASC"
    ))
    .bind(batch_id)
    .fetch_all(&mut **tx)
    .await
}

async fn get_opening_balance_batch_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    batch_id: &str,
) -> Result<Option<OpeningBalanceBatchDto>, sqlx::Error> {
    sqlx::query_as::<_, OpeningBalanceBatchDto>(concat!(
        opening_balance_batch_select!(),
        " WHERE id = $1"
    ))
    .bind(batch_id)
    .fetch_optional(&mut **tx)
    .await
}

async fn upsert_opening_balance_batch(
    tx: &mut Transaction<'_, Postgres>,
    input: OpeningBalanceBatchDto,
) -> Result<Option<OpeningBalanceBatchDto>, sqlx::Error> {
    sqlx::query_as::<_, OpeningBalanceBatchDto>(
        r#"
        INSERT INTO opening_balance_batches (
            id,
            batch_number,
            company_id,
            company_name,
            module,
            cutoff_date,
            accounting_start_date,
            status,
            revision_number,
            previous_batch_id,
            total_debit,
            total_credit,
            journal_entry_id,
            posting_idempotency_key,
            posted_at,
            posted_by,
            posted_by_name,
            locked_at,
            reversed_at,
            reversed_by,
            reversed_by_name,
            reversal_journal_entry_id,
            skipped_at,
            validated_at,
            validated_by,
            validated_by_name,
            notes,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::TIMESTAMPTZ,
            $7::TIMESTAMPTZ,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15::TIMESTAMPTZ,
            $16,
            $17,
            $18::TIMESTAMPTZ,
            $19::TIMESTAMPTZ,
            $20,
            $21,
            $22,
            $23::TIMESTAMPTZ,
            $24::TIMESTAMPTZ,
            $25,
            $26,
            $27,
            $28,
            $29,
            $30,
            $31,
            $32,
            $33::TIMESTAMPTZ,
            $34::TIMESTAMPTZ,
            $35::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            batch_number = EXCLUDED.batch_number,
            company_id = EXCLUDED.company_id,
            company_name = EXCLUDED.company_name,
            module = EXCLUDED.module,
            cutoff_date = EXCLUDED.cutoff_date,
            accounting_start_date = EXCLUDED.accounting_start_date,
            status = EXCLUDED.status,
            revision_number = EXCLUDED.revision_number,
            previous_batch_id = EXCLUDED.previous_batch_id,
            total_debit = EXCLUDED.total_debit,
            total_credit = EXCLUDED.total_credit,
            journal_entry_id = EXCLUDED.journal_entry_id,
            posting_idempotency_key = EXCLUDED.posting_idempotency_key,
            posted_at = EXCLUDED.posted_at,
            posted_by = EXCLUDED.posted_by,
            posted_by_name = EXCLUDED.posted_by_name,
            locked_at = EXCLUDED.locked_at,
            reversed_at = EXCLUDED.reversed_at,
            reversed_by = EXCLUDED.reversed_by,
            reversed_by_name = EXCLUDED.reversed_by_name,
            reversal_journal_entry_id = EXCLUDED.reversal_journal_entry_id,
            skipped_at = EXCLUDED.skipped_at,
            validated_at = EXCLUDED.validated_at,
            validated_by = EXCLUDED.validated_by,
            validated_by_name = EXCLUDED.validated_by_name,
            notes = EXCLUDED.notes,
            version = EXCLUDED.version,
            created_by = COALESCE(opening_balance_batches.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(opening_balance_batches.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE
            EXCLUDED.version > opening_balance_batches.version OR
            (
                EXCLUDED.version = opening_balance_batches.version AND
                EXCLUDED.updated_at >= opening_balance_batches.updated_at
            )
        RETURNING
            id,
            batch_number,
            company_id,
            company_name,
            module,
            cutoff_date::TEXT AS cutoff_date,
            accounting_start_date::TEXT AS accounting_start_date,
            status,
            revision_number,
            previous_batch_id,
            total_debit,
            total_credit,
            journal_entry_id,
            posting_idempotency_key,
            posted_at::TEXT AS posted_at,
            posted_by,
            posted_by_name,
            locked_at::TEXT AS locked_at,
            reversed_at::TEXT AS reversed_at,
            reversed_by,
            reversed_by_name,
            reversal_journal_entry_id,
            skipped_at::TEXT AS skipped_at,
            validated_at::TEXT AS validated_at,
            validated_by,
            validated_by_name,
            notes,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#,
    )
    .bind(input.id)
    .bind(input.batch_number)
    .bind(input.company_id)
    .bind(input.company_name)
    .bind(input.module)
    .bind(input.cutoff_date)
    .bind(input.accounting_start_date)
    .bind(input.status)
    .bind(input.revision_number)
    .bind(input.previous_batch_id)
    .bind(input.total_debit)
    .bind(input.total_credit)
    .bind(input.journal_entry_id)
    .bind(input.posting_idempotency_key)
    .bind(input.posted_at)
    .bind(input.posted_by)
    .bind(input.posted_by_name)
    .bind(input.locked_at)
    .bind(input.reversed_at)
    .bind(input.reversed_by)
    .bind(input.reversed_by_name)
    .bind(input.reversal_journal_entry_id)
    .bind(input.skipped_at)
    .bind(input.validated_at)
    .bind(input.validated_by)
    .bind(input.validated_by_name)
    .bind(input.notes)
    .bind(input.version)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.updated_by)
    .bind(input.updated_by_name)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(&mut **tx)
    .await
}

async fn replace_opening_balance_lines(
    tx: &mut Transaction<'_, Postgres>,
    batch_id: &str,
    lines: Vec<OpeningBalanceLineDto>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM opening_balance_lines WHERE batch_id = $1")
        .bind(batch_id)
        .execute(&mut **tx)
        .await?;

    for line in lines {
        sqlx::query(
            r#"
            INSERT INTO opening_balance_lines (
                id,
                batch_id,
                module,
                line_number,
                contact_id,
                party_name,
                document_number,
                document_date,
                due_date,
                currency_code,
                currency_name,
                currency_symbol,
                base_currency_code,
                fx_rate,
                amount,
                base_amount,
                paid_amount,
                remaining_amount,
                settlement_status,
                last_paid_at,
                account_id,
                account_code,
                account_name,
                counter_account_id,
                counter_account_code,
                counter_account_name,
                debit,
                credit,
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
                $8::TIMESTAMPTZ,
                $9::TIMESTAMPTZ,
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
                $20::TIMESTAMPTZ,
                $21,
                $22,
                $23,
                $24,
                $25,
                $26,
                $27,
                $28,
                $29,
                $30::TIMESTAMPTZ,
                $31::TIMESTAMPTZ
            )
            "#,
        )
        .bind(line.id)
        .bind(line.batch_id)
        .bind(line.module)
        .bind(line.line_number)
        .bind(line.contact_id)
        .bind(line.party_name)
        .bind(line.document_number)
        .bind(line.document_date)
        .bind(line.due_date)
        .bind(line.currency_code)
        .bind(line.currency_name)
        .bind(line.currency_symbol)
        .bind(line.base_currency_code)
        .bind(line.fx_rate)
        .bind(line.amount)
        .bind(line.base_amount)
        .bind(line.paid_amount)
        .bind(line.remaining_amount)
        .bind(line.settlement_status)
        .bind(line.last_paid_at)
        .bind(line.account_id)
        .bind(line.account_code)
        .bind(line.account_name)
        .bind(line.counter_account_id)
        .bind(line.counter_account_code)
        .bind(line.counter_account_name)
        .bind(line.debit)
        .bind(line.credit)
        .bind(line.notes)
        .bind(line.created_at)
        .bind(line.updated_at)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}
