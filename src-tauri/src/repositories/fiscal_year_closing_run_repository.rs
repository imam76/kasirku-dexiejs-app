use crate::models::fiscal_year_closing_run::FiscalYearClosingRunDto;
use sqlx::PgPool;

pub async fn list_fiscal_year_closing_runs(
    pool: &PgPool,
) -> Result<Vec<FiscalYearClosingRunDto>, sqlx::Error> {
    sqlx::query_as::<_, FiscalYearClosingRunDto>(
        r#"
        SELECT
            id,
            fiscal_year_id,
            fiscal_year_name,
            start_date::TEXT AS start_date,
            end_date::TEXT AS end_date,
            status,
            retained_earning_account_id,
            retained_earning_account_code,
            retained_earning_account_name,
            net_income_amount,
            total_revenue_amount,
            total_contra_revenue_amount,
            total_expense_amount,
            closing_journal_entry_id,
            posted_at::TEXT AS posted_at,
            reversed_at::TEXT AS reversed_at,
            reversed_by,
            reversed_by_name,
            reversal_journal_entry_id,
            reversal_reason,
            notes,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM fiscal_year_closing_runs
        ORDER BY start_date DESC, created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_fiscal_year_closing_run(
    pool: &PgPool,
    id: String,
) -> Result<Option<FiscalYearClosingRunDto>, sqlx::Error> {
    sqlx::query_as::<_, FiscalYearClosingRunDto>(
        r#"
        SELECT
            id,
            fiscal_year_id,
            fiscal_year_name,
            start_date::TEXT AS start_date,
            end_date::TEXT AS end_date,
            status,
            retained_earning_account_id,
            retained_earning_account_code,
            retained_earning_account_name,
            net_income_amount,
            total_revenue_amount,
            total_contra_revenue_amount,
            total_expense_amount,
            closing_journal_entry_id,
            posted_at::TEXT AS posted_at,
            reversed_at::TEXT AS reversed_at,
            reversed_by,
            reversed_by_name,
            reversal_journal_entry_id,
            reversal_reason,
            notes,
            version,
            created_by,
            created_by_name,
            updated_by,
            updated_by_name,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM fiscal_year_closing_runs
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_fiscal_year_closing_run(
    pool: &PgPool,
    input: FiscalYearClosingRunDto,
) -> Result<FiscalYearClosingRunDto, sqlx::Error> {
    let run_id = input.id.clone();
    let upserted = sqlx::query_as::<_, FiscalYearClosingRunDto>(
        r#"
        INSERT INTO fiscal_year_closing_runs (
            id,
            fiscal_year_id,
            fiscal_year_name,
            start_date,
            end_date,
            status,
            retained_earning_account_id,
            retained_earning_account_code,
            retained_earning_account_name,
            net_income_amount,
            total_revenue_amount,
            total_contra_revenue_amount,
            total_expense_amount,
            closing_journal_entry_id,
            posted_at,
            reversed_at,
            reversed_by,
            reversed_by_name,
            reversal_journal_entry_id,
            reversal_reason,
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
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15::TIMESTAMPTZ,
            $16::TIMESTAMPTZ,
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
            $29::TIMESTAMPTZ
        )
        ON CONFLICT (id) DO UPDATE SET
            fiscal_year_id = EXCLUDED.fiscal_year_id,
            fiscal_year_name = EXCLUDED.fiscal_year_name,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            status = EXCLUDED.status,
            retained_earning_account_id = EXCLUDED.retained_earning_account_id,
            retained_earning_account_code = EXCLUDED.retained_earning_account_code,
            retained_earning_account_name = EXCLUDED.retained_earning_account_name,
            net_income_amount = EXCLUDED.net_income_amount,
            total_revenue_amount = EXCLUDED.total_revenue_amount,
            total_contra_revenue_amount = EXCLUDED.total_contra_revenue_amount,
            total_expense_amount = EXCLUDED.total_expense_amount,
            closing_journal_entry_id = EXCLUDED.closing_journal_entry_id,
            posted_at = EXCLUDED.posted_at,
            reversed_at = EXCLUDED.reversed_at,
            reversed_by = EXCLUDED.reversed_by,
            reversed_by_name = EXCLUDED.reversed_by_name,
            reversal_journal_entry_id = EXCLUDED.reversal_journal_entry_id,
            reversal_reason = EXCLUDED.reversal_reason,
            notes = EXCLUDED.notes,
            version = EXCLUDED.version,
            created_by = COALESCE(fiscal_year_closing_runs.created_by, EXCLUDED.created_by),
            created_by_name = COALESCE(fiscal_year_closing_runs.created_by_name, EXCLUDED.created_by_name),
            updated_by = EXCLUDED.updated_by,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        WHERE
            EXCLUDED.version > fiscal_year_closing_runs.version OR
            (
                EXCLUDED.version = fiscal_year_closing_runs.version AND
                EXCLUDED.updated_at >= fiscal_year_closing_runs.updated_at
            )
        RETURNING
            id,
            fiscal_year_id,
            fiscal_year_name,
            start_date::TEXT AS start_date,
            end_date::TEXT AS end_date,
            status,
            retained_earning_account_id,
            retained_earning_account_code,
            retained_earning_account_name,
            net_income_amount,
            total_revenue_amount,
            total_contra_revenue_amount,
            total_expense_amount,
            closing_journal_entry_id,
            posted_at::TEXT AS posted_at,
            reversed_at::TEXT AS reversed_at,
            reversed_by,
            reversed_by_name,
            reversal_journal_entry_id,
            reversal_reason,
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
    .bind(input.fiscal_year_id)
    .bind(input.fiscal_year_name)
    .bind(input.start_date)
    .bind(input.end_date)
    .bind(input.status)
    .bind(input.retained_earning_account_id)
    .bind(input.retained_earning_account_code)
    .bind(input.retained_earning_account_name)
    .bind(input.net_income_amount)
    .bind(input.total_revenue_amount)
    .bind(input.total_contra_revenue_amount)
    .bind(input.total_expense_amount)
    .bind(input.closing_journal_entry_id)
    .bind(input.posted_at)
    .bind(input.reversed_at)
    .bind(input.reversed_by)
    .bind(input.reversed_by_name)
    .bind(input.reversal_journal_entry_id)
    .bind(input.reversal_reason)
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

    if let Some(run) = upserted {
        return Ok(run);
    }

    get_fiscal_year_closing_run(pool, run_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}
