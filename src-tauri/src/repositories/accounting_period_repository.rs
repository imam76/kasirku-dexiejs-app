use crate::models::accounting_period::AccountingPeriodDto;
use sqlx::PgPool;

pub async fn list_accounting_periods(
    pool: &PgPool,
) -> Result<Vec<AccountingPeriodDto>, sqlx::Error> {
    sqlx::query_as::<_, AccountingPeriodDto>(
        r#"
        SELECT
            id,
            name,
            period_type,
            start_date::TEXT AS start_date,
            end_date::TEXT AS end_date,
            status,
            locked_at::TEXT AS locked_at,
            locked_by,
            locked_by_name,
            closed_at::TEXT AS closed_at,
            closed_by,
            closed_by_name,
            closing_journal_entry_id,
            reopened_at::TEXT AS reopened_at,
            reopened_by,
            reopened_by_name,
            reopen_reason,
            notes,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM accounting_periods
        ORDER BY start_date DESC, created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_accounting_period(
    pool: &PgPool,
    id: String,
) -> Result<Option<AccountingPeriodDto>, sqlx::Error> {
    sqlx::query_as::<_, AccountingPeriodDto>(
        r#"
        SELECT
            id,
            name,
            period_type,
            start_date::TEXT AS start_date,
            end_date::TEXT AS end_date,
            status,
            locked_at::TEXT AS locked_at,
            locked_by,
            locked_by_name,
            closed_at::TEXT AS closed_at,
            closed_by,
            closed_by_name,
            closing_journal_entry_id,
            reopened_at::TEXT AS reopened_at,
            reopened_by,
            reopened_by_name,
            reopen_reason,
            notes,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM accounting_periods
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_accounting_period(
    pool: &PgPool,
    input: AccountingPeriodDto,
) -> Result<AccountingPeriodDto, sqlx::Error> {
    let period_id = input.id.clone();
    let upserted_period = sqlx::query_as::<_, AccountingPeriodDto>(
        r#"
        INSERT INTO accounting_periods (
            id,
            name,
            period_type,
            start_date,
            end_date,
            status,
            locked_at,
            locked_by,
            locked_by_name,
            closed_at,
            closed_by,
            closed_by_name,
            closing_journal_entry_id,
            reopened_at,
            reopened_by,
            reopened_by_name,
            reopen_reason,
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
            $4::DATE,
            $5::DATE,
            $6,
            $7::TIMESTAMPTZ,
            $8,
            $9,
            $10::TIMESTAMPTZ,
            $11,
            $12,
            $13,
            $14::TIMESTAMPTZ,
            $15,
            $16,
            $17,
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
            name = EXCLUDED.name,
            period_type = EXCLUDED.period_type,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            status = EXCLUDED.status,
            locked_at = EXCLUDED.locked_at,
            locked_by = EXCLUDED.locked_by,
            locked_by_name = EXCLUDED.locked_by_name,
            closed_at = EXCLUDED.closed_at,
            closed_by = EXCLUDED.closed_by,
            closed_by_name = EXCLUDED.closed_by_name,
            closing_journal_entry_id = EXCLUDED.closing_journal_entry_id,
            reopened_at = EXCLUDED.reopened_at,
            reopened_by = EXCLUDED.reopened_by,
            reopened_by_name = EXCLUDED.reopened_by_name,
            reopen_reason = EXCLUDED.reopen_reason,
            notes = EXCLUDED.notes,
            version = EXCLUDED.version,
            created_by = COALESCE(accounting_periods.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(accounting_periods.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE
            EXCLUDED.version > accounting_periods.version OR
            (
                EXCLUDED.version = accounting_periods.version AND
                EXCLUDED.updated_at >= accounting_periods.updated_at
            )
        RETURNING
            id,
            name,
            period_type,
            start_date::TEXT AS start_date,
            end_date::TEXT AS end_date,
            status,
            locked_at::TEXT AS locked_at,
            locked_by,
            locked_by_name,
            closed_at::TEXT AS closed_at,
            closed_by,
            closed_by_name,
            closing_journal_entry_id,
            reopened_at::TEXT AS reopened_at,
            reopened_by,
            reopened_by_name,
            reopen_reason,
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
    .bind(input.name)
    .bind(input.period_type)
    .bind(input.start_date)
    .bind(input.end_date)
    .bind(input.status)
    .bind(input.locked_at)
    .bind(input.locked_by)
    .bind(input.locked_by_name)
    .bind(input.closed_at)
    .bind(input.closed_by)
    .bind(input.closed_by_name)
    .bind(input.closing_journal_entry_id)
    .bind(input.reopened_at)
    .bind(input.reopened_by)
    .bind(input.reopened_by_name)
    .bind(input.reopen_reason)
    .bind(input.notes)
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

    if let Some(period) = upserted_period {
        return Ok(period);
    }

    get_accounting_period(pool, period_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}
