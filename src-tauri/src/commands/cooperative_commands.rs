use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::cooperative::{
        CooperativeLoanDto, CooperativeLoanInstallmentDto, CooperativeLoanPaymentDto,
        CooperativeMemberDto, CooperativeMemberSavingBalanceDto, CooperativeSavingTransactionDto,
    },
    repositories::cooperative_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_cooperative_members(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeMemberDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_members(pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_member(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeMemberDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_member(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_member(
    state: State<'_, PostgresState>,
    input: CooperativeMemberDto,
) -> PostgresCommandResult<CooperativeMemberDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_member(pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_saving_transactions(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeSavingTransactionDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_saving_transactions(pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_saving_transaction(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeSavingTransactionDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_saving_transaction(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_saving_transaction(
    state: State<'_, PostgresState>,
    input: CooperativeSavingTransactionDto,
) -> PostgresCommandResult<CooperativeSavingTransactionDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_saving_transaction(pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_member_saving_balances(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeMemberSavingBalanceDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_member_saving_balances(pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_member_saving_balance(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeMemberSavingBalanceDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_member_saving_balance(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_member_saving_balance(
    state: State<'_, PostgresState>,
    input: CooperativeMemberSavingBalanceDto,
) -> PostgresCommandResult<CooperativeMemberSavingBalanceDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_member_saving_balance(pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_loans(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeLoanDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_loans(pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_loan(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeLoanDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_loan(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_loan(
    state: State<'_, PostgresState>,
    input: CooperativeLoanDto,
) -> PostgresCommandResult<CooperativeLoanDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_loan(pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_loan_installments(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeLoanInstallmentDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_loan_installments(pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_loan_installment(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeLoanInstallmentDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_loan_installment(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_loan_installment(
    state: State<'_, PostgresState>,
    input: CooperativeLoanInstallmentDto,
) -> PostgresCommandResult<CooperativeLoanInstallmentDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_loan_installment(pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_loan_payments(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeLoanPaymentDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_loan_payments(pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_loan_payment(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeLoanPaymentDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_loan_payment(pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_loan_payment(
    state: State<'_, PostgresState>,
    input: CooperativeLoanPaymentDto,
) -> PostgresCommandResult<CooperativeLoanPaymentDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_loan_payment(pool, input).await?)
}
