use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::transaction::TransactionBundleDto,
    repositories::transaction_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_transaction_bundles(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<TransactionBundleDto>> {
    let pool = state.pool()?;
    Ok(transaction_repository::list_transaction_bundles(&pool, updated_after, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_transaction_bundle(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<TransactionBundleDto>> {
    let pool = state.pool()?;
    Ok(transaction_repository::get_transaction_bundle(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_transaction_bundle(
    state: State<'_, PostgresState>,
    input: TransactionBundleDto,
) -> PostgresCommandResult<TransactionBundleDto> {
    let pool = state.pool()?;
    Ok(transaction_repository::upsert_transaction_bundle(&pool, input).await?)
}
