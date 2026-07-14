use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::payroll::{EmployeeCashAdvanceBundleDto, PayrollRunBundleDto},
    repositories::payroll_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_payroll_run_bundles(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<PayrollRunBundleDto>> {
    let pool = state.pool()?;
    Ok(payroll_repository::list_payroll_run_bundles(&pool, updated_after, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_payroll_run_bundle(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<PayrollRunBundleDto>> {
    let pool = state.pool()?;
    Ok(payroll_repository::get_payroll_run_bundle(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_payroll_run_bundle(
    state: State<'_, PostgresState>,
    input: PayrollRunBundleDto,
) -> PostgresCommandResult<PayrollRunBundleDto> {
    let pool = state.pool()?;
    Ok(payroll_repository::upsert_payroll_run_bundle(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_employee_cash_advance_bundles(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<EmployeeCashAdvanceBundleDto>> {
    let pool = state.pool()?;
    Ok(payroll_repository::list_employee_cash_advance_bundles(&pool, updated_after, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_employee_cash_advance_bundle(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<EmployeeCashAdvanceBundleDto>> {
    let pool = state.pool()?;
    Ok(payroll_repository::get_employee_cash_advance_bundle(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_employee_cash_advance_bundle(
    state: State<'_, PostgresState>,
    input: EmployeeCashAdvanceBundleDto,
) -> PostgresCommandResult<EmployeeCashAdvanceBundleDto> {
    let pool = state.pool()?;
    Ok(payroll_repository::upsert_employee_cash_advance_bundle(&pool, input).await?)
}
