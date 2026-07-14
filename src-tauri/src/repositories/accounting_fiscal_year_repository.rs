use crate::models::accounting_fiscal_year::AccountingFiscalYearDto;
use sqlx::PgPool;

pub async fn list_accounting_fiscal_years(
    pool: &PgPool,
) -> Result<Vec<AccountingFiscalYearDto>, sqlx::Error> {
    sqlx::query_as::<_, AccountingFiscalYearDto>(
        r#"
        SELECT
            id,
            name,
            start_date::TEXT AS start_date,
            end_date::TEXT AS end_date,
            status,
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
        FROM accounting_fiscal_years
        ORDER BY start_date DESC, created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_accounting_fiscal_year(
    pool: &PgPool,
    id: String,
) -> Result<Option<AccountingFiscalYearDto>, sqlx::Error> {
    sqlx::query_as::<_, AccountingFiscalYearDto>(
        r#"
        SELECT
            id,
            name,
            start_date::TEXT AS start_date,
            end_date::TEXT AS end_date,
            status,
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
        FROM accounting_fiscal_years
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_accounting_fiscal_year(
    pool: &PgPool,
    input: AccountingFiscalYearDto,
) -> Result<AccountingFiscalYearDto, sqlx::Error> {
    let fiscal_year_id = input.id.clone();
    let upserted = sqlx::query_as::<_, AccountingFiscalYearDto>(
        r#"
        INSERT INTO accounting_fiscal_years (
            id,
            name,
            start_date,
            end_date,
            status,
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
            $3::DATE,
            $4::DATE,
            $5,
            $6::TIMESTAMPTZ,
            $7,
            $8,
            $9,
            $10::TIMESTAMPTZ,
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
            $21::TIMESTAMPTZ,
            $22::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            status = EXCLUDED.status,
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
            created_by = COALESCE(accounting_fiscal_years.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(accounting_fiscal_years.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE
            EXCLUDED.version > accounting_fiscal_years.version OR
            (
                EXCLUDED.version = accounting_fiscal_years.version AND
                EXCLUDED.updated_at >= accounting_fiscal_years.updated_at
            )
        RETURNING
            id,
            name,
            start_date::TEXT AS start_date,
            end_date::TEXT AS end_date,
            status,
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
    .bind(input.start_date)
    .bind(input.end_date)
    .bind(input.status)
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

    if let Some(fiscal_year) = upserted {
        return Ok(fiscal_year);
    }

    get_accounting_fiscal_year(pool, fiscal_year_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}
