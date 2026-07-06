use crate::models::cash_bank_reconciliation::CashBankReconciliationDto;
use sqlx::PgPool;

pub async fn list_cash_bank_reconciliations(
    pool: &PgPool,
) -> Result<Vec<CashBankReconciliationDto>, sqlx::Error> {
    sqlx::query_as::<_, CashBankReconciliationDto>(
        r#"
        SELECT
            id,
            reconciliation_number,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            statement_date::TEXT AS statement_date,
            statement_reference,
            statement_ending_balance,
            book_balance_amount,
            cleared_balance_amount,
            selected_transaction_total_amount,
            selected_transaction_count,
            selected_transaction_ids,
            difference_amount,
            status,
            notes,
            voided_at::TEXT AS voided_at,
            void_reason,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM cash_bank_reconciliations
        ORDER BY statement_date DESC, created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_cash_bank_reconciliation(
    pool: &PgPool,
    id: String,
) -> Result<Option<CashBankReconciliationDto>, sqlx::Error> {
    sqlx::query_as::<_, CashBankReconciliationDto>(
        r#"
        SELECT
            id,
            reconciliation_number,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            statement_date::TEXT AS statement_date,
            statement_reference,
            statement_ending_balance,
            book_balance_amount,
            cleared_balance_amount,
            selected_transaction_total_amount,
            selected_transaction_count,
            selected_transaction_ids,
            difference_amount,
            status,
            notes,
            voided_at::TEXT AS voided_at,
            void_reason,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM cash_bank_reconciliations
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_cash_bank_reconciliation(
    pool: &PgPool,
    input: CashBankReconciliationDto,
) -> Result<CashBankReconciliationDto, sqlx::Error> {
    let reconciliation_id = input.id.clone();
    let upserted_reconciliation = sqlx::query_as::<_, CashBankReconciliationDto>(
        r#"
        INSERT INTO cash_bank_reconciliations (
            id,
            reconciliation_number,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            statement_date,
            statement_reference,
            statement_ending_balance,
            book_balance_amount,
            cleared_balance_amount,
            selected_transaction_total_amount,
            selected_transaction_count,
            selected_transaction_ids,
            difference_amount,
            status,
            notes,
            voided_at,
            void_reason,
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
            $17::TIMESTAMPTZ,
            $18,
            $19,
            $20,
            $21,
            $22,
            $23,
            $24::TIMESTAMPTZ,
            $25::TIMESTAMPTZ,
            $26::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            reconciliation_number = EXCLUDED.reconciliation_number,
            cash_account_id = EXCLUDED.cash_account_id,
            cash_account_code = EXCLUDED.cash_account_code,
            cash_account_name = EXCLUDED.cash_account_name,
            statement_date = EXCLUDED.statement_date,
            statement_reference = EXCLUDED.statement_reference,
            statement_ending_balance = EXCLUDED.statement_ending_balance,
            book_balance_amount = EXCLUDED.book_balance_amount,
            cleared_balance_amount = EXCLUDED.cleared_balance_amount,
            selected_transaction_total_amount = EXCLUDED.selected_transaction_total_amount,
            selected_transaction_count = EXCLUDED.selected_transaction_count,
            selected_transaction_ids = EXCLUDED.selected_transaction_ids,
            difference_amount = EXCLUDED.difference_amount,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            voided_at = EXCLUDED.voided_at,
            void_reason = EXCLUDED.void_reason,
            version = EXCLUDED.version,
            created_by = COALESCE(cash_bank_reconciliations.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(cash_bank_reconciliations.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE
            EXCLUDED.version > cash_bank_reconciliations.version OR
            (
                EXCLUDED.version = cash_bank_reconciliations.version AND
                EXCLUDED.updated_at >= cash_bank_reconciliations.updated_at
            )
        RETURNING
            id,
            reconciliation_number,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            statement_date::TEXT AS statement_date,
            statement_reference,
            statement_ending_balance,
            book_balance_amount,
            cleared_balance_amount,
            selected_transaction_total_amount,
            selected_transaction_count,
            selected_transaction_ids,
            difference_amount,
            status,
            notes,
            voided_at::TEXT AS voided_at,
            void_reason,
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
    .bind(input.reconciliation_number)
    .bind(input.cash_account_id)
    .bind(input.cash_account_code)
    .bind(input.cash_account_name)
    .bind(input.statement_date)
    .bind(input.statement_reference)
    .bind(input.statement_ending_balance)
    .bind(input.book_balance_amount)
    .bind(input.cleared_balance_amount)
    .bind(input.selected_transaction_total_amount)
    .bind(input.selected_transaction_count)
    .bind(input.selected_transaction_ids)
    .bind(input.difference_amount)
    .bind(input.status)
    .bind(input.notes)
    .bind(input.voided_at)
    .bind(input.void_reason)
    .bind(input.version)
    .bind(input.created_by)
    .bind(input.created_by_name)
    .bind(input.updated_by)
    .bind(input.updated_by_name)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_optional(pool)
    .await?;

    if let Some(reconciliation) = upserted_reconciliation {
        return Ok(reconciliation);
    }

    get_cash_bank_reconciliation(pool, reconciliation_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}
