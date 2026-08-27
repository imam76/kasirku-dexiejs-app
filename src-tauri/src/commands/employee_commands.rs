use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::employee::{EmployeeAreaDto, EmployeeCollectionScheduleDto, EmployeeDto},
    repositories::employee_repository,
};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_employees(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<EmployeeDto>> {
    let pool = state.pool()?;
    Ok(employee_repository::list_employees(&pool, updated_after, cursor_id, limit).await?)
}

#[tauri::command]
pub async fn postgres_get_employee(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<EmployeeDto>> {
    let pool = state.pool()?;
    Ok(employee_repository::get_employee(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_employee(
    state: State<'_, PostgresState>,
    input: EmployeeDto,
) -> PostgresCommandResult<EmployeeDto> {
    let pool = state.pool()?;
    Ok(employee_repository::upsert_employee(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_employee_areas(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<EmployeeAreaDto>> {
    let pool = state.pool()?;
    Ok(employee_repository::list_employee_areas(&pool, updated_after, cursor_id, limit).await?)
}

#[tauri::command]
pub async fn postgres_upsert_employee_area(
    state: State<'_, PostgresState>,
    input: EmployeeAreaDto,
) -> PostgresCommandResult<EmployeeAreaDto> {
    let pool = state.pool()?;
    Ok(employee_repository::upsert_employee_area(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_list_employee_collection_schedules(
    state: State<'_, PostgresState>,
    updated_after: Option<String>,
    cursor_id: Option<String>,
    limit: Option<i64>,
) -> PostgresCommandResult<Vec<EmployeeCollectionScheduleDto>> {
    let pool = state.pool()?;
    Ok(employee_repository::list_employee_collection_schedules(
        &pool,
        updated_after,
        cursor_id,
        limit,
    )
    .await?)
}

#[tauri::command]
pub async fn postgres_upsert_employee_collection_schedule(
    state: State<'_, PostgresState>,
    input: EmployeeCollectionScheduleDto,
) -> PostgresCommandResult<EmployeeCollectionScheduleDto> {
    let pool = state.pool()?;
    Ok(employee_repository::upsert_employee_collection_schedule(&pool, input).await?)
}
