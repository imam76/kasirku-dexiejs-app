use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::cooperative::{
        CooperativeAreaDto, CooperativeLoanCollectionEventDto, CooperativeLoanDto,
        CooperativeLoanInstallmentDto, CooperativeLoanPaymentDto, CooperativeMemberCodeDto,
        CooperativeMemberDto, CooperativeMemberSavingBalanceDto,
        CooperativePaymentApprovalRequestDto, CooperativePaymentInstallmentReconciliationDto,
        CooperativePostingAccountDto, CooperativeSavingTransactionDto,
        DecideCooperativePaymentApprovalInput, PostCooperativeLoanPaymentBatchOutcome,
        PostCooperativeLoanPaymentInput, PostCooperativeLoanPaymentOutcome,
        RecordCooperativeLoanCollectionEventInput, RecordCooperativeLoanCollectionEventResult,
        RegisterCooperativePostingAccountsInput, RequestCooperativeLoanPaymentReversalInput,
    },
    repositories::{cooperative_payment_repository, cooperative_repository},
};
use tauri::State;

fn cooperative_mutation_error(
    error: cooperative_payment_repository::CooperativeMutationError,
) -> crate::db::PostgresCommandError {
    use cooperative_payment_repository::CooperativeMutationError;

    let code = match &error {
        CooperativeMutationError::Invalid(_) => "cooperative_validation_error",
        CooperativeMutationError::Unauthorized(_) => "cooperative_unauthorized",
        CooperativeMutationError::NotFound(_) => "cooperative_not_found",
        CooperativeMutationError::Conflict(_) => "cooperative_conflict",
        CooperativeMutationError::Database(_) => "postgres_error",
    };

    crate::db::PostgresCommandError {
        code,
        status: None,
        message: error.to_string(),
    }
}

#[tauri::command]
pub async fn postgres_register_cooperative_posting_accounts(
    state: State<'_, PostgresState>,
    input: RegisterCooperativePostingAccountsInput,
) -> PostgresCommandResult<Vec<CooperativePostingAccountDto>> {
    let pool = state.pool()?;
    cooperative_payment_repository::register_posting_accounts(
        &pool,
        input.session_token,
        input.accounts,
    )
    .await
    .map_err(cooperative_mutation_error)
}

#[tauri::command]
pub async fn postgres_post_cooperative_loan_payment(
    state: State<'_, PostgresState>,
    input: PostCooperativeLoanPaymentInput,
) -> PostgresCommandResult<PostCooperativeLoanPaymentOutcome> {
    let pool = state.pool()?;
    cooperative_payment_repository::post_loan_payment(&pool, input)
        .await
        .map_err(cooperative_mutation_error)
}

#[tauri::command]
pub async fn postgres_post_cooperative_loan_payment_batch(
    state: State<'_, PostgresState>,
    input: PostCooperativeLoanPaymentInput,
) -> PostgresCommandResult<PostCooperativeLoanPaymentBatchOutcome> {
    let pool = state.pool()?;
    cooperative_payment_repository::post_loan_payment_batch(&pool, input)
        .await
        .map_err(cooperative_mutation_error)
}

#[tauri::command]
pub async fn postgres_list_cooperative_payment_approval_requests(
    state: State<'_, PostgresState>,
    session_token: String,
) -> PostgresCommandResult<Vec<CooperativePaymentApprovalRequestDto>> {
    let pool = state.pool()?;
    cooperative_payment_repository::list_payment_approval_requests(&pool, session_token)
        .await
        .map_err(cooperative_mutation_error)
}

#[tauri::command]
pub async fn postgres_request_cooperative_payment_reversal(
    state: State<'_, PostgresState>,
    input: RequestCooperativeLoanPaymentReversalInput,
) -> PostgresCommandResult<CooperativePaymentApprovalRequestDto> {
    let pool = state.pool()?;
    cooperative_payment_repository::request_payment_reversal(&pool, input)
        .await
        .map_err(cooperative_mutation_error)
}

#[tauri::command]
pub async fn postgres_approve_cooperative_payment_request(
    state: State<'_, PostgresState>,
    input: DecideCooperativePaymentApprovalInput,
) -> PostgresCommandResult<CooperativePaymentApprovalRequestDto> {
    let pool = state.pool()?;
    cooperative_payment_repository::approve_payment_request(&pool, input)
        .await
        .map_err(cooperative_mutation_error)
}

#[tauri::command]
pub async fn postgres_reject_cooperative_payment_request(
    state: State<'_, PostgresState>,
    input: DecideCooperativePaymentApprovalInput,
) -> PostgresCommandResult<CooperativePaymentApprovalRequestDto> {
    let pool = state.pool()?;
    cooperative_payment_repository::reject_payment_approval(&pool, input)
        .await
        .map_err(cooperative_mutation_error)
}

#[tauri::command]
pub async fn postgres_list_cooperative_payment_installment_reconciliation(
    state: State<'_, PostgresState>,
    session_token: String,
) -> PostgresCommandResult<Vec<CooperativePaymentInstallmentReconciliationDto>> {
    let pool = state.pool()?;
    cooperative_payment_repository::list_payment_installment_reconciliation(&pool, session_token)
        .await
        .map_err(cooperative_mutation_error)
}

#[tauri::command]
pub async fn postgres_list_cooperative_loan_collection_events(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeLoanCollectionEventDto>> {
    let pool = state.pool()?;
    cooperative_payment_repository::list_collection_events(&pool)
        .await
        .map_err(cooperative_mutation_error)
}

#[tauri::command]
pub async fn postgres_record_cooperative_loan_collection_event(
    state: State<'_, PostgresState>,
    input: RecordCooperativeLoanCollectionEventInput,
) -> PostgresCommandResult<RecordCooperativeLoanCollectionEventResult> {
    let pool = state.pool()?;
    cooperative_payment_repository::record_collection_event(&pool, input)
        .await
        .map_err(cooperative_mutation_error)
}

#[tauri::command]
pub async fn postgres_list_cooperative_areas(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeAreaDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_areas(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_area(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeAreaDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_area(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_area(
    state: State<'_, PostgresState>,
    input: CooperativeAreaDto,
) -> PostgresCommandResult<CooperativeAreaDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_area(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_members(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeMemberDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_members(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_member(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeMemberDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_member(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_member(
    state: State<'_, PostgresState>,
    input: CooperativeMemberDto,
) -> PostgresCommandResult<CooperativeMemberDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_member(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_member_codes(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeMemberCodeDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_member_codes(&pool).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_member_code(
    state: State<'_, PostgresState>,
    input: CooperativeMemberCodeDto,
) -> PostgresCommandResult<CooperativeMemberCodeDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_member_code(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_saving_transactions(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeSavingTransactionDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_saving_transactions(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_saving_transaction(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeSavingTransactionDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_saving_transaction(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_saving_transaction(
    state: State<'_, PostgresState>,
    input: CooperativeSavingTransactionDto,
) -> PostgresCommandResult<CooperativeSavingTransactionDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_saving_transaction(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_member_saving_balances(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeMemberSavingBalanceDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_member_saving_balances(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_member_saving_balance(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeMemberSavingBalanceDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_member_saving_balance(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_member_saving_balance(
    state: State<'_, PostgresState>,
    input: CooperativeMemberSavingBalanceDto,
) -> PostgresCommandResult<CooperativeMemberSavingBalanceDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_member_saving_balance(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_loans(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeLoanDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_loans(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_loan(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeLoanDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_loan(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_loan(
    state: State<'_, PostgresState>,
    input: CooperativeLoanDto,
) -> PostgresCommandResult<CooperativeLoanDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_loan(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_cooperative_loan_application(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<bool> {
    let pool = state.pool()?;
    Ok(cooperative_repository::delete_cooperative_loan_application(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_delete_cooperative_loan_migration(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<bool> {
    let pool = state.pool()?;
    Ok(cooperative_repository::delete_cooperative_loan_migration(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_loan_installments(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeLoanInstallmentDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_loan_installments(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_loan_installment(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeLoanInstallmentDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_loan_installment(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_loan_installment(
    state: State<'_, PostgresState>,
    input: CooperativeLoanInstallmentDto,
) -> PostgresCommandResult<CooperativeLoanInstallmentDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_loan_installment(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_cooperative_loan_payments(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CooperativeLoanPaymentDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::list_cooperative_loan_payments(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_cooperative_loan_payment(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CooperativeLoanPaymentDto>> {
    let pool = state.pool()?;
    Ok(cooperative_repository::get_cooperative_loan_payment(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_cooperative_loan_payment(
    state: State<'_, PostgresState>,
    input: CooperativeLoanPaymentDto,
) -> PostgresCommandResult<CooperativeLoanPaymentDto> {
    let pool = state.pool()?;
    Ok(cooperative_repository::upsert_cooperative_loan_payment(&pool, input).await?)
}
