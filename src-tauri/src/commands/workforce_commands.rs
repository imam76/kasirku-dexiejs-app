use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::workforce::{
        AuthorizedCompanyCalendarDayDto, AuthorizedEmployeeWorkScheduleAssignmentDto,
        AuthorizedLeaveBalanceLedgerDto, AuthorizedLeaveTypeDto, CancelApprovedLeaveRequestDto,
        FinalizeLeaveRequestDto, ResolveCollectionCoverageDto, UpsertLeaveWorkflowDto,
        WorkScheduleTemplateBundleDto, WorkforceStateDto,
    },
    repositories::workforce_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_workforce_state(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<WorkforceStateDto> {
    let pool = state.pool()?;
    Ok(workforce_repository::list_workforce_state(&pool).await?)
}

#[tauri::command]
pub async fn postgres_upsert_work_schedule_template_bundle(
    state: State<'_, PostgresState>,
    input: WorkScheduleTemplateBundleDto,
) -> PostgresCommandResult<()> {
    let pool = state.pool()?;
    workforce_repository::upsert_work_schedule_template_bundle(&pool, input).await?;
    Ok(())
}

#[tauri::command]
pub async fn postgres_upsert_employee_work_schedule_assignment(
    state: State<'_, PostgresState>,
    input: AuthorizedEmployeeWorkScheduleAssignmentDto,
) -> PostgresCommandResult<()> {
    let pool = state.pool()?;
    workforce_repository::upsert_employee_work_schedule_assignment(&pool, input).await?;
    Ok(())
}

#[tauri::command]
pub async fn postgres_upsert_company_calendar_day(
    state: State<'_, PostgresState>,
    input: AuthorizedCompanyCalendarDayDto,
) -> PostgresCommandResult<()> {
    let pool = state.pool()?;
    workforce_repository::upsert_company_calendar_day(&pool, input).await?;
    Ok(())
}

#[tauri::command]
pub async fn postgres_upsert_leave_type(
    state: State<'_, PostgresState>,
    input: AuthorizedLeaveTypeDto,
) -> PostgresCommandResult<()> {
    let pool = state.pool()?;
    workforce_repository::upsert_leave_type(&pool, input).await?;
    Ok(())
}

#[tauri::command]
pub async fn postgres_upsert_leave_balance_ledger(
    state: State<'_, PostgresState>,
    input: AuthorizedLeaveBalanceLedgerDto,
) -> PostgresCommandResult<()> {
    let pool = state.pool()?;
    workforce_repository::upsert_leave_balance_ledger(&pool, input).await?;
    Ok(())
}

#[tauri::command]
pub async fn postgres_upsert_leave_workflow(
    state: State<'_, PostgresState>,
    input: UpsertLeaveWorkflowDto,
) -> PostgresCommandResult<()> {
    let pool = state.pool()?;
    workforce_repository::upsert_leave_workflow(&pool, input).await?;
    Ok(())
}

#[tauri::command]
pub async fn postgres_finalize_leave_request(
    state: State<'_, PostgresState>,
    input: FinalizeLeaveRequestDto,
) -> PostgresCommandResult<()> {
    let pool = state.pool()?;
    workforce_repository::finalize_leave_request(&pool, input).await?;
    Ok(())
}

#[tauri::command]
pub async fn postgres_cancel_approved_leave_request(
    state: State<'_, PostgresState>,
    input: CancelApprovedLeaveRequestDto,
) -> PostgresCommandResult<()> {
    let pool = state.pool()?;
    workforce_repository::cancel_approved_leave_request(&pool, input).await?;
    Ok(())
}

#[tauri::command]
pub async fn postgres_resolve_collection_coverage(
    state: State<'_, PostgresState>,
    input: ResolveCollectionCoverageDto,
) -> PostgresCommandResult<()> {
    let pool = state.pool()?;
    workforce_repository::resolve_collection_coverage(&pool, input).await?;
    Ok(())
}
