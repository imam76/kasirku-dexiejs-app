use crate::models::finance_transaction::FinanceTransactionDto;
use sqlx::PgPool;

pub async fn list_finance_transactions(
    pool: &PgPool,
) -> Result<Vec<FinanceTransactionDto>, sqlx::Error> {
    sqlx::query_as::<_, FinanceTransactionDto>(
        r#"
        SELECT
            id,
            type,
            category,
            amount,
            description,
            reference_id,
            account_id,
            account_code,
            account_name,
            account_type,
            payment_method,
            payment_channel,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            transfer_group_id,
            transfer_direction,
            reversal_of_transfer_group_id,
            field_cash_session_id,
            field_cash_session_number,
            field_employee_id,
            field_employee_name,
            field_cash_movement_kind,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM finance_transactions
        ORDER BY created_at DESC, updated_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_finance_transaction(
    pool: &PgPool,
    id: String,
) -> Result<Option<FinanceTransactionDto>, sqlx::Error> {
    sqlx::query_as::<_, FinanceTransactionDto>(
        r#"
        SELECT
            id,
            type,
            category,
            amount,
            description,
            reference_id,
            account_id,
            account_code,
            account_name,
            account_type,
            payment_method,
            payment_channel,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            transfer_group_id,
            transfer_direction,
            reversal_of_transfer_group_id,
            field_cash_session_id,
            field_cash_session_number,
            field_employee_id,
            field_employee_name,
            field_cash_movement_kind,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM finance_transactions
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_finance_transaction(
    pool: &PgPool,
    input: FinanceTransactionDto,
) -> Result<FinanceTransactionDto, sqlx::Error> {
    let transaction_id = input.id.clone();
    let upserted_transaction = sqlx::query_as::<_, FinanceTransactionDto>(
        r#"
        INSERT INTO finance_transactions (
            id,
            type,
            category,
            amount,
            description,
            reference_id,
            account_id,
            account_code,
            account_name,
            account_type,
            payment_method,
            payment_channel,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            transfer_group_id,
            transfer_direction,
            reversal_of_transfer_group_id,
            field_cash_session_id,
            field_cash_session_number,
            field_employee_id,
            field_employee_name,
            field_cash_movement_kind,
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
            $29::TIMESTAMPTZ,
            $30::TIMESTAMPTZ,
            $31::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            category = EXCLUDED.category,
            amount = EXCLUDED.amount,
            description = EXCLUDED.description,
            reference_id = EXCLUDED.reference_id,
            account_id = EXCLUDED.account_id,
            account_code = EXCLUDED.account_code,
            account_name = EXCLUDED.account_name,
            account_type = EXCLUDED.account_type,
            payment_method = EXCLUDED.payment_method,
            payment_channel = EXCLUDED.payment_channel,
            cash_account_id = EXCLUDED.cash_account_id,
            cash_account_code = EXCLUDED.cash_account_code,
            cash_account_name = EXCLUDED.cash_account_name,
            transfer_group_id = EXCLUDED.transfer_group_id,
            transfer_direction = EXCLUDED.transfer_direction,
            reversal_of_transfer_group_id = EXCLUDED.reversal_of_transfer_group_id,
            field_cash_session_id = EXCLUDED.field_cash_session_id,
            field_cash_session_number = EXCLUDED.field_cash_session_number,
            field_employee_id = EXCLUDED.field_employee_id,
            field_employee_name = EXCLUDED.field_employee_name,
            field_cash_movement_kind = EXCLUDED.field_cash_movement_kind,
            version = EXCLUDED.version,
            created_by = COALESCE(finance_transactions.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(finance_transactions.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE
            EXCLUDED.version > finance_transactions.version OR
            (
                EXCLUDED.version = finance_transactions.version AND
                EXCLUDED.updated_at >= finance_transactions.updated_at
            )
        RETURNING
            id,
            type,
            category,
            amount,
            description,
            reference_id,
            account_id,
            account_code,
            account_name,
            account_type,
            payment_method,
            payment_channel,
            cash_account_id,
            cash_account_code,
            cash_account_name,
            transfer_group_id,
            transfer_direction,
            reversal_of_transfer_group_id,
            field_cash_session_id,
            field_cash_session_number,
            field_employee_id,
            field_employee_name,
            field_cash_movement_kind,
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
    .bind(input.r#type)
    .bind(input.category)
    .bind(input.amount)
    .bind(input.description)
    .bind(input.reference_id)
    .bind(input.account_id)
    .bind(input.account_code)
    .bind(input.account_name)
    .bind(input.account_type)
    .bind(input.payment_method)
    .bind(input.payment_channel)
    .bind(input.cash_account_id)
    .bind(input.cash_account_code)
    .bind(input.cash_account_name)
    .bind(input.transfer_group_id)
    .bind(input.transfer_direction)
    .bind(input.reversal_of_transfer_group_id)
    .bind(input.field_cash_session_id)
    .bind(input.field_cash_session_number)
    .bind(input.field_employee_id)
    .bind(input.field_employee_name)
    .bind(input.field_cash_movement_kind)
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

    if let Some(transaction) = upserted_transaction {
        return Ok(transaction);
    }

    get_finance_transaction(pool, transaction_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}
