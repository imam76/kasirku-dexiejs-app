use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::cash_bank_reconciliation::CashBankReconciliationDto,
    repositories::cash_bank_reconciliation_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_cash_bank_reconciliations(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CashBankReconciliationDto>> {
    let pool = state.pool()?;
    Ok(cash_bank_reconciliation_repository::list_cash_bank_reconciliations(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cash_bank_reconciliation(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CashBankReconciliationDto>> {
    let pool = state.pool()?;
    Ok(cash_bank_reconciliation_repository::get_cash_bank_reconciliation(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cash_bank_reconciliation(
    state: State<'_, PostgresState>,
    input: CashBankReconciliationDto,
) -> PostgresCommandResult<CashBankReconciliationDto> {
    let pool = state.pool()?;
    Ok(cash_bank_reconciliation_repository::upsert_cash_bank_reconciliation(&pool, input).await?)
}
