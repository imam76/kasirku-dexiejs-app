use crate::{
    models::finance_transaction::FinanceTransactionDto,
    repositories::finance_transaction_repository,
};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_finance_transactions(
    pool: State<'_, PgPool>,
) -> Result<Vec<FinanceTransactionDto>, String> {
    finance_transaction_repository::list_finance_transactions(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_get_finance_transaction(
    pool: State<'_, PgPool>,
    id: String,
) -> Result<Option<FinanceTransactionDto>, String> {
    finance_transaction_repository::get_finance_transaction(&pool, id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_finance_transaction(
    pool: State<'_, PgPool>,
    input: FinanceTransactionDto,
) -> Result<FinanceTransactionDto, String> {
    finance_transaction_repository::upsert_finance_transaction(&pool, input)
        .await
        .map_err(|error| error.to_string())
}
