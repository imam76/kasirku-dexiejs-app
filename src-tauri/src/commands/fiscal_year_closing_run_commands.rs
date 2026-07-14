use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::fiscal_year_closing_run::FiscalYearClosingRunDto,
    repositories::fiscal_year_closing_run_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_fiscal_year_closing_runs(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<FiscalYearClosingRunDto>> {
    let pool = state.pool()?;
    Ok(fiscal_year_closing_run_repository::list_fiscal_year_closing_runs(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_fiscal_year_closing_run(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<FiscalYearClosingRunDto>> {
    let pool = state.pool()?;
    Ok(fiscal_year_closing_run_repository::get_fiscal_year_closing_run(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_fiscal_year_closing_run(
    state: State<'_, PostgresState>,
    input: FiscalYearClosingRunDto,
) -> PostgresCommandResult<FiscalYearClosingRunDto> {
    let pool = state.pool()?;
    Ok(fiscal_year_closing_run_repository::upsert_fiscal_year_closing_run(&pool, input).await?)
}
