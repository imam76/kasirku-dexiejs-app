use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::accounting_fiscal_year::AccountingFiscalYearDto,
    repositories::accounting_fiscal_year_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_accounting_fiscal_years(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<AccountingFiscalYearDto>> {
    let pool = state.pool()?;
    Ok(accounting_fiscal_year_repository::list_accounting_fiscal_years(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_accounting_fiscal_year(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<AccountingFiscalYearDto>> {
    let pool = state.pool()?;
    Ok(accounting_fiscal_year_repository::get_accounting_fiscal_year(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_accounting_fiscal_year(
    state: State<'_, PostgresState>,
    input: AccountingFiscalYearDto,
) -> PostgresCommandResult<AccountingFiscalYearDto> {
    let pool = state.pool()?;
    Ok(accounting_fiscal_year_repository::upsert_accounting_fiscal_year(&pool, input).await?)
}
