use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::finance_transaction::FinanceTransactionDto,
    repositories::finance_transaction_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_finance_transactions(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<FinanceTransactionDto>> {
    let pool = state.pool()?;
    Ok(finance_transaction_repository::list_finance_transactions(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_finance_transaction(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<FinanceTransactionDto>> {
    let pool = state.pool()?;
    Ok(finance_transaction_repository::get_finance_transaction(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_finance_transaction(
    state: State<'_, PostgresState>,
    input: FinanceTransactionDto,
) -> PostgresCommandResult<FinanceTransactionDto> {
    let pool = state.pool()?;
    Ok(finance_transaction_repository::upsert_finance_transaction(&pool, input).await?)
}
