use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::chart_of_account::ChartOfAccountDto,
    repositories::chart_of_account_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_chart_of_accounts(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<ChartOfAccountDto>> {
    let pool = state.pool()?;
    Ok(chart_of_account_repository::list_chart_of_accounts(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_chart_of_account(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<ChartOfAccountDto>> {
    let pool = state.pool()?;
    Ok(chart_of_account_repository::get_chart_of_account(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_chart_of_account(
    state: State<'_, PostgresState>,
    input: ChartOfAccountDto,
) -> PostgresCommandResult<ChartOfAccountDto> {
    let pool = state.pool()?;
    Ok(chart_of_account_repository::upsert_chart_of_account(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_chart_of_account(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<ChartOfAccountDto>> {
    let pool = state.pool()?;
    Ok(chart_of_account_repository::delete_chart_of_account(&pool, id).await?)
}
