use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::accounting_period::AccountingPeriodDto,
    repositories::accounting_period_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_accounting_periods(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<AccountingPeriodDto>> {
    let pool = state.pool()?;
    Ok(accounting_period_repository::list_accounting_periods(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_accounting_period(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<AccountingPeriodDto>> {
    let pool = state.pool()?;
    Ok(accounting_period_repository::get_accounting_period(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_accounting_period(
    state: State<'_, PostgresState>,
    input: AccountingPeriodDto,
) -> PostgresCommandResult<AccountingPeriodDto> {
    let pool = state.pool()?;
    Ok(accounting_period_repository::upsert_accounting_period(&pool, input).await?)
}
