use crate::models::fixed_asset::{
    FixedAssetDepreciationRunBundleDto, FixedAssetDepreciationRunDto,
    FixedAssetDepreciationRunLineDto, FixedAssetDto,
};
use sqlx::{PgPool, Postgres, Transaction};

const ASSET_SELECT: &str = r#"
SELECT id, asset_code, name, category, location, description, registration_type,
       acquisition_date::TEXT AS acquisition_date,
       available_for_use_date::TEXT AS available_for_use_date,
       acquisition_cost, residual_value, useful_life_months, depreciation_method,
       depreciation_start_date::TEXT AS depreciation_start_date,
       regular_depreciation_amount,
       opening_balance_date::TEXT AS opening_balance_date,
       opening_accumulated_depreciation, opening_remaining_useful_life_months,
       asset_account_id, asset_account_code, asset_account_name,
       accumulated_depreciation_account_id, accumulated_depreciation_account_code,
       accumulated_depreciation_account_name, depreciation_expense_account_id,
       depreciation_expense_account_code, depreciation_expense_account_name,
       department_id, department_code, department_name, project_id, project_code,
       project_name, is_active, version, created_by, created_by_name, updated_by,
       updated_by_name, created_at::TEXT AS created_at, updated_at::TEXT AS updated_at,
       deleted_at::TEXT AS deleted_at
FROM fixed_assets
"#;

const RUN_SELECT: &str = r#"
SELECT id, run_number, period_id, period_name, period_start::TEXT AS period_start,
       period_end::TEXT AS period_end, posting_date::TEXT AS posting_date, status,
       asset_count, total_depreciation, journal_entry_id, reversal_journal_entry_id,
       reversal_reason, notes, version, created_by, created_by_name, posted_by,
       posted_by_name, posted_at::TEXT AS posted_at, reversed_by, reversed_by_name,
       reversed_at::TEXT AS reversed_at, created_at::TEXT AS created_at,
       updated_at::TEXT AS updated_at, deleted_at::TEXT AS deleted_at
FROM fixed_asset_depreciation_runs
"#;

const LINE_SELECT: &str = r#"
SELECT id, run_id, asset_id, asset_code, asset_name, asset_category,
       acquisition_cost, residual_value, regular_depreciation_amount,
       opening_accumulated_depreciation, opening_book_value, depreciation_amount,
       closing_accumulated_depreciation, closing_book_value, asset_account_id,
       asset_account_code, asset_account_name, accumulated_depreciation_account_id,
       accumulated_depreciation_account_code, accumulated_depreciation_account_name,
       depreciation_expense_account_id, depreciation_expense_account_code,
       depreciation_expense_account_name, department_id, department_code,
       department_name, project_id, project_code, project_name,
       created_at::TEXT AS created_at
FROM fixed_asset_depreciation_run_lines
"#;

pub async fn list_fixed_assets(
    pool: &PgPool,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<FixedAssetDto>, sqlx::Error> {
    sqlx::query_as::<_, FixedAssetDto>(sqlx::AssertSqlSafe(format!(
        "{} WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1::TIMESTAMPTZ) ORDER BY updated_at, id LIMIT $2",
        ASSET_SELECT
    )))
    .bind(updated_after)
    .bind(limit.unwrap_or(500).clamp(1, 1000))
    .fetch_all(pool)
    .await
}

pub async fn get_fixed_asset(
    pool: &PgPool,
    id: &str,
) -> Result<Option<FixedAssetDto>, sqlx::Error> {
    sqlx::query_as::<_, FixedAssetDto>(sqlx::AssertSqlSafe(format!(
        "{} WHERE id = $1",
        ASSET_SELECT
    )))
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_fixed_asset(
    pool: &PgPool,
    input: FixedAssetDto,
) -> Result<FixedAssetDto, sqlx::Error> {
    let id = input.id.clone();
    let payload =
        serde_json::to_value(input).map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
    sqlx::query(r#"
        INSERT INTO fixed_assets
        SELECT * FROM jsonb_populate_record(NULL::fixed_assets, $1::JSONB)
        ON CONFLICT (id) DO UPDATE SET
          asset_code = EXCLUDED.asset_code, name = EXCLUDED.name, category = EXCLUDED.category,
          location = EXCLUDED.location, description = EXCLUDED.description,
          registration_type = EXCLUDED.registration_type, acquisition_date = EXCLUDED.acquisition_date,
          available_for_use_date = EXCLUDED.available_for_use_date, acquisition_cost = EXCLUDED.acquisition_cost,
          residual_value = EXCLUDED.residual_value, useful_life_months = EXCLUDED.useful_life_months,
          depreciation_method = EXCLUDED.depreciation_method, depreciation_start_date = EXCLUDED.depreciation_start_date,
          regular_depreciation_amount = EXCLUDED.regular_depreciation_amount, opening_balance_date = EXCLUDED.opening_balance_date,
          opening_accumulated_depreciation = EXCLUDED.opening_accumulated_depreciation,
          opening_remaining_useful_life_months = EXCLUDED.opening_remaining_useful_life_months,
          asset_account_id = EXCLUDED.asset_account_id, asset_account_code = EXCLUDED.asset_account_code,
          asset_account_name = EXCLUDED.asset_account_name,
          accumulated_depreciation_account_id = EXCLUDED.accumulated_depreciation_account_id,
          accumulated_depreciation_account_code = EXCLUDED.accumulated_depreciation_account_code,
          accumulated_depreciation_account_name = EXCLUDED.accumulated_depreciation_account_name,
          depreciation_expense_account_id = EXCLUDED.depreciation_expense_account_id,
          depreciation_expense_account_code = EXCLUDED.depreciation_expense_account_code,
          depreciation_expense_account_name = EXCLUDED.depreciation_expense_account_name,
          department_id = EXCLUDED.department_id, department_code = EXCLUDED.department_code,
          department_name = EXCLUDED.department_name, project_id = EXCLUDED.project_id,
          project_code = EXCLUDED.project_code, project_name = EXCLUDED.project_name,
          is_active = EXCLUDED.is_active, version = EXCLUDED.version, updated_by = EXCLUDED.updated_by,
          updated_by_name = EXCLUDED.updated_by_name, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.version > fixed_assets.version
           OR (EXCLUDED.version = fixed_assets.version AND EXCLUDED.updated_at >= fixed_assets.updated_at)
    "#)
    .bind(payload)
    .execute(pool)
    .await?;
    get_fixed_asset(pool, &id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

async fn get_run(
    pool: &PgPool,
    id: &str,
) -> Result<Option<FixedAssetDepreciationRunDto>, sqlx::Error> {
    sqlx::query_as::<_, FixedAssetDepreciationRunDto>(sqlx::AssertSqlSafe(format!(
        "{} WHERE id = $1",
        RUN_SELECT
    )))
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn list_lines(
    pool: &PgPool,
    run_id: &str,
) -> Result<Vec<FixedAssetDepreciationRunLineDto>, sqlx::Error> {
    sqlx::query_as::<_, FixedAssetDepreciationRunLineDto>(sqlx::AssertSqlSafe(format!(
        "{} WHERE run_id = $1 ORDER BY asset_code",
        LINE_SELECT
    )))
    .bind(run_id)
    .fetch_all(pool)
    .await
}

pub async fn list_run_bundles(
    pool: &PgPool,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<FixedAssetDepreciationRunBundleDto>, sqlx::Error> {
    let runs = sqlx::query_as::<_, FixedAssetDepreciationRunDto>(sqlx::AssertSqlSafe(format!(
        "{} WHERE ($1::TIMESTAMPTZ IS NULL OR updated_at > $1::TIMESTAMPTZ) ORDER BY updated_at, id LIMIT $2",
        RUN_SELECT
    ))).bind(updated_after).bind(limit.unwrap_or(300).clamp(1, 500)).fetch_all(pool).await?;
    let mut result = Vec::with_capacity(runs.len());
    for run in runs {
        let lines = list_lines(pool, &run.id).await?;
        result.push(FixedAssetDepreciationRunBundleDto { run, lines });
    }
    Ok(result)
}

pub async fn get_run_bundle(
    pool: &PgPool,
    id: &str,
) -> Result<Option<FixedAssetDepreciationRunBundleDto>, sqlx::Error> {
    let Some(run) = get_run(pool, id).await? else {
        return Ok(None);
    };
    let lines = list_lines(pool, id).await?;
    Ok(Some(FixedAssetDepreciationRunBundleDto { run, lines }))
}

pub async fn upsert_run_bundle(
    pool: &PgPool,
    input: FixedAssetDepreciationRunBundleDto,
) -> Result<FixedAssetDepreciationRunBundleDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let run_id = input.run.id.clone();
    let run_payload =
        serde_json::to_value(input.run).map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
    let affected = sqlx::query(r#"
        INSERT INTO fixed_asset_depreciation_runs
        SELECT * FROM jsonb_populate_record(NULL::fixed_asset_depreciation_runs, $1::JSONB)
        ON CONFLICT (id) DO UPDATE SET
          run_number = EXCLUDED.run_number, period_id = EXCLUDED.period_id, period_name = EXCLUDED.period_name,
          period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end, posting_date = EXCLUDED.posting_date,
          status = EXCLUDED.status, asset_count = EXCLUDED.asset_count, total_depreciation = EXCLUDED.total_depreciation,
          journal_entry_id = EXCLUDED.journal_entry_id, reversal_journal_entry_id = EXCLUDED.reversal_journal_entry_id,
          reversal_reason = EXCLUDED.reversal_reason, notes = EXCLUDED.notes, version = EXCLUDED.version,
          posted_by = EXCLUDED.posted_by, posted_by_name = EXCLUDED.posted_by_name, posted_at = EXCLUDED.posted_at,
          reversed_by = EXCLUDED.reversed_by, reversed_by_name = EXCLUDED.reversed_by_name, reversed_at = EXCLUDED.reversed_at,
          updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at
        WHERE EXCLUDED.version > fixed_asset_depreciation_runs.version
           OR (EXCLUDED.version = fixed_asset_depreciation_runs.version AND EXCLUDED.updated_at >= fixed_asset_depreciation_runs.updated_at)
    "#).bind(run_payload).execute(&mut *tx).await?.rows_affected();

    if affected > 0 {
        sqlx::query("DELETE FROM fixed_asset_depreciation_run_lines WHERE run_id = $1")
            .bind(&run_id)
            .execute(&mut *tx)
            .await?;
        for line in input.lines {
            let payload =
                serde_json::to_value(line).map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
            sqlx::query("INSERT INTO fixed_asset_depreciation_run_lines SELECT * FROM jsonb_populate_record(NULL::fixed_asset_depreciation_run_lines, $1::JSONB)")
                .bind(payload).execute(&mut *tx).await?;
        }
    }
    tx.commit().await?;
    get_run_bundle(pool, &run_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

#[allow(dead_code)]
async fn _transaction_type_marker(_: &mut Transaction<'_, Postgres>) {}
