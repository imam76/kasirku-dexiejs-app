use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::cashier_session::CashierSessionDto,
    repositories::cashier_session_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_cashier_sessions(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CashierSessionDto>> {
    let pool = state.pool()?;
    Ok(cashier_session_repository::list_cashier_sessions(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cashier_session(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CashierSessionDto>> {
    let pool = state.pool()?;
    Ok(cashier_session_repository::get_cashier_session(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cashier_session(
    state: State<'_, PostgresState>,
    input: CashierSessionDto,
) -> PostgresCommandResult<CashierSessionDto> {
    let pool = state.pool()?;
    Ok(cashier_session_repository::upsert_cashier_session(&pool, input).await?)
}
