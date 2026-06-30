use crate::models::cashier_session::CashierSessionDto;
use sqlx::PgPool;

pub async fn list_cashier_sessions(pool: &PgPool) -> Result<Vec<CashierSessionDto>, sqlx::Error> {
    sqlx::query_as::<_, CashierSessionDto>(
        r#"
        SELECT
            id,
            session_number,
            status,
            cashier_user_id,
            cashier_user_name,
            opened_at::TEXT AS opened_at,
            opening_cash_amount,
            opening_note,
            closed_at::TEXT AS closed_at,
            closed_by_user_id,
            closed_by_user_name,
            closing_cash_amount,
            closing_note,
            expected_cash_amount,
            cash_sales_amount,
            non_cash_sales_amount,
            total_sales_amount,
            voided_sales_amount,
            transaction_count,
            voided_transaction_count,
            cash_difference_amount,
            balance_status,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM cashier_sessions
        ORDER BY opened_at DESC, created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_cashier_session(
    pool: &PgPool,
    id: String,
) -> Result<Option<CashierSessionDto>, sqlx::Error> {
    sqlx::query_as::<_, CashierSessionDto>(
        r#"
        SELECT
            id,
            session_number,
            status,
            cashier_user_id,
            cashier_user_name,
            opened_at::TEXT AS opened_at,
            opening_cash_amount,
            opening_note,
            closed_at::TEXT AS closed_at,
            closed_by_user_id,
            closed_by_user_name,
            closing_cash_amount,
            closing_note,
            expected_cash_amount,
            cash_sales_amount,
            non_cash_sales_amount,
            total_sales_amount,
            voided_sales_amount,
            transaction_count,
            voided_transaction_count,
            cash_difference_amount,
            balance_status,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        FROM cashier_sessions
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_cashier_session(
    pool: &PgPool,
    input: CashierSessionDto,
) -> Result<CashierSessionDto, sqlx::Error> {
    let session_id = input.id.clone();
    let upserted_session = sqlx::query_as::<_, CashierSessionDto>(
        r#"
        INSERT INTO cashier_sessions (
            id,
            session_number,
            status,
            cashier_user_id,
            cashier_user_name,
            opened_at,
            opening_cash_amount,
            opening_note,
            closed_at,
            closed_by_user_id,
            closed_by_user_name,
            closing_cash_amount,
            closing_note,
            expected_cash_amount,
            cash_sales_amount,
            non_cash_sales_amount,
            total_sales_amount,
            voided_sales_amount,
            transaction_count,
            voided_transaction_count,
            cash_difference_amount,
            balance_status,
            created_at,
            updated_at
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
            $20,
            $21,
            $22,
            $23::TIMESTAMPTZ,
            $24::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            session_number = EXCLUDED.session_number,
            status = EXCLUDED.status,
            cashier_user_id = EXCLUDED.cashier_user_id,
            cashier_user_name = EXCLUDED.cashier_user_name,
            opened_at = EXCLUDED.opened_at,
            opening_cash_amount = EXCLUDED.opening_cash_amount,
            opening_note = EXCLUDED.opening_note,
            closed_at = EXCLUDED.closed_at,
            closed_by_user_id = EXCLUDED.closed_by_user_id,
            closed_by_user_name = EXCLUDED.closed_by_user_name,
            closing_cash_amount = EXCLUDED.closing_cash_amount,
            closing_note = EXCLUDED.closing_note,
            expected_cash_amount = EXCLUDED.expected_cash_amount,
            cash_sales_amount = EXCLUDED.cash_sales_amount,
            non_cash_sales_amount = EXCLUDED.non_cash_sales_amount,
            total_sales_amount = EXCLUDED.total_sales_amount,
            voided_sales_amount = EXCLUDED.voided_sales_amount,
            transaction_count = EXCLUDED.transaction_count,
            voided_transaction_count = EXCLUDED.voided_transaction_count,
            cash_difference_amount = EXCLUDED.cash_difference_amount,
            balance_status = EXCLUDED.balance_status,
            updated_at = EXCLUDED.updated_at
        WHERE EXCLUDED.updated_at >= cashier_sessions.updated_at
        RETURNING
            id,
            session_number,
            status,
            cashier_user_id,
            cashier_user_name,
            opened_at::TEXT AS opened_at,
            opening_cash_amount,
            opening_note,
            closed_at::TEXT AS closed_at,
            closed_by_user_id,
            closed_by_user_name,
            closing_cash_amount,
            closing_note,
            expected_cash_amount,
            cash_sales_amount,
            non_cash_sales_amount,
            total_sales_amount,
            voided_sales_amount,
            transaction_count,
            voided_transaction_count,
            cash_difference_amount,
            balance_status,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at
        "#,
    )
    .bind(input.id)
    .bind(input.session_number)
    .bind(input.status)
    .bind(input.cashier_user_id)
    .bind(input.cashier_user_name)
    .bind(input.opened_at)
    .bind(input.opening_cash_amount)
    .bind(input.opening_note)
    .bind(input.closed_at)
    .bind(input.closed_by_user_id)
    .bind(input.closed_by_user_name)
    .bind(input.closing_cash_amount)
    .bind(input.closing_note)
    .bind(input.expected_cash_amount)
    .bind(input.cash_sales_amount)
    .bind(input.non_cash_sales_amount)
    .bind(input.total_sales_amount)
    .bind(input.voided_sales_amount)
    .bind(input.transaction_count)
    .bind(input.voided_transaction_count)
    .bind(input.cash_difference_amount)
    .bind(input.balance_status)
    .bind(input.created_at)
    .bind(input.updated_at)
    .fetch_optional(pool)
    .await?;

    if let Some(session) = upserted_session {
        return Ok(session);
    }

    get_cashier_session(pool, session_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}
