use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::hr::{
        EmployeeSalaryComponentDto, EmploymentContractDto, HrPositionDto, SalaryComponentDto,
    },
    repositories::hr_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_hr_positions(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<HrPositionDto>> {
    Ok(hr_repository::list_hr_positions(&state.pool()?, updated_after, cursor_id, limit).await?)
}

#[tauri::command]
pub async fn postgres_upsert_hr_position(
    state: State<'_, PostgresState>,
    input: HrPositionDto,
) -> PostgresCommandResult<HrPositionDto> {
    Ok(hr_repository::upsert_hr_position(&state.pool()?, input).await?)
}

#[tauri::command]
pub async fn postgres_list_employment_contracts(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<EmploymentContractDto>> {
    Ok(
        hr_repository::list_employment_contracts(&state.pool()?, updated_after, cursor_id, limit)
            .await?,
    )
}

#[tauri::command]
pub async fn postgres_upsert_employment_contract(
    state: State<'_, PostgresState>,
    input: EmploymentContractDto,
) -> PostgresCommandResult<EmploymentContractDto> {
    Ok(hr_repository::upsert_employment_contract(&state.pool()?, input).await?)
}

#[tauri::command]
pub async fn postgres_list_salary_components(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<SalaryComponentDto>> {
    Ok(
        hr_repository::list_salary_components(&state.pool()?, updated_after, cursor_id, limit)
            .await?,
    )
}

#[tauri::command]
pub async fn postgres_upsert_salary_component(
    state: State<'_, PostgresState>,
    input: SalaryComponentDto,
) -> PostgresCommandResult<SalaryComponentDto> {
    Ok(hr_repository::upsert_salary_component(&state.pool()?, input).await?)
}

#[tauri::command]
pub async fn postgres_list_employee_salary_components(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<EmployeeSalaryComponentDto>> {
    Ok(hr_repository::list_employee_salary_components(
        &state.pool()?,
        updated_after,
        cursor_id,
        limit,
    )
    .await?)
}

#[tauri::command]
pub async fn postgres_upsert_employee_salary_component(
    state: State<'_, PostgresState>,
    input: EmployeeSalaryComponentDto,
) -> PostgresCommandResult<EmployeeSalaryComponentDto> {
    Ok(hr_repository::upsert_employee_salary_component(&state.pool()?, input).await?)
}
